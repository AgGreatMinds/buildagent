// Adaptado de marmottajr/habblaud@faa1a01 server/sources/opencode/source.ts (MIT)
// Cortados: a option `watch` (nunca usada pela fonte) e o flag `stopped` (só era escrito, nunca lido).
// `readOpenSessionIds` recebe o `env` da option (injetável em teste; padrão process.env) — o Habblaud
// chamava sem args (HOME real).
// Fonte de agentes do OpenCode (AgentSource 'opencode', ver sources/source.ts): observa as sessões ATIVAS do banco
// local (~/.local/share/opencode/opencode.db, SQLite) e alimenta o Office.
//
// Presença: o OpenCode não tem "registro de sessão aberta" nem lock de thread. Ele atualiza session_v2.time_updated
// a cada escrita (turno, mensagem, tool). Um agente é "presente" enquanto não arquivado/suspendido e com
// time_updated dentro de RECENT_WINDOW_MS (30 min). Status:
//   - 'working': última sessão_message é do assistant em curso (a escrita ainda não chegou ao fim do turno);
//   - 'idle': a última é 'user'/'idle'/'system' (turno encerrado, aguardando próxima instrução).
// Subagentes: sessões com parent_id entram como subagentes do pai (só enquanto o pai está no escritório).
//
// Boot: síncrono e curto (uma leitura por banco; endBoot num finally). A cada ciclo (padrão 2 s) relê para
// atualizar presença/status. O banco é aberto read-only por chamada; falha de leitura não derruba a fonte.
//
// O OpenCode grava os agentes que rodam nele no campo `agent` da sessão ('build', 'plan' ou um custom como
// 'revisor' ou 'testes'). Isso vira o `role` de cada personagem, então o escritório
// mostra, por exemplo, "revisor" como subagente de "build".
import type { AgentStatus, SourceInfo } from '../../../shared/types';
import type { AccountsService } from '../../accounts/service';
import type { Office } from '../../model/office';
import { errMsg, log } from '../../log';
import type { AgentSource } from '../source';
import { detectOpenCodeAccounts } from './accounts';
import { lastActivity, lastMessages, pollSessions, RECENT_WINDOW_MS, sessionStatus, type OpenCodeSession } from './db';
import { readOpenSessionIds } from './presence';
import { tr } from '../../../shared/i18n';

const MAIN_ROLE = tr('Agente principal (OpenCode)');
const SUB_ROLE = tr('Subagente (OpenCode)');

export interface OpenCodeSourceOptions {
  accounts: AccountsService;
  office: Office;
  /** Caminhos dos bancos observados (um por conta), a pasta que contém o `opencode.db` ou o próprio .db. */
  dirs: string[];
  /** Env lido por presence (HABBLAUD_OPENCODE_DRAFTS); padrão process.env. */
  env?: NodeJS.ProcessEnv;
  /** Home para presence e discover; padrão env.HOME || os.homedir(). */
  home?: string;
  now?: () => number;
  pollMs?: number;
  /** Janela de recência para considerar a sessão ativa (padrão 30 min). */
  recentMs?: number;
}

interface Tracker {
  key: string;
  accountId: string;
  sessionId: string;
  kind: 'main' | 'sub';
  inOffice: boolean;
  status: AgentStatus;
}

export class OpenCodeSource implements AgentSource {
  readonly provider = 'opencode' as const;
  private trackers = new Map<string, Tracker>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly now: () => number;
  private readonly recentMs: number;
  private entries: ReturnType<AccountsService['setProviderAccounts']> = [];
  private detected;
  private stopped = false;

  constructor(private readonly opts: OpenCodeSourceOptions) {
    this.now = opts.now ?? Date.now;
    this.recentMs = opts.recentMs ?? RECENT_WINDOW_MS;
    const claude = opts.accounts.entries();
    const codex = opts.accounts.entriesOf('codex');
    this.detected = detectOpenCodeAccounts(opts.dirs, {
      taken: {
        shorts: [...claude.map((e) => e.detected.short), ...codex.map((e) => e.detected.short)],
        colors: [...claude.map((e) => e.detected.color), ...codex.map((e) => e.detected.color)],
      },
    });
    this.register();
  }

  /** Registra (de novo) as contas no AccountsService, sempre na mesma ordem: os ids não mudam. */
  private register(): void {
    this.entries = this.opts.accounts.setProviderAccounts(
      'opencode',
      this.opts.dirs.map((dir, i) => ({ dir, detected: this.detected[i] })),
    );
  }

  start(): void {
    this.boot();
    this.timer = setInterval(() => this.safePoll(), this.opts.pollMs ?? 2_000);
    this.timer.unref?.();
  }

  /** Reconstrói as sessões ativas sem gerar avisos. Síncrono e curto. */
  private boot(): void {
    this.stopped = false;
    this.opts.office.beginBoot();
    try {
      this.poll(true);
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
    return this.entries.map((e, i) => {
      let sessions = 0;
      for (const t of this.trackers.values()) if (t.accountId === e.id && t.kind === 'main' && t.inOffice) sessions++;
      const ok = true;
      const info: SourceInfo = { label: this.detected[i]?.id ?? e.dir, provider: 'opencode' as const, path: e.dir, sessions, ok };
      return info;
    });
  }

  /** O OpenCode não tem arquivo de transcript; a conversa vem das tabelas (a linha do tempo usa o último evento). */
  transcriptPathOf(): string | undefined {
    return undefined;
  }

  private safePoll(): void {
    try {
      this.poll(false);
    } catch (err) {
      log.warnOnce(`opencode-poll:${errMsg(err)}`, tr('OpenCode: falha no ciclo de leitura: {0}', [errMsg(err)]));
    }
  }

  private poll(boot: boolean): void {
    const now = this.now();
    // Presença: a lista de sessões ABERTAS vem do app (drafts.sqlite). Sem ela, cai no fallback da recência
    // (RECENT_WINDOW_MS) para não quebrar quem só tem o banco principal. `env`/`home` vêm das options
    // (padrão process.env no Habblaud: undefined aqui cai no default do presence.ts).
    const openIds = readOpenSessionIds(this.opts.env, this.opts.home);
    const present = new Map<string, { kind: 'main' | 'sub'; parentKey?: string; status: AgentStatus; session: OpenCodeSession; dir: string }>();
    for (let i = 0; i < this.opts.dirs.length; i++) {
      const acc = this.entries[i];
      if (!acc) continue;
      const result = openIds
        ? this.pollFromOpenIds(this.opts.dirs[i], openIds, now)
        : pollSessions(this.opts.dirs[i], now, this.recentMs);
      if (!result.ok) continue;
      for (const s of result.sessions) {
        const isSub = !!s.parentId;
        const status = this.statusOf(this.opts.dirs[i], s.id);
        const key = `${acc.id}:${s.id}`;
        present.set(key, { kind: isSub ? 'sub' : 'main', parentKey: isSub ? `${acc.id}:${s.parentId}` : undefined, status, session: s, dir: this.opts.dirs[i] });
      }
    }

    // Entra/sai do escritório conforme presença.
    const seen = new Set<string>();
    for (const [key, info] of present) {
      seen.add(key);
      let t = this.trackers.get(key);
      if (!t) {
        const ci = key.indexOf(':');
        t = { key, accountId: key.slice(0, ci), sessionId: key.slice(ci + 1), kind: info.kind, inOffice: false, status: 'idle' };
        this.trackers.set(key, t);
      }
      t.kind = info.kind;
      t.status = info.status;
      // Subagente só entra com o pai no escritório.
      if (t.kind === 'sub' && info.parentKey && !present.has(info.parentKey)) {
        if (t.inOffice) this.leave(t);
        continue;
      }
      this.reconcile(t, info, now, boot);
    }
    for (const [key, t] of [...this.trackers]) {
      if (seen.has(key)) continue;
      this.leave(t);
      this.trackers.delete(key);
    }
  }

  private statusOf(dbPath: string, sessionId: string): AgentStatus {
    return sessionStatus(dbPath, sessionId);
  }

  /** Lê as sessões ABERTAS (drafts.sqlite) e faz join com o banco principal (metadados, diretório, agente). */
  private pollFromOpenIds(dbPath: string, openIds: Set<string>, now: number): { ok: boolean; error?: string; sessions: OpenCodeSession[] } {
    if (!openIds.size) return { ok: true, sessions: [] };
    // Puxa as sessões recentes (janela de recência) e junta com as abas abertas.
    // Regra de presença:
    //  - se a sessão está na lista de abas -> presente (mesmo que ociosa);
    //  - se a sessão está em turno (working) -> presente (o agente está executando algo, mesmo sem aba);
    //  - subagente: entra se o pai está presente.
    const recent = pollSessions(dbPath, now, RECENT_WINDOW_MS, { includeSuspended: openIds.size > 0 });
    if (!recent.ok) return recent;
    const statusOf = new Map<string, AgentStatus>();
    for (const s of recent.sessions) statusOf.set(s.id, this.statusOf(dbPath, s.id));
    const present = new Set<string>();
    for (const s of recent.sessions) {
      if (openIds.has(s.id)) present.add(s.id);
      else if (statusOf.get(s.id) === 'working') present.add(s.id);
    }
    const out: OpenCodeSession[] = [];
    for (const s of recent.sessions) {
      if (present.has(s.id)) { out.push(s); continue; }
      // Subagente: entra se o pai está presente.
      if (s.parentId && present.has(s.parentId)) out.push(s);
    }
    return { ok: true, sessions: out };
  }

  private reconcile(t: Tracker, info: { kind: 'main' | 'sub'; parentKey?: string; status: AgentStatus; session: OpenCodeSession; dir: string }, now: number, boot: boolean): void {
    const office = this.opts.office;
    if (info.kind === 'main') {
      const cwd = info.session.directory;
      if (!cwd) return; // sem projeto não há sala
      if (!t.inOffice) {
        // Nome do personagem = o agente que está rodando ("dedalo", "hades", "oraculo"...); 'build' é o
        // agente padrão do OpenCode, então ele continua com o nome sorteado da sessão.
        const agentName = info.session.agent && info.session.agent !== 'build' ? info.session.agent : undefined;
        office.addMain({
          id: t.key,
          provider: 'opencode',
          account: t.accountId,
          sessionId: t.sessionId,
          cwd,
          role: MAIN_ROLE,
          startedAt: info.session.created || now,
          status: t.status,
          nameOverride: agentName,
        });
        t.inOffice = office.has(t.key);
        if (!t.inOffice) return;
      }
      office.setStatus(t.key, t.status);
      this.fill(t, info, boot);
    } else {
      const parent = info.parentKey!;
      if (!office.has(parent)) return;
      if (!t.inOffice) {
        const agent = info.session.agent;
        const role = agent === 'build' || !agent ? SUB_ROLE : agent;
        const added = office.addSub({
          id: t.key,
          parentId: parent,
          sessionId: t.sessionId,
          role,
          background: false,
          startedAt: info.session.created || now,
        });
        t.inOffice = added;
        if (!added) return;
      }
      if (t.status === 'working') office.setStatus(t.key, 'working');
      else if (office.get(t.key)?.status === 'working') office.completeSub(t.key);
      this.fill(t, info, boot);
    }
  }

  /** Última atividade relevante (mensagem/tool) para a linha do tempo. No boot preenche o histórico; ao vivo, só atualiza a atividade. */
  private fill(t: Tracker, info: { session: OpenCodeSession; dir: string }, boot: boolean): void {
    const act = lastActivity(info.session, info.dir);
    if (!act) return;
    this.opts.office.addActivity(t.key, act, false, { feed: false, filler: !boot });
  }

  private leave(t: Tracker): void {
    if (!t.inOffice) return;
    const office = this.opts.office;
    if (t.kind === 'sub') office.completeSub(t.key);
    else office.closeMain(t.key);
    t.inOffice = false;
  }
}
