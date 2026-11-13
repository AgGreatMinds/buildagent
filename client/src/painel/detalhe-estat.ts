// Lógica pura da gaveta de detalhe —
// formatadores da seção de Estatísticas e as regras da Vida social.
// A Vida social é brincadeira local (calculada no cliente; a tela diz "simulado,
// só pra diversão") — nada aqui toca shared/world nem server.
// Sem DOM e sem relógio global: `agora` entra sempre por parâmetro.
import type { Activity, AgentStatus } from '../../../shared/types';
import { hashFNV1a } from '../vida/social';

/** Ids dos traços que a Vida social exibe (emoji + rótulo + dica vivem em texto.ts). */
export type TracaoId = 'mao-na-massa' | 'competicao' | 'foco' | 'sonecas';

const INT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const DEC1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const MESES = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];

/** Inteiro com separador de milhar pt-BR: "12.345". */
export function formatarInt(n: number): string {
  return INT.format(Math.max(0, Math.round(n)));
}

/** Tokens compactos: "850" · "1,2 k" · "2,2 M". */
export function formatarTokensCompacto(n: number): string {
  const v = Math.max(0, n);
  if (v < 1_000) return INT.format(v);
  if (v < 1_000_000) return `${DEC1.format(v / 1_000)} k`;
  return `${DEC1.format(v / 1_000_000)} M`;
}

/** Sessão para exibir: id longa vira 8 dígitos + elipse ("8f3a2c1b…"); curta, integral. */
export function encurtarSessao(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

/** Data + hora local em PT-BR: "30 de out., 09:10". */
export function dataHoraLocal(ts: number): string {
  const d = new Date(ts);
  const dia = String(d.getDate()).padStart(2, '0');
  const hora = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dia} de ${MESES[d.getMonth()]}, ${hora}:${min}`;
}

/** Duração legível: "12 s" · "3 min" · "2 h 10 min" · "2 h". */
export function duracaoLegivel(ms: number): string {
  const v = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  if (v < 60_000) return `${Math.floor(v / 1_000)} s`;
  if (v < 3_600_000) return `${Math.floor(v / 60_000)} min`;
  const h = Math.floor(v / 3_600_000);
  const m = Math.floor((v % 3_600_000) / 60_000);
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Moedinhas da Vida social: 1 a cada minuto (tempo real) de `working` observado. */
export function moedasPorWorking(msWorking: number): number {
  return Math.floor(Math.max(0, msWorking) / 60_000);
}

/**
 * Tempo acumulado de `working` na sessão, derivado só de dados reais do snapshot:
 * a soma das durações já concluídas de `recent` (durationMs > 0) +, se o agente
 * está working AGORA, o pedaço desde `statusSince` até `agora`. Determinístico
 * para um snapshot; cresce com o relógio quando o agente segue trabalhando.
 */
export function tempoWorkingSessao(
  a: { recent: readonly Activity[]; status: AgentStatus; statusSince: number },
  agora: number,
): number {
  let total = 0;
  for (const at of a.recent) if (at.durationMs && at.durationMs > 0) total += at.durationMs;
  if (a.status === 'working') total += Math.max(0, agora - a.statusSince);
  return total;
}

/**
 * Dois traços a partir do comportamento real da sessão: chamadas por minuto,
 * status atual e se houve pensamento/planejamento no `recent`.
 * Pontuação por traço; empate segue a ordem de prioridade fixa
 * (mao-na-massa → competicao → foco → sonecas). Determinístico.
 */
export function tracosDoAgente(d: {
  status: AgentStatus;
  toolCalls: number;
  duracaoMs: number;
  atividades: readonly Activity[];
}): TracaoId[] {
  const minutos = Math.max(1, d.duracaoMs / 60_000);
  const porMin = d.toolCalls / minutos;
  const pensou = d.atividades.some((a) => a.kind === 'think' || a.kind === 'plan');
  const ocioso = d.status === 'idle' || d.status === 'waiting' || d.status === 'done';
  const pontu: Record<TracaoId, number> = {
    'mao-na-massa': porMin >= 2 ? 2 : porMin >= 1 ? 1 : 0,
    competicao: d.status === 'working' ? (porMin >= 0.5 ? 2 : 1) : 0,
    foco: pensou ? 1 : 0,
    sonecas: ocioso && porMin < 0.5 ? 2 : ocioso ? 1 : 0,
  };
  return (['mao-na-massa', 'competicao', 'foco', 'sonecas'] as const)
    .slice()
    .sort((x, y) => pontu[y] - pontu[x])
    .slice(0, 2);
}

/** Índice do bordão na lista curta: hash estável da seed (mesma seed → mesmo bordão). */
export function indexDoBorde(seed: number, total: number): number {
  if (total <= 0) return 0;
  return hashFNV1a(seed, 'borde', 'vida-social') % total;
}

/** Ordem estável de rivais entre os colegas da sala: hash FNV da seed + id do colega. */
export function ordenarRivais(seed: number, colegas: readonly { id: string }[]): string[] {
  return [...colegas]
    .sort((a, b) => hashFNV1a(seed, a.id, 'rival') - hashFNV1a(seed, b.id, 'rival'))
    .map((c) => c.id);
}

/** Item do extrato da Vida social: evento real do próprio agente. */
export interface ItemExtrato {
  tipo: 'chegou' | 'concluiu';
  /** Epoch ms do evento (chegada = `startedAt`; conclusão = atividade `done`). */
  at: number;
  /** Duração real do turno concluído (só `concluiu`), para "concluiu em X". */
  duracaoMs?: number;
}

/**
 * Extrato com eventos REAIS: a chegada (`startedAt`) e os turnos concluídos
 * (`recent` com kind `done`, mantendo a duração quando o snapshot traz).
 * Até 4 itens, do mais recente para o mais antigo.
 */
export function extratoVidaSocial(a: { startedAt: number; recent: readonly Activity[] }): ItemExtrato[] {
  const itens: ItemExtrato[] = [{ tipo: 'chegou', at: a.startedAt }];
  for (const at of a.recent) if (at.kind === 'done') itens.push({ tipo: 'concluiu', at: at.at, duracaoMs: at.durationMs });
  return itens.slice(-4).reverse();
}
