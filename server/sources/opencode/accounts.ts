// Portado de marmottajr/habblaud@faa1a01 server/sources/opencode/accounts.ts (MIT)
// Descoberta da conta do OpenCode. O OpenCode guarda tudo num SQLite único
// (`~/.local/share/opencode/opencode.db`), então há UMA conta lógica (o banco local),
// não várias pastas como no Claude Code. A conta entra no AccountsService com
// `provider: 'opencode'` e aparece no escritório como a letra "O".
//
// Privacidade: não se lê credencial nem arquivo de configuração — só o caminho do banco.
// No Docker, HABBLAUD_OPENCODE_DB dá o caminho do banco montado; fora do Docker é o padrão do host.
import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { ACCOUNT_COLORS, expandHome, type DetectedAccount } from '../../accounts/detect';

function splitList(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Banco padrão do OpenCode: HABBLAUD_OPENCODE_DB ou $HOME/.local/share/opencode/opencode.db. */
export function defaultOpenCodeDb(env: NodeJS.ProcessEnv, home: string): string {
  const raw = env.HABBLAUD_OPENCODE_DB?.trim();
  if (raw) return expandHome(raw, home);
  return join(home, '.local', 'share', 'opencode', 'opencode.db');
}

/**
 * Pastas (um por banco) observadas. HABBLAUD_OPENCODE_DIRS (lista separada por vírgula, cada item sendo a pasta
 * que contém o `opencode.db` ou o próprio caminho do .db) substitui a detecção. Senão, o banco padrão.
 * Só entra se o arquivo existir (sem ele não há o quê ler).
 */
export function discoverOpenCodeDirs(env: NodeJS.ProcessEnv = process.env, home: string = env.HOME || homedir()): string[] {
  const override = splitList(env.HABBLAUD_OPENCODE_DIRS);
  if (override.length) {
    const dirs = override.map((p) => expandHome(p, home));
    // Um item pode ser a pasta do banco ou o próprio caminho do .db; normaliza para o caminho do arquivo.
    const dbs = dirs.map((p) => {
      if (isFile(p)) return p;
      const c = join(p, 'opencode.db');
      return isFile(c) ? c : p;
    });
    return [...new Set(dbs)];
  }
  const main = defaultOpenCodeDb(env, home);
  return existsSync(main) ? [main] : [];
}

/** Uma conta por banco, NA MESMA ORDEM de `dirs`. Letra "O" (ou a próxima livre), cor da paleta sem repetir. */
export function detectOpenCodeAccounts(dirs: string[], opts: { taken?: { shorts?: Iterable<string>; colors?: Iterable<string> } } = {}): DetectedAccount[] {
  const usedShorts = new Set([...(opts.taken?.shorts ?? [])].map((s) => s.toUpperCase()));
  const usedColors = new Set(opts.taken?.colors ?? []);
  return dirs.map((dbPath, i) => {
    // Pasta do banco vira o "config dir" lógico (para exibição e para o `setProviderAccounts`).
    const cfg = dbPath.endsWith('.db') ? dbPath.slice(0, -'.db'.length) : dbPath;
    let short = 'O';
    if (usedShorts.has('O')) {
      short = i === 0 ? 'O2' : String.fromCharCode(65 + (i % 26));
    }
    usedShorts.add(short.toUpperCase());
    let color = ACCOUNT_COLORS.find((c) => !usedColors.has(c));
    if (!color) {
      color = ACCOUNT_COLORS[usedColors.size % ACCOUNT_COLORS.length];
      usedColors.add(color);
    }
    return {
      id: resolve(cfg),
      provider: 'opencode' as const,
      configDir: cfg,
      short,
      name: 'OpenCode',
      color,
    };
  });
}
