// Fonte de agentes do Pi (AgentSource 'pi', ver sources/source.ts): observa as sessões recentes em
// `~/.pi/agent/sessions` (um .jsonl por sessão, ver sessions.ts) e alimenta o Office. Somente leitura.
//
// Presença: o Pi não registra "sessão aberta". Um agente é presente enquanto o arquivo da sessão foi
// mexido há menos de RECENT_WINDOW_MS (30 min). Status:
//   - 'working': arquivo mexido há menos de WORKING_WINDOW_MS e o turno não terminou (a última mensagem é
//     do usuário, um resultado de ferramenta ou um assistant que ainda vai chamar ferramenta);
//   - 'idle': o assistant encerrou o turno (stopReason 'stop') ou o arquivo está parado.
// Boot síncrono e curto (endBoot num finally); a cada ciclo (padrão 2 s) relê os arquivos recentes.
import { basename, resolve } from 'node:path';
import type { Activity, AgentStatus, SourceInfo } from '../../../shared/types';
import { ACCOUNT_COLORS, type DetectedAccount } from '../../accounts/detect';
import type { AccountsService } from '../../accounts/service';
import { errMsg, log } from '../../log';
import type { Office } from '../../model/office';
import type { AgentSource } from '../source';
import { listPiSessionFiles, readPiSession, type PiSession } from './sessions';
import { tr } from '../../../shared/i18n';

export const RECENT_WINDOW_MS = 30 * 60_000;
export const WORKING_WINDOW_MS = 90_000;
const MAIN_ROLE = tr('Agente principal (Pi)');

export interface PiSourceOptions {
  accounts: AccountsService;
  office: Office;
  /** Pasta das sessões do Pi (BUILDAGENT_PI_DIR ou ~/.pi/agent/sessions). */
  dir: string;
  now?: () => number;
  pollMs?: number;
  recentMs?: number;
}

/** Status a partir do estado do arquivo: função pura (testada sem disco). */
export function piStatus(s: Pick<PiSession, 'lastRole' | 'lastStop'>, idleMs: number): AgentStatus {
  if (idleMs > WORKING_WINDOW_MS) return 'idle';
  if (s.lastRole === 'assistant' && s.lastStop !== 'toolUse') return 'idle'; // turno encerrado (stop, erro, abortado)
  return s.lastRole ? 'working' : 'idle';
}

/** Atividade genérica (sem texto de conversa): só diz o que o agente está fazendo e, se houver, o nome da ferramenta. */
function activityOf(s: PiSession, status: AgentStatus, at: number): Activity {
  const id = `${s.id}#pi-last`;
  if (status !== 'working') return { id, at, kind: 'done', icon: '✅', text: tr('Turno concluído') };
  if (s.lastRole === 'user') return { id, at, kind: 'prompt', icon: '📥', text: tr('Recebeu uma instrução') };
  if (s.lastTool) return { id, at, kind: 'run', icon: '🛠️', text: tr('Usando {0}', [s.lastTool]), tool: s.lastTool };
  return { id, at, kind: 'think', icon: '💭', text: tr('Pensando') };
}

interface Tracker {
  inOffice: boolean;
  activity: string;
}

export class PiSource implements AgentSource {
  readonly provider = 'pi' as const;
  private readonly trackers = new Map<string, Tracker>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly now: () => number;
  private readonly accountId: string;

  constructor(private readonly opts: PiSourceOptions) {
    this.now = opts.now ?? Date.now;
    // Uma conta lógica (a pasta de sessões): letra "P" e a primeira cor livre da paleta.
    const others = opts.accounts.allEntries().filter((e) => e.provider !== 'pi');
    const used = new Set(others.map((e) => e.detected.color));
    const shorts = new Set(others.map((e) => e.detected.short.toUpperCase()));
    const detected: DetectedAccount = {
      id: '.pi',
      provider: 'pi',
      configDir: resolve(opts.dir),
      short: shorts.has('P') ? 'Pi' : 'P',
      name: 'Pi',
      color: ACCOUNT_COLORS.find((c) => !used.has(c)) ?? ACCOUNT_COLORS[others.length % ACCOUNT_COLORS.length],
    };
    this.accountId = opts.accounts.setProviderAccounts('pi', [{ dir: opts.dir, detected }])[0]?.id ?? detected.id;
  }

  start(): void {
    this.opts.office.beginBoot();
    try {
      this.poll();
    } finally {
      this.opts.office.endBoot();
    }
    this.timer = setInterval(() => {
      try {
        this.poll();
      } catch (err) {
        log.warnOnce(`pi-poll:${errMsg(err)}`, tr('Pi: falha no ciclo de leitura: {0}', [errMsg(err)]));
      }
    }, this.opts.pollMs ?? 2_000);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  sources(): SourceInfo[] {
    let sessions = 0;
    for (const t of this.trackers.values()) if (t.inOffice) sessions++;
    return [{ label: basename(this.accountId), provider: 'pi', path: this.opts.dir, sessions, ok: true }];
  }

  /** O detalhe de sessão do painel lê transcripts do Claude Code; o do Pi não é exposto. */
  transcriptPathOf(): string | undefined {
    return undefined;
  }

  private poll(): void {
    const now = this.now();
    const office = this.opts.office;
    const seen = new Set<string>();
    for (const file of listPiSessionFiles(this.opts.dir, now, this.opts.recentMs ?? RECENT_WINDOW_MS)) {
      const s = readPiSession(file);
      if (!s) continue;
      const key = `pi:${s.id}`;
      seen.add(key);
      const status = piStatus(s, now - file.mtimeMs);
      let t = this.trackers.get(key);
      if (!t) {
        t = { inOffice: false, activity: '' };
        this.trackers.set(key, t);
      }
      if (!t.inOffice) {
        office.addMain({ id: key, provider: 'pi', account: this.accountId, sessionId: s.id, cwd: s.cwd, role: MAIN_ROLE, startedAt: s.startedAt || file.mtimeMs, status });
        t.inOffice = office.has(key);
        if (!t.inOffice) continue;
      }
      office.setStatus(key, status);
      // Só publica a atividade quando ela muda (o arquivo é relido a cada ciclo).
      const activity = activityOf(s, status, s.lastAt ?? file.mtimeMs);
      const signature = `${activity.kind}:${activity.text}:${activity.at}`;
      if (signature !== t.activity) {
        t.activity = signature;
        office.addActivity(key, activity, status === 'working', { feed: false });
      }
    }
    // Arquivo que saiu da janela de recência: o agente vai embora.
    for (const [key, t] of [...this.trackers]) {
      if (seen.has(key)) continue;
      if (t.inOffice) office.closeMain(key);
      this.trackers.delete(key);
    }
  }
}
