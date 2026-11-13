// Adaptado de marmottajr/habblaud@faa1a01 client/src/ui/daystats-model.ts (MIT)
// "Meu dia": modelo puro do diálogo (sem DOM), testado em meudia-modelo.test.ts.
// Recebe o DayStats de GET /api/stats (shared/daystats.ts) e devolve o que a tela desenha:
// destaques do dia, colunas por hora com escala comum ("bonita"), linhas por projeto
// (esperando você + total), ranking das maiores esperas e os formatos de exibição.
// Cortes da referência: modo demo/source, seletor de dias, painel por conta, legenda
// interativa (aqui os quatro status aparecem sempre) e tooltip flutuante
// (o diálogo usa <title> nativo no SVG).

import {
  TIMED_STATUSES,
  totalMs,
  type DayStats,
  type HourDayStats,
  type RoomDayStats,
  type StatusMs,
  type TimedStatus,
  type WaitDayStats,
} from '../../../shared/daystats';

// ------------------------------------------------------------------ fusos e URL

/** Fuso do navegador (o mesmo que o servidor usa para alinhar o dia); 'UTC' como piso. */
export function fusoLocal(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** URL da consulta de "Meu dia": o dia de hoje, no fuso de quem pergunta. */
export function urlStats(tz: string): string {
  return `/api/stats?tz=${encodeURIComponent(tz)}`;
}

// ------------------------------------------------------------------ formatos

const INT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const DEC1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const USD = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const RELOGIO = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Relógio de 24 h: "14:32". */
export function formatarRelogio(t: number): string {
  return RELOGIO.format(t);
}

/**
 * Tempo de agente: "12 s", "3 min", "2 h 10 min" — e, passando de um dia, "27 h 5 min"
 * (a soma de vários agentes passa de 24 h sem virar "dias").
 */
export function formatarTempoAgente(ms: number): string {
  const v = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  if (v < 60_000) return `${Math.floor(v / 1_000)} s`;
  if (v < 3_600_000) return `${Math.floor(v / 60_000)} min`;
  const h = Math.floor(v / 3_600_000);
  const m = Math.floor((v % 3_600_000) / 60_000);
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "12.345" */
export function formatarInt(n: number): string {
  return INT.format(Math.max(0, n));
}

/** Tokens compactos: "850", "1,2 k", "1,2 M". */
export function formatarTokens(n: number): string {
  const v = Math.max(0, n);
  if (v < 1_000) return INT.format(v);
  if (v < 1_000_000) return `${DEC1.format(v / 1_000)} k`;
  return `${DEC1.format(v / 1_000_000)} M`;
}

/** Custo: "US$ 1,23". */
export function formatarUSD(n: number): string {
  return USD.format(n);
}

// ------------------------------------------------------------------ destaques

/** Números do topo do diálogo (KPIs): a formatação em texto é no meudia.ts (rótulos em texto.ts). */
export interface Destaque {
  esperandoMs: number;
  trabalhandoMs: number;
  sessoes: number;
  subagentes: number;
  esperas: number;
  maiorEsperaMs: number;
  /** Tempo de relógio em que pelo menos um agente esperou você (sem somar agentes). */
  tempoRelogioEsperaMs: number;
  pedidos: number;
  ferramentas: number;
  tarefasConcluidas: number;
  tokensIn: number;
  tokensOut: number;
  custoUSD: number;
}

export function destaques(stats: DayStats): Destaque {
  const t = stats.totals;
  return {
    esperandoMs: t.ms.waiting,
    trabalhandoMs: t.ms.working,
    sessoes: t.sessions,
    subagentes: t.subagents,
    esperas: t.waits,
    maiorEsperaMs: t.longestWaitMs,
    tempoRelogioEsperaMs: t.waitWallMs,
    pedidos: t.counts.prompts,
    ferramentas: t.counts.toolCalls,
    tarefasConcluidas: t.counts.tasksDone,
    tokensIn: t.counts.tokensIn,
    tokensOut: t.counts.tokensOut,
    custoUSD: t.counts.costUSD,
  };
}

// ------------------------------------------------------------------ por hora

/** Pedaço de uma barra empilhada, em % da escala comum. */
export interface Fatia {
  status: TimedStatus;
  ms: number;
  pct: number;
}

/**
 * Eixo vertical "bonito" (mesma régua da referência): topo em múltiplo redondo de minutos,
 * 2 a 4 marcas — dois agentes trabalhando uma hora passam de 60 min de altura.
 */
export interface Escala {
  maxMs: number;
  /** Marcas (ms), de baixo para cima, sem o zero. */
  marcasMs: number[];
}

const NICE_MIN = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480, 600, 720, 960, 1200, 1440];

export function escalaBonita(valorMaxMs: number): Escala {
  const minutos = Math.max(1, valorMaxMs / 60_000);
  const topo = NICE_MIN.find((m) => m >= minutos) ?? Math.ceil(minutos / 1440) * 1440;
  // Partes iguais e redondas: múltiplos de 1 h (ou 30 min) a partir de 2 h; de 5 min abaixo disso.
  const passos = topo >= 120 ? [60, 30] : [5];
  let partes = 1;
  for (const unidade of passos) {
    const p = [4, 3, 2].find((n) => Number.isInteger(topo / n) && (topo / n) % unidade === 0);
    if (p) {
      partes = p;
      break;
    }
  }
  const passo = topo / partes;
  return { maxMs: topo * 60_000, marcasMs: Array.from({ length: partes }, (_, i) => (i + 1) * passo * 60_000) };
}

/** Fatias de `ms` sobre a escala comum (só status com tempo), na ordem de empilhamento. */
export function segmentosPorStatus(ms: StatusMs, maxMs: number): Fatia[] {
  if (!(maxMs > 0)) return [];
  return TIMED_STATUSES.filter((s) => ms[s] > 0).map((s) => ({ status: s, ms: ms[s], pct: (ms[s] / maxMs) * 100 }));
}

export interface ColunaHora {
  /** Início do balde (epoch ms). */
  t: number;
  hora: number;
  ms: StatusMs;
  totalMs: number;
  /** "14h–15h". */
  rotulo: string;
  /** Hora em curso (só no dia de hoje). */
  agora: boolean;
  /** Hora que ainda não chegou. */
  futuro: boolean;
  /** Coluna com rótulo no eixo X (a cada 3 h). */
  rotuloEixo: boolean;
}

/**
 * Colunas empilhadas do gráfico por hora, com escala comum a todas. `agora` marca a hora em curso
 * (hoje); `agora = 0` devolve o dia sem nenhuma hora "em curso" (testes e dias passados).
 */
export function colunasPorHora(hours: readonly HourDayStats[], agora = 0, aCadaRotulo = 3): { colunas: ColunaHora[]; escala: Escala } {
  const maximo = hours.length ? Math.max(0, ...hours.map((h) => totalMs(h.ms))) : 0;
  const escala = escalaBonita(maximo);
  const colunas = hours.map((h, i) => {
    const proximo = hours[i + 1]?.t ?? h.t + 3_600_000;
    const dentroDaHora = agora >= h.t && agora < proximo;
    return {
      t: h.t,
      hora: h.hour,
      ms: h.ms,
      totalMs: totalMs(h.ms),
      rotulo: `${h.hour}h–${(h.hour + 1) % 24}h`,
      agora: dentroDaHora,
      futuro: h.t > agora,
      rotuloEixo: h.hour % aCadaRotulo === 0,
    };
  });
  return { colunas, escala };
}

// ------------------------------------------------------------------ por projeto

/** Linha do gráfico por projeto (esperando você em destaque + total na barra). */
export interface LinhaProjeto {
  id: string;
  nome: string;
  ms: StatusMs;
  totalMs: number;
  aguardandoMs: number;
  /** Largura da barra (% da escala comum; 0 = projeto sem tempo no dia). */
  pct: number;
}

/**
 * Projetos com tempo no dia, na ordem da API (quem mais esperou você primeiro),
 * com a escala comum de todas as barras (o maior total vira 100%).
 */
export function linhasPorProjeto(rooms: readonly RoomDayStats[]): { linhas: LinhaProjeto[]; escalaMs: number } {
  const ativas = rooms.filter((r) => totalMs(r.ms) > 0);
  const escalaMs = ativas.length ? Math.max(0, ...ativas.map((r) => totalMs(r.ms))) : 0;
  const linhas = ativas.map((r) => ({
    id: r.id,
    nome: r.name,
    ms: r.ms,
    totalMs: totalMs(r.ms),
    aguardandoMs: r.ms.waiting,
    pct: escalaMs > 0 ? (totalMs(r.ms) / escalaMs) * 100 : 0,
  }));
  return { linhas, escalaMs };
}

// ------------------------------------------------------------------ maiores esperas

/** Item do ranking das maiores esperas (já ordenado da mais longa para a mais curta). */
export interface LinhaEspera {
  posicao: number;
  ms: number;
  nomeAgente: string;
  nomeProjeto: string;
  conta: string;
  inicio: number;
  fim: number;
  /** O agente continua esperando agora. */
  emCurso: boolean;
  /** Motivo ("uma mensagem nova"), quando conhecido. */
  motivo?: string;
  /** Largura da barrinha (% da maior espera; mínimo 2 para não sumir). */
  pct: number;
}

/** Ranking: a API já devolve da maior para a menor, mas a ordenação aqui é defensiva. */
export function linhasDeEspera(waits: readonly WaitDayStats[]): LinhaEspera[] {
  const ordenadas = [...waits].sort((a, b) => b.ms - a.ms || a.start - b.start);
  const maior = Math.max(1, ...ordenadas.map((w) => w.ms));
  return ordenadas.map((w, i) => {
    const linha: LinhaEspera = {
      posicao: i + 1,
      ms: w.ms,
      nomeAgente: w.agentName,
      nomeProjeto: w.roomName,
      conta: w.account,
      inicio: w.start,
      fim: w.end,
      emCurso: !!w.ongoing,
      pct: Math.max(2, (w.ms / maior) * 100),
    };
    if (w.reason) linha.motivo = w.reason;
    return linha;
  });
}

// ------------------------------------------------------------------ estados

/** O dia não tem nada para mostrar? */
export function ehDiaVazio(stats: DayStats): boolean {
  return totalMs(stats.totals.ms) === 0 && stats.totals.counts.tokensIn === 0 && stats.waits.length === 0;
}

/** O diálogo se atualiza sozinho só aberto e no dia de hoje. */
export function deveAtualizar(aberto: boolean, dia: string, hoje: string): boolean {
  return aberto && dia === hoje;
}
