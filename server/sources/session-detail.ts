// Adaptado de marmottajr/habblaud@faa1a01 server/sources/transcript.ts + server/http/sessions.ts (MIT)
// Detalhe de uma sessão (GET /api/session/:id, somente leitura): lê SÓ o fim do transcript
// JSONL (stream, teto MAX_DETAIL_BYTES) e monta um resumo — últimas N ações, tokens, modelo,
// contagem de ferramentas e subagentes — SEM conteúdo bruto: cada ação traz `tool`, `at`,
// `error` e o texto curto (≤46 c) que shared/activity.ts já produz; o campo `detail`
// (comando completo, caminho, consulta…) nunca sai daqui, e nem o prompt/título.
// O parser e a leitura em stream reaproveitam parseLine/scanPrefix de transcript.ts — nada
// de leitura inteira do arquivo nem de copiar o estado do watcher.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import {
  createTranscriptState,
  parseLine,
  scanPrefix,
  type ParsedActivity,
  type SpawnInfo,
  type TranscriptState,
} from './transcript';
import { LineBuffer, warnOversizedLine } from './tail';
import { errMsg, log } from '../log';
import { tr } from '../../shared/i18n';

/** Teto da janela lida (o resto do arquivo é ignorado, sinalizado em `truncated`). */
export const MAX_DETAIL_BYTES = 4 * 1024 * 1024;
/** Janela deslizante de ações mantida durante a leitura (a resposta devolve as últimas `limit`). */
const WINDOW_ACTIONS = 200;
/** Máximo de linhas do transcript (o teto da própria LineBuffer). */
const MAX_LINES = 2000;

/** Uma ação da sessão: o que a listagem do painel mostra — sem `detail`, sem prompt. */
export interface SessionAction {
  /** Nome bruto da ferramenta, quando a ação veio de uma tool_use. */
  tool?: string;
  /** Epoch ms. */
  at: number;
  /** A ação é um erro de ferramenta. */
  error: boolean;
  /** Texto curto em PT-BR (≤46 c, já truncado/mascarado pelo shared/activity). */
  text: string;
}

/** Subagente disparado pela sessão (hierarquia plana: um nível, pelo transcript principal). */
export interface SessionSubagent {
  /** 'Agent' | 'Task' | 'Workflow'. */
  tool: string;
  description?: string;
  subagentType?: string;
  background: boolean;
  at: number;
}

/** Resumo montado a partir das linhas lidas (função pura: testável sem disco). */
export interface SessionDetail {
  /** Ações mais recentes primeiro (as últimas `limit`). */
  actions: SessionAction[];
  /** Quantas a janela teve (antes do recorte por limit). */
  actionsTotal: number;
  tokens: { in: number; out: number };
  toolCalls: number;
  model?: string;
  subagents: SessionSubagent[];
  /** O arquivo passou do teto: a leitura cobriu só a janela final. */
  truncated: boolean;
}

export interface DetailOptions {
  /** Quantas ações devolver (janela interna maior que isso; teto 200). */
  limit?: number;
  /** Teto da janela lida (padrão MAX_DETAIL_BYTES; só os testes usam outro). */
  maxBytes?: number;
}

/** Converte uma atividade do parser numa ação do painel (corta `detail` e `questions`). */
export function actionOf(a: ParsedActivity): SessionAction {
  const out: SessionAction = {
    tool: a.activity.tool,
    at: a.activity.at,
    error: a.activity.error === true,
    text: a.activity.text,
  };
  return out;
}

/**
 * Função pura: monta o resumo a partir do que a leitura trouxe — janela de ações,
 * subagentes (por toolUseId, na ordem de spawn), tokens, ferramentas, modelo.
 */
export function montarResumoSession(
  read: { activities: SessionAction[]; spawns: SpawnInfo[]; state: TranscriptState; truncated: boolean },
  limit: number,
): SessionDetail {
  const window = read.activities.slice(-Math.max(1, Math.min(limit, MAX_LINES)));
  const actions = [...window].reverse(); // mais recentes primeiro
  const subagents: SessionSubagent[] = [];
  const seen = new Set<string>();
  for (const s of read.spawns) {
    if (seen.has(s.toolUseId)) continue;
    seen.add(s.toolUseId);
    subagents.push({ tool: s.tool, description: s.description, subagentType: s.subagentType, background: s.background, at: s.at });
  }
  const stats = read.state.stats;
  return {
    actions,
    actionsTotal: read.activities.length,
    tokens: { in: stats.tokensIn, out: stats.tokensOut },
    toolCalls: stats.toolCalls,
    model: read.state.model,
    subagents,
    truncated: read.truncated,
  };
}

/**
 * Lê o fim do transcript (`path`) e devolve o material bruto do resumo (o parser, não a resposta).
 *
 * Arquivo maior que `maxBytes`: lê o prefixo [0, fim-da-janela) SÓ com scanPrefix — sinais de
 * ferramenta e títulos que o parser guarda (toolCalls, subagents) e o fim, em stream.
 * Uso de tokens NÃO é mesclado do prefixo: as mensagens se repetem em linhas com uso parcial e,
 * sem o skipUsage do watcher, mesclar os dois estados double-countaria — por isso, truncado,
 * `tokens` cobre só a janela final (documentado em `truncated`).
 */
export async function readSessionDetail(
  path: string,
  opts: DetailOptions = {},
): Promise<{ detail: SessionDetail | undefined; error?: string }> {
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 200));
  const maxBytes = opts.maxBytes ?? MAX_DETAIL_BYTES;
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return { detail: undefined, error: tr('transcript não encontrado') };
  }
  const truncated = size > maxBytes;
  const state = createTranscriptState();
  const spawns: SpawnInfo[] = [];
  let activities: SessionAction[] = [];

  if (truncated) {
    // Prefixo (antes da janela): sem ações (as primeiras N cabem no fim do arquivo, perto do boot
    // real do transcript — o recorte pela janela mantém as mais recentes).
    const end = Math.max(0, size - maxBytes);
    let prefix: Awaited<ReturnType<typeof scanPrefix>>;
    try {
      // Uso de tokens do prefixo NÃO entra na resposta (evita double-count com a janela):
      // mergeInto só soma toolCalls/subagents, então skipUsage pode ser vazio.
      prefix = await scanPrefix(path, end, new Set());
    } catch (err) {
      log.warnOnce(`session-detail:${path}`, tr('Detalhe de sessão: prefixo ilegível ({0}).', [errMsg(err)]));
      prefix = { state: createTranscriptState(), signals: [], activities: [], shellEvents: [] };
    }
    mergeInto(state, prefix.state);
  }

  const consume = (line: string): void => {
    const r = parseLine(state, line, { idPrefix: '', now: Date.now() });
    for (const sig of r.signals) if (sig.type === 'spawn') spawns.push(sig.spawn);
    for (const pa of r.activities) activities.push(actionOf(pa));
    if (activities.length > WINDOW_ACTIONS * 2) activities = activities.slice(-WINDOW_ACTIONS);
  };

  // Janela final em stream (sem bloquear o event loop); a linha cortada no fim é descartada.
  const stream = createReadStream(path, { ...(truncated ? { start: size - maxBytes } : {}), highWaterMark: 1024 * 1024 });
  const pending = new LineBuffer();
  try {
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      const fed = pending.push(chunk);
      if (fed.discarded) warnOversizedLine(path);
      for (const buf of fed.lines) {
        const line = buf.toString('utf8');
        if (line) consume(line);
      }
    }
  } catch (err) {
    return { detail: undefined, error: tr('transcript ilegível: {0}', [errMsg(err)]) };
  }

  return { detail: montarResumoSession({ activities, spawns, state, truncated }, limit) };
}

/**
 * Soma no estado da janela o que o prefixo trouxe (ferramentas, subagentes, custo, modelo).
 * Tokens ficam APENAS da janela: uso de mensagem se repete entre prefixo e janela com valores
 * parciais, e sem o skipUsage do watcher mesclar os dois estados double-countaria.
 */
function mergeInto(dst: TranscriptState, src: TranscriptState): void {
  dst.model ??= src.model;
  dst.customTitle ??= src.customTitle;
  dst.agentName ??= src.agentName;
  dst.aiTitle ??= src.aiTitle;
  dst.lastPrompt ??= src.lastPrompt;
  if (src.firstAt !== undefined && (dst.firstAt === undefined || src.firstAt < dst.firstAt)) dst.firstAt = src.firstAt;
  dst.stats.toolCalls += src.stats.toolCalls;
  dst.stats.subagents += src.stats.subagents;
  if (!dst.costSeen && src.costSeen) {
    dst.costSeen = true;
    dst.stats.costUSD ??= src.stats.costUSD;
    dst.stats.linesAdded ??= src.stats.linesAdded;
    dst.stats.linesRemoved ??= src.stats.linesRemoved;
  }
}
