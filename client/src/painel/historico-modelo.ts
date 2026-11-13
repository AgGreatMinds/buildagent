// Adaptado de marmottajr/habblaud@faa1a01 client/src/ui/history.ts (MIT)
// "Histórico": modelo puro do diálogo (sem DOM), testado em historico-modelo.test.ts.
// A rota GET /api/history (tarefa s2-historico) ainda não existe: o contrato local
// mínimo fica aqui — parseHistorico valida a resposta e ignora o que não tem chave
// (sessionId + lastAt). Resposta ausente/404 vira [] e o diálogo mostra
// "Sem sessões ainda" (tratamento em historico.ts).
// Cortes da referência: chips de conta / filtro por conta (os dados de conta ficam
// em uso.ts) e a abertura de terminal/conversa — o diálogo é somente leitura.
import type { Provider } from '../../../shared/types';
import { formatarTempoAgente } from './meudia-modelo';
import { texto } from './texto';

/**
 * Sessão do histórico — contrato local mínimo da rota s2. Os campos opcionais
 * (duracaoMs/statusFinal) só existem quando o contrato final trouxer; a tela
 * mostra apenas o que vier. `provedor` ausente = 'claude' (mesma convenção do
 * snapshot de AgentInfo em shared/types.ts).
 */
export interface SessaoHistorica {
  /** = `sessionId` da fonte (chave única da sessão). */
  id: string;
  /** Última atividade, epoch ms (agrupa o dia e alimenta a linha de meta). */
  data: number;
  /** Projeto (nome da sala/cwd), quando conhecido. */
  projeto?: string;
  /** Título da sessão (/rename > nome do agente > último prompt). */
  titulo?: string;
  /** Duração total em ms, quando o contrato trouxer. */
  duracaoMs?: number;
  /** Status final ("concluída", "encerrada"…), quando o contrato trouxer. */
  statusFinal?: string;
  provedor: Provider;
}

function txt(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Sessões válidas da resposta de GET /api/history (o resto é ignorado), da mais recente para a mais antiga. */
export function parseHistorico(raw: unknown): SessaoHistorica[] {
  const lista = raw && typeof raw === 'object' ? (raw as { sessions?: unknown }).sessions : undefined;
  if (!Array.isArray(lista)) return [];
  const saida: SessaoHistorica[] = [];
  for (const item of lista) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = txt(o.sessionId);
    const data = num(o.lastAt);
    if (!id || data === undefined) continue; // sem chave a sessão não entra
    const s: SessaoHistorica = { id, data, provedor: 'claude' };
    if (o.provider === 'codex' || o.provider === 'opencode' || o.provider === 'pi') s.provedor = o.provider;
    const titulo = txt(o.title);
    if (titulo) s.titulo = titulo;
    const projeto = txt(o.project) ?? txt(o.projectDir);
    if (projeto) s.projeto = projeto;
    const duracao = num(o.duracaoMs);
    const primeira = num(o.firstAt);
    // `duracaoMs` explícito ganha; senão, duração = janela de atividade.
    if (duracao !== undefined && duracao >= 0) s.duracaoMs = duracao;
    else if (primeira !== undefined && primeira <= data) s.duracaoMs = data - primeira;
    const status = txt(o.statusFinal);
    if (status) s.statusFinal = status;
    saida.push(s);
  }
  return saida.sort((a, b) => b.data - a.data);
}

/** Minúsculas sem acento: "relatorio" acha "Relatório". */
export function normalizarBusca(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * Busca por título/projeto/provedor (sem diferenciar maiúsculas nem acentos;
 * várias palavras = E) + filtro exato por status final (`''` = todos).
 */
export function filtrarSessoes(lista: readonly SessaoHistorica[], busca: string, statusFinal: string): SessaoHistorica[] {
  const termos = normalizarBusca(busca).split(/\s+/).filter(Boolean);
  return lista.filter((s) => {
    if (statusFinal && s.statusFinal !== statusFinal) return false;
    if (!termos.length) return true;
    // O rótulo de provedor (Claude/Codex/OpenCode) entra na busca: "codex" acha as duas grafias.
    const alvo = normalizarBusca([s.titulo ?? '', s.projeto ?? '', s.provedor, texto.provedor[s.provedor]].join(' '));
    return termos.every((t) => alvo.includes(t));
  });
}

/** Rótulo do dia: "Hoje", "Ontem" ou "Qui., 26 de out." (hora local). */
function rotuloDia(data: number, agora: number): string {
  const inicio = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const diff = Math.round((inicio(agora) - inicio(data)) / 86_400_000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  const label = DATA_CURTA.format(data);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const DATA_CURTA = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
const DATA_HORA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export interface DiaSessao {
  /** Início do dia (hora local), estável para a lista. */
  chave: number;
  rotulo: string;
  sessoes: SessaoHistorica[];
}

/** Agrupa por dia da última atividade (hora local), do dia mais recente para o mais antigo. */
export function agruparPorDia(lista: readonly SessaoHistorica[], agora: number): DiaSessao[] {
  const dias = new Map<number, DiaSessao>();
  for (const s of lista) {
    const d = new Date(s.data);
    d.setHours(0, 0, 0, 0);
    const chave = d.getTime();
    let dia = dias.get(chave);
    if (!dia) {
      dia = { chave, rotulo: rotuloDia(s.data, agora), sessoes: [] };
      dias.set(chave, dia);
    }
    dia.sessoes.push(s);
  }
  return [...dias.values()].sort((a, b) => b.chave - a.chave);
}

/** Data + hora local: "30 de out. 14:32". */
export function formatarData(ts: number): string {
  return DATA_HORA.format(ts);
}

/** Duração exibida: a mesma régua de "Meu dia" ("12 s", "3 min", "2 h 10 min"). */
export const formatarDuracao = formatarTempoAgente;
