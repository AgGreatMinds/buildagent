// Adaptado de marmottajr/habblaud@faa1a01 server/sources/opencode/db.ts (MIT)
// Leitura do banco local do OpenCode (`~/.local/share/opencode/opencode.db`, SQLite em WAL).
//
// O OpenCode não deixa "registro de sessão aberta" como o Claude Code (<pid>.json) nem lock de thread como o Codex;
// tudo vive num SQLite. A fonte (source.ts) decide presença por recência de escrita (time_updated e seq da última
// mensagem): sessão ativa enquanto o OpenCode está em turno, some quando arquiva/suspende ou quando a escrita some
// há mais de uma janela.
//
// Privacidade: o banco é aberto READ-ONLY a cada ciclo (não se guarda handle) e nunca se lê credencial — só a
// estrutura de sessão/mensagem.
//
// Adaptado: o construtor do `node:sqlite` (nativo, Node 22+) é carregado com createRequire no topo, em vez de
// import estático — o Vite/Vitest não resolve o módulo nativo no load e quebrava a suíte inteira. Sem o módulo
// ou sem o banco, tudo devolve resultado vazio: a fonte nunca derruba o escritório por causa do OpenCode.
import type { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import type { Activity } from '../../../shared/types';
import { maskSecrets } from '../../../shared/activity';

/** Construtor do node:sqlite se o runtime tiver (Node 22+); undefined = não há banco que se consiga ler. */
let SqliteCtor: typeof import('node:sqlite').DatabaseSync | undefined;
try {
  SqliteCtor = (createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: typeof import('node:sqlite').DatabaseSync }).DatabaseSync;
} catch {
  SqliteCtor = undefined;
}

/** O que a fonte precisa de uma sessão OpenCode para alimentar o escritório. */
export interface OpenCodeSession {
  id: string;
  /** Sessão aberta tem parent_id nulo; subagentes apontam o pai. */
  parentId: string | null;
  /** Projeto (worktree): vira o caminho da sala. */
  directory: string;
  project: string;
  title?: string;
  /** Agente OpenCode ('build', 'plan' ou um custom como 'dedalo'). */
  agent?: string;
  model?: string;
  created: number;
  updated: number;
  archived: boolean;
  suspended: boolean;
  idleOutcome?: string;
}

export interface OpenCodePoll {
  ok: boolean;
  error?: string;
  /** Sessões candidatas a "presentes": não arquivadas/suspendidas e com time_updated na janela. */
  sessions: OpenCodeSession[];
}

/** Janela de "ativa": sessão sem time_updated novo que isto é dada como encerrada. */
export const RECENT_WINDOW_MS = 30 * 60_000;

interface RawSession {
  id: string;
  project_id: string;
  parent_id: string | null;
  directory: string;
  title: string | null;
  agent: string | null;
  model: string | null;
  time_created: number;
  time_updated: number;
  time_archived: number | null;
  time_suspended: number | null;
  idle_outcome: string | null;
}

/** Título da sessão já sem segredo reconhecido (ver maskSecrets). */
function maskedTitle(v: unknown): string | undefined {
  const t = str(v);
  return t ? maskSecrets(t) : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function mapModel(raw: string | null): string | undefined {
  if (!raw) return undefined;
  try {
    const m = JSON.parse(raw) as { id?: unknown; providerID?: unknown };
    const id = str(m.id);
    if (!id) return undefined;
    const prov = str(m.providerID);
    return prov ? `${prov}/${id}` : id;
  } catch {
    return raw;
  }
}

function mapSession(r: RawSession, now: number, windowMs: number, includeSuspended = false): OpenCodeSession | undefined {
  if (!r.id || !r.directory || r.time_archived) return undefined;
  if (!includeSuspended && r.time_suspended) return undefined;
  if (now - r.time_updated > windowMs) return undefined;
  return {
    id: r.id,
    parentId: r.parent_id,
    directory: r.directory,
    project: r.project_id,
    title: maskedTitle(r.title), // o título vem da conversa: chave ou token reconhecido é mascarado antes de sair
    agent: str(r.agent) ?? undefined,
    model: mapModel(r.model),
    created: r.time_created,
    updated: r.time_updated,
    archived: false,
    suspended: false,
    idleOutcome: str(r.idle_outcome) ?? undefined,
  };
}

function openReadOnly(path: string): DatabaseSync | undefined {
  if (!SqliteCtor || !existsSync(path)) return undefined;
  try {
    return new SqliteCtor(path, { readOnly: true, open: true });
  } catch {
    return undefined;
  }
}

/** Roda num ciclo: lê as sessões atualizadas na janela (para presença/status). Abre e fecha o banco por chamada. */
export function pollSessions(path: string, now: number, windowMs = RECENT_WINDOW_MS, opts: { includeSuspended?: boolean } = {}): OpenCodePoll {
  const db = openReadOnly(path);
  if (!db) return { ok: false, error: 'banco ausente ou ilegível', sessions: [] };
  try {
    // Sempre puxa o conjunto candidato na janela; se `includeSuspended`, não exclui as suspensas.
    const where = opts.includeSuspended
      ? `WHERE s.time_updated >= ? AND s.time_archived IS NULL`
      : `WHERE s.time_updated >= ? AND s.time_archived IS NULL AND s.time_suspended IS NULL`;
    const rows = db
      .prepare(
        `SELECT s.id, s.project_id, s.parent_id, s.directory, s.title, s.agent, s.model,
                s.time_created, s.time_updated, s.time_archived, s.time_suspended, s.idle_outcome
         FROM session_v2 s ${where}`,
      )
      .all(now - windowMs) as unknown as RawSession[];
    const out: OpenCodeSession[] = [];
    for (const r of rows) {
      const s = mapSession(r, now, windowMs, opts.includeSuspended);
      if (s) out.push(s);
    }
    return { ok: true, sessions: out };
  } catch (err) {
    return { ok: false, error: String(err), sessions: [] };
  } finally {
    db.close();
  }
}

export interface MessageLine {
  role: 'user' | 'assistant' | 'system' | 'other';
  at: number;
  text: string;
}

/** Últimas mensagens de uma sessão (para linha do tempo/atividade). Ordem cronológica. */
export function lastMessages(path: string, sessionId: string, limit = 40): MessageLine[] {
  const db = openReadOnly(path);
  if (!db) return [];
  try {
    const rows = db
      .prepare('SELECT type, time_created, data FROM session_message WHERE session_id = ? ORDER BY seq DESC LIMIT ?')
      .all(sessionId, limit) as Array<{ type: string; time_created: number; data: string }>;
    const out: MessageLine[] = [];
    for (const r of rows.reverse()) {
      let text = '';
      try {
        text = messageText(JSON.parse(r.data) as Record<string, unknown>, r.type);
      } catch {
        text = String(r.data ?? '').slice(0, 200);
      }
      if (!text) continue;
      const role: MessageLine['role'] =
        r.type === 'user' ? 'user' : r.type === 'assistant' ? 'assistant' : r.type === 'system' ? 'system' : 'other';
      out.push({ role, at: r.time_created, text });
    }
    return out;
  } catch {
    return [];
  } finally {
    db.close();
  }
}

/** Extrai texto legível de uma linha do OpenCode (user = .text; assistant = junta content[]). */
export function messageText(d: Record<string, unknown>, type: string): string {
  if (type === 'user') return str(d.text) ?? str((d.metadata as Record<string, unknown>)?.displayText) ?? '';
  if (type === 'assistant') {
    const content = Array.isArray(d.content) ? d.content : [];
    return content
      .map((c) => {
        if (c && typeof c === 'object') {
          const o = c as Record<string, unknown>;
          if (o.type === 'text') return str(o.text) ?? '';
          if (o.type === 'tool') return toolLabel(o);
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return str(d.text) ?? str(d.description) ?? '';
}

function toolLabel(o: Record<string, unknown>): string {
  const name = str(o.name) ?? str(o.tool) ?? 'ferramenta';
  const input = o.input && typeof o.input === 'object' ? (o.input as Record<string, unknown>) : {};
  const detail = str(input.file_path) ?? str(input.command) ?? str(input.path) ?? str(input.url) ?? '';
  return detail ? `${name}: ${detail.slice(0, 120)}` : name;
}

/**
 * Status de uma sessão OpenCode: 'working' se a última mensagem relevante é do assistant DEPOIS do último
 * 'idle' (o agente está em meio a um turno); 'idle' se o último 'idle' veio por último (turno encerrado).
 * `session_message.seq` dá a ordem; 'idle' carrega `outcome: succeeded|failed|interrupted` no payload.
 */
export function sessionStatus(dbPath: string, sessionId: string): 'working' | 'idle' {
  const db = openReadOnly(dbPath);
  if (!db) return 'idle';
  try {
    const rows = db
      .prepare(
        `SELECT type, seq FROM session_message
         WHERE session_id = ? AND type IN ('assistant','idle')
         ORDER BY seq DESC LIMIT 5`,
      )
      .all(sessionId) as Array<{ type: string; seq: number }>;
    let lastIdleSeq = -1;
    let lastAssistantSeq = -1;
    for (const r of rows) {
      if (r.type === 'idle' && lastIdleSeq < 0) lastIdleSeq = r.seq;
      if (r.type === 'assistant' && lastAssistantSeq < 0) lastAssistantSeq = r.seq;
      if (lastIdleSeq > 0 && lastAssistantSeq > 0) break;
    }
    return lastAssistantSeq > lastIdleSeq ? 'working' : 'idle';
  } finally {
    db.close();
  }
}

/** Atividade curta para o feed: a última mensagem relevante vira o "estará fazendo agora". */
export function lastActivity(session: OpenCodeSession, path: string): Activity | undefined {
  const lines = lastMessages(path, session.id, 8);
  const last = lines[lines.length - 1];
  if (!last) return undefined;
  const id = `${session.id}#opencode-last`;
  const at = session.updated;
  if (last.role === 'assistant')
    return /ferramenta|:/.test(last.text)
      ? { id, at, kind: 'run', icon: '⌨️', text: last.text.slice(0, 120) }
      : { id, at, kind: 'respond', icon: '💬', text: last.text.slice(0, 120) };
  if (last.role === 'user') return { id, at, kind: 'prompt', icon: '📥', text: last.text.slice(0, 120) };
  return { id, at, kind: 'respond', icon: '💬', text: last.text.slice(0, 120) };
}
