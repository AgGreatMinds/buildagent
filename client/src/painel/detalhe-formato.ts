// Formatos puros do acabamento da gaveta de detalhe.
// Regra do módulo: sem DOM, sem Date.now, sem Math.random — o "agora" e qualquer
// dado de agente entram por parâmetro, para o teste controlar tudo.

import type { Activity, AgentInfo, ActivityKind } from '../../../shared/types';
import { tempoDesde } from './tempo';

/* (1) Abreiação do meio: corta texto longo preservando o início e o fim.
 *    Usada em Caminho (32) e Sessão (22) da grade de identificação.
 *    - se cabe (txt.length <= max), devolve igual;
 *    - senão: head = ceil((max-1) * inicio), tail = max-1-head, e o resultado
 *      tem exatamente `max` caracteres (com a reticência no meio).
 *    - `inicio` controla o equilíbrio: menor (ex.: 0.35) mantém mais cauda;
 *    - `max` tem piso de 3, para caber a reticência. */
export function abreviarMeio(txt: string, max: number, inicio = 0.5): string {
  if (txt.length <= max) return txt;
  const teto = Math.max(3, max);
  const head = Math.ceil((teto - 1) * inicio);
  const tail = teto - 1 - head;
  return txt.slice(0, head) + '…' + txt.slice(txt.length - tail);
}

/* (2) Tempo relativo sem "há agora": reusa `tempoDesde` e, quando a duração
 *    cai em "agora" (<15 s), devolve o texto próprio (`quandoAgora`) em vez de
 *    prefixar. Resolve o diagnóstico D6 ("no status há agora"). */
export function haTempo(epoch: number, agora: number, prefixo: string, quandoAgora: string): string {
  const t = tempoDesde(epoch, agora);
  return t === 'agora' ? quandoAgora : `${prefixo} ${t}`;
}

/* (3) Inicial do nome para o avatar (spec 2.3): 1º caractere visível em
 *    maiúscula pt-BR; '?' quando o nome está vazio/depois do trim. */
export function inicialDoNome(nome: string): string {
  const t = nome.trim();
  return t ? t[0].toLocaleUpperCase('pt-BR') : '?';
}

/* (4) Grupo de cor do ícone da linha do tempo (spec 2.9): `data-grupo` do
 *    cartão de ação. Tabela fechada com `satisfies` — se faltar um dos 23
 *    ActivityKind, o typecheck quebra. `erro === true` (flag da Activity)
 *    força o grupo 'erro' independentemente do kind. */
export type GrupoAcao = 'ler' | 'escrever' | 'rodar' | 'pensar' | 'atencao' | 'fim' | 'erro' | 'outro';

const GRUPO: Record<ActivityKind, GrupoAcao> = {
  read: 'ler',
  search: 'ler',
  web: 'ler',
  browser: 'ler',
  mcp: 'ler',
  skill: 'ler',
  edit: 'escrever',
  write: 'escrever',
  run: 'rodar',
  test: 'rodar',
  git: 'rodar',
  prompt: 'pensar',
  think: 'pensar',
  respond: 'pensar',
  plan: 'pensar',
  delegate: 'pensar',
  communicate: 'pensar',
  compact: 'pensar',
  ask: 'atencao',
  wait: 'atencao',
  done: 'fim',
  error: 'erro',
  other: 'outro',
} satisfies Record<ActivityKind, GrupoAcao>;

export function grupoDaAcao(kind: ActivityKind, erro?: boolean): GrupoAcao {
  return erro === true ? 'erro' : GRUPO[kind];
}

/* (5) Conteúdo do card "Agora" (spec 2.5): um union fechado por tipo de
 *    estado — a gaveta desenha cada ramo. Regras:
 *    - sumido ou offline → encerrado (card não é desenhado);
 *    - done → concluido;
 *    - waiting → espera (motivo = waitingFor);
 *    - shell → shell (rótulo do 1º shell + quantos ficam em segundo plano);
 *    - working → acao (a atividade atual);
 *    - idle → ocioso (última ação = activity ou a mais recente de `recent`). */
export type Agora =
  | { tipo: 'acao'; acao?: Activity }
  | { tipo: 'espera'; motivo?: string }
  | { tipo: 'shell'; rotulo?: string; extra: number }
  | { tipo: 'ocioso'; ultima?: Activity }
  | { tipo: 'concluido' }
  | { tipo: 'encerrado' };

export function agoraDoAgente(
  a: Pick<AgentInfo, 'status' | 'activity' | 'waitingFor' | 'shells' | 'recent'>,
  sumido: boolean,
): Agora {
  if (sumido || a.status === 'offline') return { tipo: 'encerrado' };
  switch (a.status) {
    case 'done':
      return { tipo: 'concluido' };
    case 'waiting':
      return { tipo: 'espera', motivo: a.waitingFor };
    case 'shell': {
      const shells = a.shells ?? [];
      return { tipo: 'shell', rotulo: shells[0]?.label, extra: Math.max(0, shells.length - 1) };
    }
    case 'working':
      return { tipo: 'acao', acao: a.activity };
    case 'idle':
      return { tipo: 'ocioso', ultima: a.activity ?? a.recent.at(-1) };
  }
}

/* (6) Paginação da linha do tempo (spec 2.9): mais recentes primeiro
 *    (`recent` é da mais antiga para a mais recente), cortadas em `mostrar`.
 *    `restantes` = o que ainda está escondido (para "Mostrar mais N");
 *    `total` = tamanho original (para o chip da seção). */
export function fatiaAcoes(recent: Activity[], mostrar: number): { itens: Activity[]; restantes: number; total: number } {
  const itens = [...recent].reverse().slice(0, mostrar);
  return { itens, restantes: Math.max(0, recent.length - mostrar), total: recent.length };
}
