// Adaptado de marmottajr/habblaud@faa1a01 server/sources/codex/source.ts (MIT)
// Cortado para o contrato GET-only do buildagent:
// - hooks do Codex (CodexLive/applyHookEvent e toda a lógica de presença por hook) — o
//   projeto de origem os recebia em POST /api/codex/events; este servidor não aceita POST;
// - parser de terminal do Codex (sources/terminal.ts não foi portado);
// - .zst compactados: sem suporte de leitura, sem aviso de log (presença só por
//   lock/rollout recente);
// - prefixo histórico de rollouts grandes (scanPrefix/PREFIX_HISTORY): só a janela
//   final é lida, números e título do começo ficam sem;
// - fs.watch (só era um acelerador do polling; aqui o polling de 1 s cobre).
// O que ficou: presença por thread-writer-locks (ou, sem a pasta de locks, rollout
// recente), main/sub no Office, seed de uso/plano dos rollouts, pump do rollout.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { AccountUsage, AgentStatus, SourceInfo } from '../../../shared/types';
import type { DetectedAccount } from '../../accounts/detect';
import type { AccountEntry, AccountsService } from '../../accounts/service';
import { errMsg, log } from '../../log';
import type { Office, TranscriptSummary } from '../../model/office';
import type { AgentSource } from '../source';
import { FileTail } from '../tail';
import { codexPlanLabel, detectCodexAccounts } from './accounts';
import { readLocks, readRolloutHead, rolloutDirs, RolloutIndex, parseRolloutName, type LockInfo } from './files';
import {
  createCodexState,
  parseRolloutLine,
  type CodexLineResult,
  type CodexState,
  type RolloutMeta,
} from './rollout';
import { tr } from '../../../shared/i18n';

/** Idade mínima do lock para valer como sessão aberta (os locks de manutenção duram menos). */
export const LOCK_SETTLE_MS = 3_000;
/** Lock presente com rollout parado há mais que isto: lock velho de um crash. */
export const STALE_LOCK_MS = 12 * 3600_000;
/** Sem `thread-writer-locks/`: presença = rollout modificado nos últimos 30 min. */
export const FALLBACK_RECENT_MS = 30 * 60_000;
/** Tempo que o thread precisa ficar ausente para ser dado como encerrado. */
const CLOSE_AFTER_MISSING_MS = 1_500;
/** 'working' sem nenhuma escrita no rollout por este tempo: o turno morreu (crash). */
export const WORKING_QUIET_MS = 30 * 60_000;
/** Sem eventos de turno (legacy antigo): escreveu há pouco = trabalhando. */
const LEGACY_WORKING_MS = 90_000;
/** Resultados guardados ao ler um rollout antes de o agente entrar no escritório. */
const BACKLOG_MAX = 400;
/** Conta sem sessão aberta ao subir: quantos rollouts recentes tentar até achar um com o uso do plano. */
const SEED_USAGE_FILES = 8;
const MAIN_ROLE = tr('Agente principal (Codex)');
const SUB_ROLE = tr('Subagente (Codex)');

export interface CodexSourceOptions {
  accounts: AccountsService;
  office: Office;
  /** Pastas do Codex lidas por este processo (no Docker, as montadas), uma por conta. */
  dirs: string[];
  env?: NodeJS.ProcessEnv;
  home?: string;
  now?: () => number;
  pollMs?: number;
  /** Quanto do fim de cada rollout é lido ao abrir a sessão (padrão 1 MB). */
  tailBytes?: number;
}

interface CodexAccount {
  id: string;
  /** Pasta lida por este processo. */
  dir: string;
  /** Pasta para exibir (no Docker, a do host). */
  configDir: string;
  index: RolloutIndex;
  /** Locks vistos no último ciclo (null = sem a pasta de locks). */
  locks: Map<string, LockInfo> | null;
  /** Modo sem locks: rollouts modificados há pouco (thread → mtime), revistos a cada 10 s. */
  recent: Map<string, number>;
  recentAt: number;
  usage?: AccountUsage;
  plan?: string;
  error?: string;
}

interface ThreadTracker {
  key: string;
  acc: CodexAccount;
  threadId: string;
  /** main/sub pelo session_meta; internal = fica fora do escritório. */
  kind: 'main' | 'sub' | 'internal';
  parentThreadId?: string;
  meta?: RolloutMeta;
  rolloutPath?: string;
  nextResolveAt: number;
  tail?: FileTail;
  state: CodexState;
  /** Resultados lidos antes de o agente entrar no escritório (vão como histórico, sem feed). */
  backlog: CodexLineResult[];
  inOffice: boolean;
  status: AgentStatus;
  /** Quando o status foi decidido (linha do rollout): informação mais velha não o muda. */
  statusAt: number;
  waitingFor?: string;
  /** mtime do rollout na última leitura. */
  lastWriteAt?: number;
  missingSince?: number;
  /** Subagente que já entregou (turno concluído). */
  subDone: boolean;
}

function roleOf(raw: string | undefined): string {
  if (!raw) return SUB_ROLE;
  const r = raw.trim();
  return r ? `${r[0].toUpperCase()}${r.slice(1)}` : SUB_ROLE;
}

export class CodexSource implements AgentSource {
  readonly provider = 'codex' as const;
  private accs: CodexAccount[] = [];
  private entries: readonly AccountEntry[] = [];
  private detected: DetectedAccount[] = [];
  private threads = new Map<string, ThreadTracker>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastPollAt = 0;
  private readonly now: () => number;
  private readonly tailBytes: number;
  private stopped = false;

  constructor(private readonly opts: CodexSourceOptions) {
    this.now = opts.now ?? Date.now;
    this.tailBytes = opts.tailBytes ?? 1024 * 1024;
    const env = opts.env ?? process.env;
    const claude = opts.accounts.entries();
    this.detected = detectCodexAccounts(opts.dirs, {
      env,
      home: opts.home,
      taken: { shorts: claude.map((e) => e.detected.short), colors: claude.map((e) => e.detected.color) },
    });
    this.register();
  }

  /** Registra (de novo) as contas no AccountsService, sempre na mesma ordem: os ids não mudam. */
  private register(): void {
    const entries = this.opts.accounts.setProviderAccounts(
      'codex',
      this.opts.dirs.map((dir, i) => ({ dir, detected: this.detected[i] })),
    );
    this.entries = entries;
    const prev = new Map(this.accs.map((a) => [a.dir, a]));
    this.accs = entries.map((e) => {
      const old = prev.get(e.dir);
      if (old) {
        old.id = e.id;
        old.configDir = e.detected.configDir;
        return old;
      }
      return { id: e.id, dir: e.dir, configDir: e.detected.configDir, index: new RolloutIndex(e.dir, this.now), locks: null, recent: new Map(), recentAt: -Infinity };
    });
  }

  start(): void {
    this.boot();
    this.timer = setInterval(() => this.safePoll(), this.opts.pollMs ?? 1_000);
    this.timer.unref?.();
  }

  /** Reconstrói as sessões abertas sem gerar avisos. Síncrono e curto. */
  boot(): void {
    this.opts.office.beginBoot();
    try {
      for (const acc of this.accs) acc.index.scanAll();
      this.poll(true);
      for (const acc of this.accs) if (!acc.usage) this.seedUsage(acc);
    } finally {
      this.opts.office.endBoot();
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  sources(): SourceInfo[] {
    return this.accs.map((acc) => {
      let sessions = 0;
      for (const t of this.threads.values()) if (t.acc === acc && t.kind === 'main' && t.inOffice) sessions++;
      const info: SourceInfo = { label: acc.id, provider: 'codex', path: acc.configDir, sessions, ok: !acc.error };
      if (acc.error) info.error = acc.error;
      return info;
    });
  }

  transcriptPathOf(agentId: string): string | undefined {
    const t = this.threads.get(agentId);
    return t?.inOffice ? t.rolloutPath : undefined;
  }

  // ---------------------------------------------------------------- polling

  private safePoll(): void {
    try {
      this.poll(false);
    } catch (err) {
      log.warnOnce(`codex-poll:${errMsg(err)}`, tr('Codex: falha no ciclo de leitura: {0}', [errMsg(err)]));
    }
  }

  poll(boot = false): void {
    const now = (this.lastPollAt = this.now());
    const seen = new Set<string>();
    for (const acc of this.accs) {
      const present = this.presentThreads(acc, now);
      for (const [threadId, via] of present) {
        const key = `${acc.id}:${threadId}`;
        let t = this.threads.get(key);
        if (!t) {
          t = this.newTracker(acc, threadId);
          this.threads.set(key, t);
        }
        try {
          this.syncThread(t, via, now, boot);
        } catch (err) {
          log.warnOnce(`codex-thread:${key}:${errMsg(err)}`, tr('Codex: thread {0}: {1}', [key, errMsg(err)]));
        }
        seen.add(key);
      }
    }
    for (const [key, t] of [...this.threads]) {
      if (seen.has(key)) continue;
      t.missingSince ??= now;
      if (!boot && now - t.missingSince < CLOSE_AFTER_MISSING_MS) continue;
      this.leave(t);
      this.threads.delete(key);
    }
    // Subagentes que ficaram para depois (o pai entrou neste ciclo).
    for (const t of this.threads.values()) if (t.kind === 'sub' && !t.inOffice && seen.has(t.key)) this.reconcile(t, now);
  }

  /**
   * Threads presentes de uma conta e por quê: 'lock' (lock com idade suficiente) ou
   * 'recent' (sem pasta de locks: rollout modificado há pouco).
   */
  private presentThreads(acc: CodexAccount, now: number): Map<string, 'lock' | 'recent'> {
    const out = new Map<string, 'lock' | 'recent'>();
    acc.locks = readLocks(acc.dir);
    if (acc.locks) {
      for (const lock of acc.locks.values()) {
        const known = this.threads.get(`${acc.id}:${lock.threadId}`);
        // Lock novo demais (manutenção?): espera (o polling de ~1 s confere de novo). O que já está no
        // escritório não precisa esperar de novo.
        if (now - lock.createdAt < LOCK_SETTLE_MS && !known?.inOffice) continue;
        out.set(lock.threadId, 'lock');
      }
    } else {
      if (now - acc.recentAt >= 10_000) {
        acc.recentAt = now;
        acc.recent = new Map(acc.index.recentlyModified(FALLBACK_RECENT_MS).map((r) => [r.threadId, r.mtimeMs]));
      }
      for (const [threadId, mtime] of acc.recent) {
        const t = this.threads.get(`${acc.id}:${threadId}`);
        const last = Math.max(mtime, t?.lastWriteAt ?? 0);
        if (now - last <= FALLBACK_RECENT_MS) out.set(threadId, 'recent');
      }
    }
    return out;
  }

  private newTracker(acc: CodexAccount, threadId: string): ThreadTracker {
    return {
      key: `${acc.id}:${threadId}`,
      acc,
      threadId,
      kind: 'main',
      nextResolveAt: 0,
      state: createCodexState(),
      backlog: [],
      inOffice: false,
      status: 'idle',
      statusAt: 0,
      subDone: false,
    };
  }

  /** Um ciclo de um thread presente: acha/lê o rollout e decide se ele está (ou continua) no escritório. */
  private syncThread(t: ThreadTracker, via: 'lock' | 'recent', now: number, boot: boolean): void {
    delete t.missingSince;
    if (t.inOffice && !this.opts.office.has(t.key)) t.inOffice = false; // saiu do escritório (graça encerrada)
    this.pump(t, boot);
    this.reconcile(t, now, via);
    if (t.inOffice && t.kind === 'main') {
      this.quietCheck(t, now);
      this.opts.office.fillWorkingActivity(t.key);
    }
  }

  /** O thread deve estar no escritório agora? Entra, sai ou muda de sala conforme o caso. */
  private reconcile(t: ThreadTracker, now: number, via?: 'lock' | 'recent'): void {
    const want = this.wanted(t, now, via);
    if (!want) {
      if (t.inOffice) this.leave(t);
      return;
    }
    if (!t.inOffice) this.enter(t, now);
  }

  private wanted(t: ThreadTracker, now: number, via?: 'lock' | 'recent'): boolean {
    if (t.kind === 'internal') return false;
    if (via === 'lock') {
      const lock = t.acc.locks?.get(t.threadId);
      // Lock velho de um crash: o lock é antigo e o rollout está parado há muito tempo (ou nem existe). Um
      // thread antigo retomado agora tem lock novo (o Codex cria o arquivo ao carregar e o apaga ao
      // descarregar).
      const rolloutIdle = !t.rolloutPath || (t.lastWriteAt !== undefined && now - t.lastWriteAt > STALE_LOCK_MS);
      if (lock && now - lock.createdAt > STALE_LOCK_MS && rolloutIdle) return false;
    }
    // Sem o projeto (sessão aberta ainda sem prompt, só com o lock) não há sala para o principal:
    // espera o rollout dizer o cwd.
    if (t.kind === 'main' && !this.cwdOf(t)) return false;
    if (t.kind === 'sub') {
      const parent = this.parentKey(t);
      if (!parent || !this.opts.office.has(parent) || this.opts.office.isSubDone(parent) || this.opts.office.get(parent)?.status === 'offline') return false;
      // Subagente só aparece trabalhando (ou aguardando); depois de entregar, sai.
      if (!t.inOffice && t.status !== 'working' && t.status !== 'waiting') return false;
    }
    return true;
  }

  private parentKey(t: ThreadTracker): string | undefined {
    if (!t.parentThreadId) return undefined;
    return `${t.acc.id}:${t.parentThreadId}`;
  }

  /** Projeto conhecido do thread (session_meta). */
  private cwdOf(t: ThreadTracker): string | undefined {
    return t.meta?.cwd;
  }

  private enter(t: ThreadTracker, now: number): void {
    const office = this.opts.office;
    if (t.kind === 'main') {
      const cwd = this.cwdOf(t)!;
      office.addMain({
        id: t.key,
        provider: 'codex',
        account: t.acc.id,
        sessionId: t.threadId,
        cwd,
        role: MAIN_ROLE,
        startedAt: t.meta?.startedAt ?? t.state.firstAt ?? now,
        status: t.status,
        waitingFor: t.waitingFor,
      });
      t.inOffice = office.has(t.key);
      if (!t.inOffice) return;
      // Reaberta dentro do período de graça: o status pode ter mudado enquanto esteve fora.
      office.setStatus(t.key, t.status, t.waitingFor);
    } else {
      const parent = this.parentKey(t)!;
      const added = office.addSub({
        id: t.key,
        parentId: parent,
        sessionId: t.threadId,
        role: roleOf(t.meta?.agentRole),
        title: t.state.title,
        background: false,
        startedAt: t.meta?.startedAt ?? t.state.firstAt ?? now,
      });
      if (!added) return;
      t.inOffice = true;
      t.subDone = false;
      // addSub começa em 'working': um pedido de aprovação visto antes de ele entrar vale já.
      if (t.status === 'waiting') office.setStatus(t.key, 'waiting', t.waitingFor);
    }
    this.flushBacklog(t);
    this.applySummary(t);
  }

  /** Sai do escritório: principal encerra; subagente entrega (se ainda não tinha entregado). */
  private leave(t: ThreadTracker): void {
    if (!t.inOffice) return;
    const office = this.opts.office;
    if (t.kind === 'sub') {
      if (!t.subDone) office.completeSub(t.key);
      t.subDone = true;
    } else office.closeMain(t.key);
    t.inOffice = false;
  }

  /** Leva o status do tracker ao escritório (o subagente entrega ao ficar ocioso e volta ao trabalhar). */
  private statusToOffice(t: ThreadTracker): void {
    if (!t.inOffice) return;
    const office = this.opts.office;
    if (t.kind === 'main') {
      office.setStatus(t.key, t.status, t.waitingFor);
      return;
    }
    if (t.kind !== 'sub') return;
    if (t.status === 'idle') {
      if (!t.subDone) office.completeSub(t.key);
      t.subDone = true;
      return;
    }
    if (t.subDone) {
      office.reactivateSub(t.key);
      t.subDone = office.isSubDone(t.key);
    }
    if (!t.subDone) office.setStatus(t.key, t.status, t.waitingFor);
  }

  // ---------------------------------------------------------------- rollout

  /** Acha o rollout (sem pressa: no máximo a cada 3 s por thread) e lê o que for novo. */
  private pump(t: ThreadTracker, boot: boolean): void {
    const now = this.now();
    if (now >= t.nextResolveAt) {
      t.nextResolveAt = now + (boot ? 0 : 3_000);
      const path = t.acc.index.find(t.threadId);
      if (path && path !== t.tail?.path) {
        this.load(t, path);
        return;
      }
    }
    if (!t.tail) return;
    for (let i = 0; i < 4; i++) {
      let r;
      try {
        r = t.tail.read();
      } catch (err) {
        log.warnOnce(`codex-read:${t.key}`, tr('Codex: rollout de {0} ilegível ({1}).', [t.key, errMsg(err)]));
        return;
      }
      if (r.missing) {
        // Apagado ou trocado de lugar (arquivado, compactado): procura de novo.
        delete t.tail;
        delete t.rolloutPath;
        t.nextResolveAt = 0;
        return;
      }
      t.lastWriteAt = t.tail.mtimeMs;
      if (r.reset) {
        // Reescrito no mesmo caminho (ex.: codex migrate-rollouts): relê como histórico.
        this.load(t, t.tail.path);
        return;
      }
      for (const line of r.lines) this.apply(t, parseRolloutLine(t.state, line, { idPrefix: t.key, now: this.now() }), true);
      if (r.lines.length) this.applySummary(t);
      if (!r.more) break;
    }
  }

  /** Lê o começo (session_meta, título) e a janela do fim do rollout. */
  private load(t: ThreadTracker, path: string): void {
    const head = readRolloutHead(path);
    if (head.meta) this.setMeta(t, head.meta);
    const tail = new FileTail(path);
    const start = tail.seekTail(this.tailBytes);
    t.tail = tail;
    t.rolloutPath = path;
    t.state = createCodexState(head.meta);
    if (head.title) t.state.title = head.title;
    t.backlog = [];
    for (let i = 0; i < 64; i++) {
      const r = tail.read();
      for (const line of r.lines) this.apply(t, parseRolloutLine(t.state, line, { idPrefix: t.key, now: this.now() }), false);
      if (!r.more) break;
    }
    t.lastWriteAt = tail.mtimeMs;
    this.settleStatus(t);
    if (t.inOffice) {
      this.flushBacklog(t);
      this.statusToOffice(t);
    }
    this.applySummary(t);
    // Cortado: o prefixo antes de `start` (números/título/timeline longa) não é lido.
    void start;
  }

  private setMeta(t: ThreadTracker, meta: RolloutMeta): void {
    t.meta = meta;
    if (meta.internal) t.kind = 'internal';
    else if (meta.parentThreadId) {
      if (t.kind === 'main' && t.inOffice) {
        // Aparecia como sessão aberta (sem rollout ainda) e é um subagente: sai e volta como subagente.
        this.opts.office.closeMain(t.key);
        t.inOffice = false;
      }
      t.kind = 'sub';
      t.parentThreadId = meta.parentThreadId;
    }
  }

  /**
   * Status depois de ler a janela do rollout: o turno aberto (ou, no legacy antigo sem eventos de
   * turno, uma escrita recente) é 'working'.
   */
  private settleStatus(t: ThreadTracker): void {
    const s = t.state;
    const at = s.lastAt ?? 0;
    if (at < t.statusAt) return;
    let status: AgentStatus;
    if (s.turnOpen !== undefined) status = s.turnOpen ? 'working' : 'idle';
    else status = s.lastAt !== undefined && this.now() - s.lastAt < LEGACY_WORKING_MS ? 'working' : 'idle';
    if (status === 'working' && this.now() - Math.max(t.lastWriteAt ?? 0, at) > WORKING_QUIET_MS) status = 'idle';
    t.status = status;
    t.statusAt = at;
    delete t.waitingFor;
  }

  /** Aplica um resultado de linha: ao vivo vai direto ao escritório; na carga inicial, fica no backlog. */
  private apply(t: ThreadTracker, r: CodexLineResult, live: boolean): void {
    for (const sig of r.signals) {
      switch (sig.type) {
        case 'meta':
          this.setMeta(t, sig.meta);
          break;
        case 'usage':
          this.pushUsage(t.acc, sig.usage, sig.plan);
          break;
        case 'turnStart':
          this.decide(t, 'working', r.at, undefined, live);
          break;
        case 'turnEnd':
          this.decide(t, 'idle', r.at, undefined, live);
          break;
        case 'progress':
          if (t.status === 'waiting') this.decide(t, 'working', r.at, undefined, live);
          break;
        default:
          break;
      }
    }
    if (!live || !t.inOffice) {
      if (r.activities.length || r.signals.some((s) => s.type === 'github')) {
        t.backlog.push(r);
        if (t.backlog.length > BACKLOG_MAX) t.backlog.splice(0, t.backlog.length - BACKLOG_MAX);
      }
      return;
    }
    this.toOffice(t, r, true);
  }

  private toOffice(t: ThreadTracker, r: CodexLineResult, live: boolean): void {
    const office = this.opts.office;
    for (const a of r.activities) office.addActivity(t.key, a.activity, a.current, { feed: live });
    for (const sig of r.signals) {
      // Só o que chega ao vivo anima a sala; a carga inicial vai para o histórico.
      if (sig.type === 'github') office.githubEvent(t.key, sig.event, { key: sig.key, at: r.at, live });
    }
  }

  private flushBacklog(t: ThreadTracker): void {
    const backlog = t.backlog;
    t.backlog = [];
    for (const r of backlog) this.toOffice(t, r, false);
  }

  /** Muda o status por uma borda (início/fim de turno): informação mais velha que a última decisão não vale. */
  private decide(t: ThreadTracker, status: AgentStatus, at: number, waitingFor: string | undefined, live: boolean): void {
    if (at < t.statusAt) return;
    t.statusAt = at;
    t.status = status;
    if (waitingFor) t.waitingFor = waitingFor;
    else delete t.waitingFor;
    if (live) this.statusToOffice(t);
  }

  /** 'working' sem nenhuma notícia por muito tempo (turno morto num crash): vira 'idle'. */
  private quietCheck(t: ThreadTracker, now: number): void {
    if (t.status !== 'working') return;
    const last = Math.max(t.lastWriteAt ?? 0, t.statusAt);
    if (now - last > WORKING_QUIET_MS) this.decide(t, 'idle', now, undefined, true);
  }

  private applySummary(t: ThreadTracker): void {
    if (!t.inOffice) return;
    const s = t.state;
    const summary: TranscriptSummary = { tasks: s.tasks, stats: { ...s.stats } };
    if (s.title) summary.title = s.title;
    if (s.model) summary.model = s.model;
    const branch = s.gitBranch ?? t.meta?.gitBranch;
    if (branch) summary.gitBranch = branch;
    if (s.firstAt !== undefined) summary.firstAt = s.firstAt;
    if (s.lastAt !== undefined) summary.lastAt = s.lastAt;
    this.opts.office.applyTranscript(t.key, summary);
  }

  // ---------------------------------------------------------------- uso do plano

  /** Uso da conta (e o plano junto): vale o mais recente entre as sessões dela. */
  private pushUsage(acc: CodexAccount, usage: AccountUsage, plan: string | undefined): void {
    if (acc.usage && usage.fetchedAt < acc.usage.fetchedAt) return;
    acc.usage = usage;
    this.opts.accounts.setUsage(acc.id, usage);
    this.pushPlan(acc, plan);
  }

  /** O plano (rate_limits.plan_type) entra na conta. */
  private pushPlan(acc: CodexAccount, plan: string | undefined): void {
    const label = codexPlanLabel(plan);
    if (label && label !== acc.plan) {
      acc.plan = label;
      const i = this.accs.indexOf(acc);
      if (i >= 0 && this.detected[i]) {
        this.detected[i] = { ...this.detected[i], plan: label };
        this.register();
      }
    }
  }

  /**
   * Conta sem sessão aberta ao subir: o uso do rollout mais recente que tenha números (fica
   * "desatualizado" com a idade: os números do Codex só se renovam com alguma sessão rodando).
   * Por mtime em TODAS as pastas de data (uma sessão retomada continua no arquivo da pasta
   * antiga), tentando os SEED_USAGE_FILES mais recentes: o último pode não ter `token_count`
   * nenhum (sessão sem resposta, ou arquivada logo).
   */
  private seedUsage(acc: CodexAccount): void {
    const files: Array<{ path: string; mtimeMs: number }> = [];
    for (const dir of rolloutDirs(acc.dir)) {
      let names: string[];
      try {
        names = readdirSync(dir);
      } catch {
        continue;
      }
      for (const name of names) {
        const r = parseRolloutName(name);
        if (!r || r.compressed) continue;
        try {
          files.push({ path: join(dir, name), mtimeMs: statSync(join(dir, name)).mtimeMs });
        } catch {
          // sumiu
        }
      }
    }
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    let plan: string | undefined;
    for (const f of files.slice(0, SEED_USAGE_FILES)) {
      try {
        const tail = new FileTail(f.path);
        tail.seekTail(256 * 1024);
        const state = createCodexState();
        for (let i = 0; i < 4; i++) {
          const r = tail.read();
          for (const line of r.lines) parseRolloutLine(state, line, { idPrefix: '', now: this.now(), activities: false });
          if (!r.more) break;
        }
        plan ??= state.planType;
        if (state.usage) return this.pushUsage(acc, state.usage, state.planType ?? plan);
      } catch {
        // ilegível agora: tenta o seguinte
      }
    }
    if (!acc.plan) this.pushPlan(acc, plan);
  }
}
