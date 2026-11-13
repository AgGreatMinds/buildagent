// Simulador de demonstração (`npm run demo` ou HABBLAUD_DEMO=1): um escritório fictício para quem acabou de
// baixar o projeto ver o prédio funcionando sem ter nenhum agente aberto, e para gravar tela sem expor
// projeto real. Nada aqui lê disco, rede ou relógio: o estado é função pura do tempo decorrido, então o
// mesmo instante produz sempre o mesmo snapshot (testável e repetível).
//
// Roteiro: cada pessoa repete um ciclo de CYCLE_MS, defasada das outras:
//   chega e trabalha (a atividade muda a cada STEP_MS) → às vezes pede a atenção do usuário →
//   termina o turno e circula → algumas vão embora e voltam no ciclo seguinte.
// Subagente: aparece enquanto o principal trabalha, conclui e sai.
import type { AccountInfo, Activity, ActivityKind, AgentInfo, AgentStatus, FeedItem, Notice, OfficeSnapshot, PermissionDecision, Provider, RoomInfo } from '../../shared/types';
import { hash32 } from '../../shared/hash';
import { tr } from '../../shared/i18n';

export const CYCLE_MS = 60_000;
const STEP_MS = 4_000;
/** Quanto tempo quem saiu continua no snapshot como 'offline' (o cliente mostra a pessoa indo embora). */
const LEAVE_MS = 4_000;

const ROOMS = ['loja-online', 'app-mobile', 'site-institucional', 'api-pagamentos'] as const;

interface Cast {
  key: string;
  name: string;
  look: 'f' | 'm';
  room: number;
  provider: Provider;
  /** Principal de quem este é subagente (chave), com o tipo do subagente no cargo. */
  parent?: string;
  role?: string;
  /** Defasagem dentro do ciclo. */
  offset: number;
  /** Pede a atenção do usuário no meio do turno. */
  asks?: boolean;
  /** Vai embora no fim do ciclo e volta no seguinte. */
  leaves?: boolean;
}

// 10 pessoas: 5 principais (um por ferramenta, mais um segundo Claude) e 5 subagentes.
const CAST: readonly Cast[] = [
  { key: 'lia', name: 'Lia', look: 'f', room: 0, provider: 'claude', offset: 0, asks: true },
  { key: 'caio', name: 'Caio', look: 'm', room: 0, provider: 'claude', parent: 'lia', role: 'Explore', offset: 0 },
  { key: 'nina', name: 'Nina', look: 'f', room: 0, provider: 'claude', parent: 'lia', role: 'Plan', offset: 0 },
  { key: 'davi', name: 'Davi', look: 'm', room: 1, provider: 'codex', offset: 14_000, leaves: true },
  { key: 'iara', name: 'Iara', look: 'f', room: 1, provider: 'codex', parent: 'davi', role: 'worker', offset: 14_000 },
  { key: 'theo', name: 'Theo', look: 'm', room: 2, provider: 'opencode', offset: 27_000, asks: true, leaves: true },
  { key: 'maya', name: 'Maya', look: 'f', room: 2, provider: 'opencode', parent: 'theo', role: 'general', offset: 27_000 },
  { key: 'raul', name: 'Raul', look: 'm', room: 3, provider: 'pi', offset: 41_000, leaves: true },
  { key: 'cora', name: 'Cora', look: 'f', room: 3, provider: 'claude', offset: 50_000 },
  { key: 'enzo', name: 'Enzo', look: 'm', room: 3, provider: 'claude', parent: 'cora', role: 'Explore', offset: 50_000 },
];

/** Em quanto tempo o uso fictício sobe do piso ao teto antes de "reiniciar" (10 ciclos do elenco). */
const USAGE_PERIOD_MS = 10 * CYCLE_MS;
const HOUR_MS = 3_600_000;

interface DemoAccount {
  provider: Provider;
  short: string;
  color: string;
  plan?: string;
  /** Uso fictício: [piso, quanto sobe ao longo do período] em %, para a janela de 5 h e para a semana. Ausente = sem números. */
  fiveHour?: readonly [number, number];
  sevenDay?: readonly [number, number];
}

// Uma conta por ferramenta do elenco. Claude e Codex mostram uso (uma calma, outra perto do limite) para a faixa
// "Contas · uso" ter o que exibir; OpenCode e Pi ficam sem números, como acontece de verdade com essas ferramentas.
const ACCOUNTS: readonly DemoAccount[] = [
  { provider: 'claude', short: 'C', color: '#f4682a', plan: 'Max', fiveHour: [34, 22], sevenDay: [58, 5] },
  { provider: 'codex', short: 'X', color: '#2e7fd4', plan: 'Plus', fiveHour: [71, 17], sevenDay: [86, 6] },
  { provider: 'opencode', short: 'O', color: '#3fb27f' },
  { provider: 'pi', short: 'P', color: '#8f7ae0' },
];
const PROVIDER_NAME: Record<Provider, string> = { claude: 'Claude', codex: 'Codex', opencode: 'OpenCode', pi: 'Pi' };

/** Id da conta fictícia de uma ferramenta (o `account` dos agentes aponta para ele). */
export function demoAccountId(provider: Provider): string {
  return `demo-${provider}`;
}

/** Percentual inteiro do uso fictício: sobe devagar do piso até piso + subida e recomeça a cada USAGE_PERIOD_MS. */
function usagePercent([floor, rise]: readonly [number, number], elapsed: number): number {
  const phase = (Math.max(0, elapsed) % USAGE_PERIOD_MS) / USAGE_PERIOD_MS;
  return Math.min(100, Math.round(floor + rise * phase));
}

// O que cada pessoa "faz" durante o trabalho: textos genéricos de programação, sem nenhum dado real.
const WORK: ReadonlyArray<{ kind: ActivityKind; icon: string; text: string }> = [
  { kind: 'read', icon: '📖', text: 'Lendo carrinho.ts' },
  { kind: 'search', icon: '🔎', text: 'Procurando "frete" no projeto' },
  { kind: 'edit', icon: '✏️', text: 'Editando checkout.ts' },
  { kind: 'run', icon: '▶️', text: 'Rodando npm test' },
  { kind: 'think', icon: '💭', text: 'Pensando…' },
  { kind: 'edit', icon: '✏️', text: 'Editando pagamento.ts' },
  { kind: 'test', icon: '🧪', text: 'Rodando os testes do pagamento' },
  { kind: 'git', icon: '🌿', text: 'Conferindo o git diff' },
];

interface Moment {
  status: AgentStatus;
  /** Índice estável da atividade (muda quando a pessoa troca de tarefa). */
  step: number;
  /** Quando o status atual começou, relativo ao início do ciclo da pessoa. */
  since: number;
}

/** Onde a pessoa está no próprio ciclo; undefined = fora do prédio. `p` é o tempo dentro do ciclo (0..CYCLE_MS). */
function momentOf(c: Cast, p: number): Moment | undefined {
  const step = Math.floor(p / STEP_MS);
  if (c.parent) {
    // Subagente: chega um passo depois do principal, trabalha, conclui e some.
    if (p < STEP_MS || p >= 34_000) return undefined;
    return p < 30_000 ? { status: 'working', step, since: STEP_MS } : { status: 'done', step: 99, since: 30_000 };
  }
  if (p < 34_000) return { status: 'working', step, since: 0 };
  if (p < 40_000) return c.asks ? { status: 'waiting', step: 98, since: 34_000 } : { status: 'working', step, since: 0 };
  if (p < 52_000 || !c.leaves) return { status: 'idle', step: 99, since: 40_000 };
  if (p < 52_000 + LEAVE_MS) return { status: 'offline', step: 99, since: 52_000 };
  return undefined;
}

export class DemoSimulator {
  private readonly prefix: string;
  private readonly t0: number;
  /** Assinatura do último estado entregue: o tick só acusa mudança quando ela muda. */
  private signature = '';
  private readonly lastActivity = new Map<string, string>();

  constructor(opts?: { idPrefix?: string }, now = 0) {
    this.prefix = opts?.idPrefix ?? 'demo:';
    this.t0 = now;
  }

  private roomId(i: number): string {
    return `/demo/${ROOMS[i]}`;
  }

  private agentAt(c: Cast, now: number): AgentInfo | undefined {
    const elapsed = now - this.t0;
    // Antes da primeira chegada da pessoa (defasagem) ela ainda não entrou.
    if (elapsed < c.offset) return undefined;
    const cycle = Math.floor((elapsed - c.offset) / CYCLE_MS);
    const p = (elapsed - c.offset) % CYCLE_MS;
    const m = momentOf(c, p);
    if (!m) return undefined;
    const cycleStart = this.t0 + c.offset + cycle * CYCLE_MS;
    const id = `${this.prefix}${c.key}`;
    const work = WORK[(m.step + hash32(c.key)) % WORK.length];
    const at = m.status === 'working' ? cycleStart + m.step * STEP_MS : cycleStart + m.since;
    const described =
      m.status === 'working' ? { kind: work.kind, icon: work.icon, text: tr(work.text) }
      : m.status === 'waiting' ? { kind: 'wait' as const, icon: '✋', text: tr('Precisa de você: {0}', [tr('aprovar uma permissão')]) }
      : { kind: 'done' as const, icon: '✅', text: tr('Concluiu') };
    const activity: Activity = { id: `${id}#${cycle}:${m.status === 'working' ? m.step : m.status}`, at, ...described };
    const steps = m.status === 'working' ? m.step + 1 : Math.floor(34_000 / STEP_MS);
    return {
      id,
      kind: c.parent ? 'sub' : 'main',
      ...(c.provider !== 'claude' ? { provider: c.provider } : {}),
      ...(c.parent ? { parentId: `${this.prefix}${c.parent}` } : {}),
      roomId: this.roomId(c.room),
      name: c.name,
      look: c.look,
      role: c.role ?? tr('Agente principal'),
      sessionId: `demo-${c.parent ?? c.key}`,
      account: demoAccountId(c.provider),
      status: m.status,
      ...(m.status === 'waiting' ? { waitingFor: tr('aprovar uma permissão') } : {}),
      activity,
      recent: [activity],
      tasks: [],
      startedAt: cycleStart + (c.parent ? STEP_MS : 0),
      lastEventAt: at,
      statusSince: cycleStart + m.since,
      stats: { toolCalls: steps, tokensIn: steps * 1800, tokensOut: steps * 240, subagents: CAST.filter((o) => o.parent === c.key).length },
      seed: hash32(id),
    };
  }

  private agents(now: number): AgentInfo[] {
    const out: AgentInfo[] = [];
    for (const c of CAST) {
      const a = this.agentAt(c, now);
      if (a) out.push(a);
    }
    return out;
  }

  /** Avança até `now`: diz se algo mudou desde o último tick e devolve as atividades novas para o feed. */
  tick(now: number): { changed: boolean; feed: FeedItem[]; notices: Notice[] } {
    const agents = this.agents(now);
    // O uso fictício entra na assinatura já arredondado: o snapshot só é reenviado quando algum % inteiro muda.
    const usage = this.accounts(agents, now).map((a) => `${a.usage?.fiveHour?.utilization ?? ''}/${a.usage?.sevenDay?.utilization ?? ''}`).join(',');
    const signature = `${agents.map((a) => `${a.id}:${a.status}:${a.activity?.id}`).join('|')}#${usage}`;
    const feed: FeedItem[] = [];
    for (const a of agents) {
      if (!a.activity || this.lastActivity.get(a.id) === a.activity.id) continue;
      this.lastActivity.set(a.id, a.activity.id);
      if (a.status === 'offline') continue;
      feed.push({ id: a.activity.id, agentId: a.id, roomId: a.roomId, agentName: a.name, roomName: a.roomId.slice('/demo/'.length), account: a.account, activity: a.activity });
    }
    const changed = signature !== this.signature;
    this.signature = signature;
    return { changed, feed, notices: [] };
  }

  /** Contas fictícias no instante `now`: sessões abertas por ferramenta e, em Claude e Codex, o uso da vez. */
  private accounts(agents: AgentInfo[], now: number): AccountInfo[] {
    const elapsed = now - this.t0;
    return ACCOUNTS.map((d) => {
      const id = demoAccountId(d.provider);
      const sessions = agents.filter((a) => a.kind === 'main' && a.status !== 'offline' && a.account === id).length;
      const base = {
        id,
        ...(d.provider !== 'claude' ? { provider: d.provider } : {}),
        short: d.short,
        name: `${PROVIDER_NAME[d.provider]} · demo`,
        ...(d.plan ? { plan: d.plan } : {}),
        color: d.color,
        configDir: `/demo/${id}`,
        sessions,
      };
      if (!d.fiveHour || !d.sevenDay) return { ...base, usageStatus: 'unavailable' as const };
      return {
        ...base,
        usage: {
          fiveHour: { utilization: usagePercent(d.fiveHour, elapsed), resetsAt: now + 2.25 * HOUR_MS },
          sevenDay: { utilization: usagePercent(d.sevenDay, elapsed), resetsAt: now + 78 * HOUR_MS },
          source: d.provider === 'codex' ? ('codex' as const) : ('statusline' as const),
          fetchedAt: now,
        },
        usageStatus: 'ok' as const,
      };
    });
  }

  snapshot(now: number): OfficeSnapshot {
    const agents = this.agents(now);
    const rooms: RoomInfo[] = ROOMS.map((name, i) => ({ id: this.roomId(i), name, path: this.roomId(i), slot: i, seed: hash32(this.roomId(i)), createdAt: this.t0 }));
    return {
      rev: 0,
      serverTime: now,
      rooms,
      agents,
      accounts: this.accounts(agents, now),
      meta: { demo: true, sources: [], startedAt: this.t0, version: '0.0.0' },
    };
  }

  /** O servidor é somente leitura: não há pedido de permissão fictício para responder. */
  decidePermission(_requestId: string, _d: PermissionDecision, _now?: number): boolean {
    return false;
  }

  /** O servidor é somente leitura: as mensagens não chegam a agente algum. */
  receiveMessage(_agentId: string, _text: string, _now?: number): boolean {
    return false;
  }
}
