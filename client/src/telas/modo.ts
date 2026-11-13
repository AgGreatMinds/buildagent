// Mapeia o estado do agente para o modo visual do monitor.
// Módulo puro: sem three.js, sem relógio global nem gerador aleatório — o tempo entra sempre por argumento.

import type { AgenteEntrada, PessoaId } from '../vida/tipos';
import { MIN } from '../vida/tipos';

// Os 14 modos de tela: do desligado ao alertando, dos modos de trabalho aos programas (show/game).
export type ModoTela =
  | 'off' | 'standby' | 'idle'
  | 'code' | 'terminal' | 'browser' | 'search' | 'chat' | 'docs' | 'tasks'
  | 'alert' | 'progress' | 'show' | 'game';

// Lista completa dos modos (ordem de §1.1 do plano); serve a exaustividade dos desenhos.
export const MODOS: readonly ModoTela[] = [
  'off', 'standby', 'idle', 'code', 'terminal', 'browser', 'search', 'chat',
  'docs', 'tasks', 'alert', 'progress', 'show', 'game',
];

// 3 s de permanência no modo atual antes de trocar entre modos de trabalho (anti-pisca, §2.2).
export const ANTI_PISCA_MS = 3000;
// Idle há 3+ min vira tela de descanso (`idle`); antes disso, `standby` (§2.1, linha 6/7).
export const IDLE_LONGO_MS = 3 * MIN;
// `done` abre uma janela de 2 min com `tasks` (checklist fechando); depois, `off` (§2.1, linha 8/9).
export const DONE_FECHANDO_MS = 2 * MIN;

// `activity.kind` → modo, só para `working` (§2.2). `chat` é o neutro de propósito:
// quando não se sabe o que o agente faz, a tela mostra conversa abstrata (casa com o balão
// "Pensando…") e nunca cai em `code`. Ausente/desconhecido também é `chat`.
const MODO_POR_ATIVIDADE: Record<string, ModoTela> = {
  edit: 'code',
  write: 'code',
  run: 'terminal',
  test: 'terminal',
  git: 'terminal',
  web: 'browser',
  browser: 'browser',
  mcp: 'browser',
  search: 'search',
  read: 'docs',
  skill: 'docs',
  plan: 'tasks',
  delegate: 'tasks',
  compact: 'progress',
  error: 'alert',
  wait: 'alert',
  done: 'standby',
  // Neutro de working: think, respond, prompt, communicate, ask, other — e o ausente/desconhecido.
  think: 'chat',
  respond: 'chat',
  prompt: 'chat',
  communicate: 'chat',
  ask: 'chat',
  other: 'chat',
};

// Entradas da regra §2.1: quem está no assento, em que estado, se está no lugar,
// a atividade do representante e há quanto tempo está nesse estado.
export interface EntradaModoTela {
  ocupado: boolean;
  estado: string; // Estado + 'offline' + qualquer outro desconhecido
  noLugar: boolean; // a intenção da pessoa é a mesa
  atividade?: string; // activity.kind do representante
  desdeEstado: number; // statusSince do representante (done: concluidoEm) — epoch ms
  agora: number; // epoch ms
}

// Regra estado → modo (§2.1). As 9 linhas são avaliadas NA ORDEM; a primeira que casa vence.
export function modoDaTela(e: EntradaModoTela): ModoTela {
  // Linha 1: assento sem pessoa → mesa desligada.
  if (!e.ocupado) return 'off';
  // Linha 2: precisa de alguém → alerta piscando.
  if (e.estado === 'waiting') return 'alert';
  // Linha 3: esperando comando terminar → progresso.
  if (e.estado === 'shell') return 'progress';
  const decorrido = e.agora - e.desdeEstado;
  // Linha 4: trabalhando mas está na sala de guerra → mesa acesa, ninguém nela.
  if (e.estado === 'working' && !e.noLugar) return 'standby';
  // Linha 5: trabalhando → o modo segue a atividade (tabela 2.2; `chat` cobre o ausente/desconhecido).
  if (e.estado === 'working') return MODO_POR_ATIVIDADE[e.atividade ?? ''] ?? 'chat';
  // Linha 6: acabou de parar (idle < 3 min) → ainda pulsando.
  if (e.estado === 'idle' && decorrido < IDLE_LONGO_MS) return 'standby';
  // Linha 7: idle há 3+ min → descanso de tela; nunca desliga enquanto a sessão existe.
  if (e.estado === 'idle') return 'idle';
  // Linha 8: concluiu há menos de 2 min → checklist fechando.
  if (e.estado === 'done' && decorrido < DONE_FECHANDO_MS) return 'tasks';
  // Linha 9: done ≥ 2 min, offline ou estado desconhecido → desliga.
  return 'off';
}

// Modos de trabalho: são eles que passam pelo anti-pisca (§2.2).
const MODOS_TRABALHO: Set<ModoTela> = new Set([
  'code', 'terminal', 'browser', 'search', 'chat', 'docs', 'tasks',
]);
// Estes quatro trocam o modo SEM espera — urgência, espera ou mesa vazia nunca ficam presas.
const TROCA_IMEDIATA: Set<ModoTela> = new Set([
  'alert', 'progress', 'off', 'standby',
]);

// Anti-pisca (§2.2): um modo de trabalho só cede para outro modo de trabalho depois de
// ANTI_PISCA_MS no atual. Troca é imediata quando o atual ou o novo é alert/progress/off/standby.
// `desde` = instante em que o modo atual começou; tempo por argumento, determinístico.
export function modoEstavel(atual: ModoTela, desde: number, novo: ModoTela, agora: number): ModoTela {
  if (atual === novo) return atual;
  if (TROCA_IMEDIATA.has(atual) || TROCA_IMEDIATA.has(novo)) return novo;
  if (MODOS_TRABALHO.has(atual) && MODOS_TRABALHO.has(novo) && agora - desde < ANTI_PISCA_MS) return atual;
  return novo;
}

// Representante da pessoa (§2.1): entre os agentes de `pessoa.agenteIds` com
// `status === pessoa.estado`, o de maior `lastEventAt`; se nenhum casar, o de maior
// `lastEventAt` no conjunto; pessoa `done` não tem representante (a tela decide sozinha).
export function representanteDe(pessoa: PessoaId, agentes: readonly AgenteEntrada[]): AgenteEntrada | null {
  if (pessoa.estado === 'done') return null;
  const meus = agentes.filter((a) => pessoa.agenteIds.includes(a.id));
  if (meus.length === 0) return null;
  let mesmo: AgenteEntrada | undefined;
  let maisRecente: AgenteEntrada | undefined;
  for (const a of meus) {
    if (a.status === pessoa.estado && (mesmo === undefined || a.lastEventAt > mesmo.lastEventAt)) {
      mesmo = a;
    }
    if (maisRecente === undefined || a.lastEventAt > maisRecente.lastEventAt) {
      maisRecente = a;
    }
  }
  return mesmo ?? maisRecente ?? null;
}
