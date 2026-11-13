// Adaptado de marmottajr/habblaud@faa1a01 server/sources/opencode/presence.ts (MIT)
// Cortado: o `expandHome` local substituído pelo de accounts/detect.ts (mesmo repositório,
// já portado) — comportamento idêntico, sem duplicar.
// Como db.ts, o construtor do `node:sqlite` é carregado com createRequire (o Vite não
// resolve o módulo nativo no load); sem ele, `undefined` = app não encontrado.
import type { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { expandHome } from '../../accounts/detect';

let SqliteCtor: typeof import('node:sqlite').DatabaseSync | undefined;
try {
  SqliteCtor = (createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: typeof import('node:sqlite').DatabaseSync }).DatabaseSync;
} catch {
  SqliteCtor = undefined;
}

/**
 * Sessões abertas agora no OpenCode. `undefined` = app não encontrado (sem sinal; quem chama usa o fallback);
 * conjunto vazio = app aberto, mas sem sessão de agente.
 */
export function readOpenSessionIds(env: NodeJS.ProcessEnv = process.env, home: string = env.HOME || homedir()): Set<string> | undefined {
  const raw = env.HABBLAUD_OPENCODE_DRAFTS?.trim();
  const candidates = raw
    ? [expandHome(raw, home)]
    : [
        join(home, 'Library', 'Application Support', 'ai.opencode.desktop', 'drafts.sqlite'),
        join(home, 'Library', 'Application Support', 'kimi-code-app', 'drafts.sqlite'), // fallback (Kimi)
      ];
  let path: string | undefined;
  for (const c of candidates) if (existsSync(c)) { path = c; break; }
  if (!path || !existsSync(path)) return undefined;
  if (!SqliteCtor) return undefined;
  let db: DatabaseSync;
  try {
    db = new SqliteCtor(path, { readOnly: true, open: true });
  } catch {
    return undefined; // lock em escrita (app ocupando WAL): tenta de novo no próximo ciclo
  }
  try {
    // `tabs` guarda um array de { type:'session', sessionId }. Juntamos todos os nomes de janela (o app pode ter várias).
    const rows = db
      .prepare("SELECT value FROM state WHERE name LIKE 'opencode.window.%' AND key = 'tabs'")
      .all() as Array<{ value: string }>;
    const out = new Set<string>();
    for (const r of rows) {
      let arr: unknown;
      try {
        arr = JSON.parse(r.value);
      } catch {
        continue;
      }
      if (!Array.isArray(arr)) continue;
      for (const t of arr) {
        if (t && typeof t === 'object') {
          const id = (t as Record<string, unknown>).sessionId;
          if (typeof id === 'string' && id) out.add(id);
        }
      }
    }
    return out;
  } catch {
    return undefined;
  } finally {
    db.close();
  }
}
