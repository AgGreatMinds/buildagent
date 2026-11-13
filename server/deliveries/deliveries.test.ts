// Testes das entregas locais: repositório git temporário (init + commits + merge local)
// valida a extração; git ausente/falha → [] com warning, nunca erro 500. O handler é testado com
// stub de exec (sem git de verdade); readRoomGit usa o git real quando existe (pula senão).
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { prNumberFromText, pushBranchFromText } from '../sources/github';
import { readRoomGit, type GitExec } from './git';
import { createDeliveriesHandler, type RoomRef } from './index';

const SEP = '\x1f';

describe('extração de PR/push na saída (regex portados do projeto de origem)', () => {
  it('pega o nº do PR em mensagens de merge', () => {
    expect(prNumberFromText('Merge pull request #12 from dev/feature')).toBe(12);
    expect(prNumberFromText('Merge #42 into main')).toBe(42);
    expect(prNumberFromText('abriu o PR')).toBeUndefined();
  });

  it('pega a branch do push na saída "To <remoto>"', () => {
    expect(pushBranchFromText('To https://github.com/x/y.git\n   7917867..32a2814  main -> main')).toBe('main');
    expect(pushBranchFromText('git: não há remoto')).toBeUndefined();
  });
});

describe('readRoomGit com git real (repositório temporário)', () => {
  let dir = '';
  let skipped = false;

  const git = (args: string): void => {
    execSync(`git -C ${JSON.stringify(dir)} ${args}`, { stdio: 'pipe', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } });
  };

  afterAll(() => {
    if (dir && !skipped) rmSync(dir, { recursive: true, force: true });
  });

  const setupRepo = (): void => {
    dir = mkdtempSync(join(tmpdir(), 'deliveries-git-'));
    git('init -q -b main'); // branch fixa: o padrão muda de máquina para máquina (main no macOS, master em muito Linux)
    git('config user.email "a@b"');
    git('config user.name "Ana"');
    writeFileSync(join(dir, 'a.txt'), 'x');
    git('add -A');
    git('commit -q -m "chama inicial"');
    git('checkout -qb feature');
    writeFileSync(join(dir, 'a.txt'), 'xy');
    git('add -A');
    git('commit -q -m "Merge pull request #12 from dev/feature"'); // merge com nº de PR (história local)
    git('checkout -q main');
    git(`merge -q --no-ff feature -m "Merge branch 'feature' (PR #12)"`);
  };

  const gitAvailable = (): boolean => {
    try {
      execSync('git --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  };

  it('lê commits e merges; o merge aponta o nº do PR', async () => {
    if (!gitAvailable()) {
      skipped = true;
      return; // sem git na máquina: pulado, não falha
    }
    setupRepo();
    const read = await readRoomGit(dir);
    expect(read.warning).toBeUndefined();
    expect(read.commits.length).toBeGreaterThanOrEqual(3);
    expect(read.merges.length).toBeGreaterThanOrEqual(1);
    const withPr = read.merges.find((m) => m.isMerge && m.pr !== undefined);
    expect(withPr?.pr).toBe(12);
    // campos mínimos e sem SELECT-estilo: só o necessário
    expect(read.commits[0]).toMatchObject({ sha: expect.any(String), author: expect.any(String), date: expect.any(String), subject: expect.any(String) });
  });

  it('pasta sem repositório: [] com warning, sem exceção', async () => {
    if (!gitAvailable()) {
      skipped = true;
      return;
    }
    const empty = mkdtempSync(join(tmpdir(), 'deliveries-empty-'));
    const read = await readRoomGit(empty);
    expect(read.commits).toEqual([]);
    expect(read.merges).toEqual([]);
    expect(read.warning).toBe('sem repositório git nesta pasta');
    rmSync(empty, { recursive: true, force: true });
  });
});

describe('handler GET /api/deliveries (stub de exec, sem git)', () => {
  const COMMIT = `abc1234${SEP}Ana${SEP}2026-10-30 12:00:00 +0000${SEP}primeira chamada`;
  const MERGE = `def5678${SEP}Ana${SEP}2026-10-30 12:05:00 +0000${SEP}Merge pull request #12 from dev/feature`;

  /** Stub de exec: devolve `commits` para "log -n50" e `merges` para a chamada com --merges. */
  function execOf(commits: string, merges: string): GitExec {
    return (args, _timeout, cb) => {
      const out = args.includes('--merges') ? merges : commits;
      queueMicrotask(() => cb(null, out));
      return undefined;
    };
  }

  // A pasta lida pode ter um .git/config de terceiros: as opções -c vêm antes do -C e desligam o que executaria programa.
  it('chama o git com a verificação de assinatura e o fsmonitor desligados', async () => {
    const calls: string[][] = [];
    const exec: GitExec = (args, _timeout, cb) => {
      calls.push([...args]);
      queueMicrotask(() => cb(null, args.includes('--merges') ? MERGE : COMMIT));
      return undefined;
    };
    await readRoomGit('/p/x', { exec });
    expect(calls.length).toBe(2);
    for (const a of calls) expect(a.slice(0, 6)).toEqual(['-c', 'log.showSignature=false', '-c', 'core.fsmonitor=false', '-C', '/p/x']);
  });

  // Dado pessoal: o formato pedido ao git não pode incluir e-mail de autor nem de quem commitou.
  it('pede ao git só o nome do autor, nunca o e-mail', async () => {
    const formats: string[] = [];
    const exec: GitExec = (args, _timeout, cb) => {
      formats.push(...args.filter((a) => a.startsWith('--pretty')));
      queueMicrotask(() => cb(null, args.includes('--merges') ? MERGE : COMMIT));
      return undefined;
    };
    const read = await readRoomGit('/p/x', { exec });
    expect(formats.length).toBeGreaterThan(0);
    for (const f of formats) expect(f).not.toMatch(/%[ac][eEl]/); // %ae/%aE/%al e os equivalentes de committer
    expect(read.commits[0].author).toBe('Ana');
    expect(JSON.stringify(read)).not.toContain('@');
  });

  it('agrega por sala: commits, merges e nº de PR extraído', async () => {
    const rooms: RoomRef[] = [
      { id: '/p/x', name: 'x', path: '/p/x' },
      { id: '/p/y', name: 'y', path: '/p/y' },
    ];
    const handler = createDeliveriesHandler({
      rooms: () => rooms,
      exec: execOf(COMMIT, MERGE),
    });
    let status = 0;
    let body: unknown;
    const res = {
      setHeader: () => {},
      writeHead: (s: number) => {
        status = s;
      },
      end: (out?: string) => {
        body = out ? JSON.parse(out) : {};
      },
    };
    expect(handler({ method: 'GET' } as never, res as never, new URL('http://x/api/deliveries'))).toBe(true);
    await new Promise((r) => setTimeout(r, 30)); // deixa o Promise.all assíncrono terminar
    expect(status).toBe(200);
    const deliveries = (body as { deliveries: Array<Record<string, unknown>> }).deliveries;
    expect(deliveries.map((d) => d.roomId)).toEqual(['/p/x', '/p/y']);
    for (const d of deliveries) {
      expect((d.commits as Array<{ subject: string }>).length).toBe(1);
      expect((d.merges as Array<{ pr?: number }>).length).toBe(1);
      expect(((d.merges as Array<{ pr?: number }>)[0].pr)).toBe(12);
    }
  });

  it('sala com git ausente: arrays vazios + warning (nunca falha a rota)', async () => {
    const err = new Error('spawn git ENOENT') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    const rooms: RoomRef[] = [{ id: '/p/x', name: 'x', path: '/p/x' }];
    const handler = createDeliveriesHandler({ rooms: () => rooms, exec: (_args, _t, cb) => void cb(err, '') });
    let body: unknown;
    const res = {
      setHeader: () => {},
      writeHead: () => {},
      end: (out?: string) => {
        body = JSON.parse(out ?? '{}');
      },
    };
    handler({ method: 'GET' } as never, res as never, new URL('http://x/api/deliveries'));
    await new Promise((r) => setTimeout(r, 30));
    const d = (body as { deliveries: Array<{ warning?: string; commits: unknown[] }> }).deliveries[0];
    expect(d.commits).toEqual([]);
    expect(d.warning).toBeDefined();
  });

  it('sub-rotas e não-GET seguem o padrão (false / 405)', async () => {
    const res = { setHeader: () => {}, writeHead: (s: number) => (status = s), end: () => {} };
    let status = 0;
    const handler = createDeliveriesHandler({ rooms: () => [] });
    expect(handler({ method: 'GET' } as never, res as never, new URL('http://x/api/deliveries/extra'))).toBe(false);
    expect(handler({ method: 'POST' } as never, res as never, new URL('http://x/api/deliveries'))).toBe(true);
    expect(status).toBe(405);
  });
});
