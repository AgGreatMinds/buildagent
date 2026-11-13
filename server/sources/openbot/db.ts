// Leitor do cadastro local do OpenBot (`~/Library/Application Support/OpenBot/openbot.db`, SQLite).
//
// O OpenBot roda agentes (Claude, Codex, Pi) na pasta de trabalho `~/OpenBot/Agents/agent-<uuid>`;
// a sala aparecia como `agent-135a57cb-…` com nome sorteado. O nome e o cargo reais do agente ficam
// na tabela `projection_agents` (coluna `agent_json`, JSON com name/title/provider/workspacePath).
//
// Privacidade: a pasta do OpenBot guarda chaves e cofre — é proibido abrir qualquer outro arquivo
// dela. Aqui só se abre o banco, SEMPRE SOMENTE LEITURA e a cada leitura (sem guardar handle),
// usando node:sqlite nativo (Node 22+) carregado com createRequire — o mesmo padrão de
// server/sources/opencode/db.ts, porque import estático/dinâmico quebra o load do Vite.
// Banco ausente, módulo ausente, tabela ausente ou qualquer erro: devolve [] e só avisa uma vez.
import type { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { normalizeCwd } from '../../model/rooms';
import { errMsg, log } from '../../log';
import { tr } from '../../../shared/i18n';

/** Agente do OpenBot como o escritório precisa: pasta de trabalho e identidade legível. */
export interface OpenBotAgent {
  /** Pasta do agente (workspacePath), já normalizada. */
  workspace: string;
  name: string;
  title?: string;
  provider?: string;
}

/** Construtor do node:sqlite se o runtime tiver (Node 22+); undefined = não há banco que se consiga ler. */
let SqliteCtor: typeof import('node:sqlite').DatabaseSync | undefined;
try {
  SqliteCtor = (createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: typeof import('node:sqlite').DatabaseSync }).DatabaseSync;
} catch {
  SqliteCtor = undefined;
}

function sanitizeText(v: unknown, limit?: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  // Remove caracteres de controle e recorta no limite quando houver (name 40, title 60).
  const clean = v
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  if (!clean) return undefined;
  return limit ? clean.slice(0, limit) : clean;
}

/**
 * Lê o cadastro de agentes do banco OpenBot. Abre e fecha o banco por chamada; nunca lança —
 * qualquer problema (banco ausente, node:sqlite ausente, tabela ausente, JSON ruim) vira [].
 */
export function readOpenBotAgents(dbPath: string, warnMissing = true): OpenBotAgent[] {
  if (!SqliteCtor) {
    log.warnOnce('openbot-sqlite', tr('OpenBot: node:sqlite indisponível neste runtime (requer Node 22+).'));
    return [];
  }
  if (!existsSync(dbPath)) {
    // Caminho padrão numa máquina sem OpenBot é o caso normal: só avisa quando o caminho foi pedido.
    if (warnMissing) log.warnOnce('openbot-db-missing', tr('OpenBot: banco {0} não existe.', [dbPath]));
    return [];
  }
  let db: DatabaseSync;
  try {
    db = new SqliteCtor(dbPath, { readOnly: true, open: true });
  } catch (err) {
    log.warnOnce('openbot-open', tr('OpenBot: banco ilegível ({0}).', [errMsg(err)]));
    return [];
  }
  try {
    // Consulta fixa: só a tabela projection_agents e a coluna agent_json. Nada mais.
    const rows = db
      .prepare('SELECT agent_json FROM projection_agents')
      .all() as Array<{ agent_json: string | null }>;
    const out: OpenBotAgent[] = [];
    for (const r of rows) {
      let raw: Record<string, unknown>;
      try {
        raw = JSON.parse(r.agent_json ?? '') as Record<string, unknown>;
      } catch {
        continue; // JSON inválido: ignora a linha.
      }
      const workspace = sanitizeText(raw.workspacePath);
      const name = sanitizeText(raw.name, 40);
      if (!workspace || !name) continue; // linha sem name ou sem workspacePath é ignorada.
      const title = sanitizeText(raw.title, 60);
      const provider = sanitizeText(raw.provider);
      out.push({ workspace: normalizeCwd(workspace), name, ...(title ? { title } : {}), ...(provider ? { provider } : {}) });
    }
    return out;
  } catch (err) {
    // Tabela ausente ou qualquer erro de leitura: [] e aviso único.
    log.warnOnce('openbot-read', tr('OpenBot: falha ao ler projection_agents ({0}).', [errMsg(err)]));
    return [];
  } finally {
    db.close();
  }
}

/**
 * Cache com TTL por cima de readOpenBotAgents: re-lê no máximo a cada ttlMs (padrão 15000).
 * `lookup` casa o cwd normalizado com o workspace igual ou dentro dele (`workspace + '/'`).
 */
export class OpenBotDirectory {
  private dbPath: string;
  private now: () => number;
  private ttlMs: number;
  private loadedAt = 0;
  private cached: OpenBotAgent[] = [];
  private warnMissing: boolean;

  constructor(opts: { dbPath: string; now?: () => number; ttlMs?: number; warnMissing?: boolean }) {
    this.dbPath = opts.dbPath;
    this.warnMissing = opts.warnMissing ?? true;
    this.now = opts.now ?? Date.now;
    this.ttlMs = opts.ttlMs ?? 15000;
  }

  /** Agente cujo workspace é igual ao cwd normalizado, ou o cwd mora dentro dele. */
  lookup(cwd: string): OpenBotAgent | undefined {
    const now = this.now();
    if (now - this.loadedAt >= this.ttlMs) {
      this.cached = readOpenBotAgents(this.dbPath, this.warnMissing);
      this.loadedAt = now;
    }
    const target = normalizeCwd(cwd);
    for (const a of this.cached) {
      if (a.workspace === target || target.startsWith(a.workspace + '/')) return a;
    }
    return undefined;
  }
}
