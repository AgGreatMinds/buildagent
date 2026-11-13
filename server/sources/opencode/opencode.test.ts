// Testes sintéticos da fonte OpenCode (sem dado real): banco temporário criado com node:sqlite,
// fixtures de sessão/mensagem inventadas. Se o runtime não tiver node:sqlite (Node < 22), os casos
// dependem dele e são pulados — o próprio código é resiliente (banco ausente -> resultado vazio).
// O construtor é carregado com createRequire (idêntico a db.ts/presence.ts): import estático ou
// dinâmico de `node:sqlite` quebra o load do Vite.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it } from 'vitest';
import { setQuiet } from '../../log';
import type { AccountsService } from '../../accounts/service';
import { NameStore } from '../../model/names';
import { Office } from '../../model/office';
import { detectOpenCodeAccounts, discoverOpenCodeDirs, defaultOpenCodeDb } from './accounts';
import { lastActivity, lastMessages, pollSessions, sessionStatus, type OpenCodeSession } from './db';
import { OpenCodeSource } from './source';

setQuiet(true);

/** node:sqlite só existe no Node 22+; sem ele, os casos que precisam de banco são pulados. */
let DatabaseSync: typeof import('node:sqlite').DatabaseSync | undefined;
try {
  DatabaseSync = (createRequire(import.meta.url)('node:sqlite') as unknown as { DatabaseSync: unknown }).DatabaseSync as typeof import('node:sqlite').DatabaseSync;
} catch {
  DatabaseSync = undefined;
}
const can = DatabaseSync ? it : it.skip;

interface SeedRow {
  id: string;
  parentId?: string;
  directory?: string;
  agent?: string;
  model?: string;
  title?: string;
  created: number;
  updated: number;
  archived?: number;
  suspended?: number;
}

function makeDb(path: string, sessions: SeedRow[], messages: Array<{ seq: number; session: string; type: string; at: number; data: unknown }>): void {
  // Chamado só pelos casos `can` (runtime com node:sqlite); `!` acode o estrito.
  const db = new DatabaseSync!(path, { open: true });
  try {
    db.exec(
      `CREATE TABLE session_v2 (
         id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT, directory TEXT, title TEXT,
         agent TEXT, model TEXT, time_created INTEGER, time_updated INTEGER,
         time_archived INTEGER, time_suspended INTEGER, idle_outcome TEXT
       );
       CREATE TABLE session_message (
         session_id TEXT, seq INTEGER, type TEXT, time_created INTEGER, data TEXT,
         PRIMARY KEY (session_id, seq)
       );`,
    );
    const insS = db.prepare(
      'INSERT INTO session_v2 (id, project_id, parent_id, directory, title, agent, model, time_created, time_updated, time_archived, time_suspended, idle_outcome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    for (const s of sessions) {
      insS.run(s.id, 'proj-x', s.parentId ?? null, s.directory ?? '/projetos/demo', s.title ?? 'título sintético', s.agent ?? null, s.model ?? null, s.created, s.updated, s.archived ?? null, s.suspended ?? null, null);
    }
    const insM = db.prepare('INSERT INTO session_message (seq, session_id, type, time_created, data) VALUES (?, ?, ?, ?, ?)');
    for (const m of messages) insM.run(m.seq, m.session, m.type, m.at, JSON.stringify(m.data));
  } finally {
    db.close();
  }
}

describe('opencode/db', () => {
  let dir: string;
  let dbPath: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'opencode-test-'));
    dbPath = join(dir, 'opencode.db');
  });

  it('pollSessions: banco ausente devolve ok:false e vazio (sem erro)', () => {
    const r = pollSessions(join(dir, 'inexistente.db'), Date.now());
    expect(r.ok).toBe(false);
    expect(r.sessions).toEqual([]);
  });

  can('pollSessions: janela de recência, arquivadas e suspensas', () => {
    const now = 1_000_000;
    makeDb(dbPath, [
      { id: 's-ativa', created: now - 60_000, updated: now - 1_000 },
      { id: 's-arq', created: now - 120_000, updated: now - 2_000, archived: now - 60_000 },
      { id: 's-susp', created: now - 50_000, updated: now - 1_000, suspended: now - 30_000 },
      { id: 's-velha', created: now - 10 * 3600_000, updated: now - 2 * 3600_000 },
    ], []);
    const r = pollSessions(dbPath, now, 30 * 60_000);
    expect(r.ok).toBe(true);
    expect(r.sessions.map((s) => s.id)).toEqual(['s-ativa']);
    // Com includeSuspended a suspensa volta a entrar; arquivada nunca.
    const r2 = pollSessions(dbPath, now, 30 * 60_000, { includeSuspended: true });
    expect(r2.sessions.map((s) => s.id).sort()).toEqual(['s-ativa', 's-susp']);
    expect(r2.sessions.find((s) => s.id === 's-susp')?.suspended).toBe(false);
  });

  // O título vem da conversa e sai pela API: chave reconhecida é mascarada na leitura do banco.
  can('pollSessions: título com chave sai mascarado', () => {
    const now = 1_000_000;
    makeDb(dbPath, [{ id: 's-chave', title: 'Deploy com sk-proj-exemplo0123456789', created: now - 60_000, updated: now - 1_000 }], []);
    expect(pollSessions(dbPath, now, 30 * 60_000).sessions[0].title).toBe('Deploy com sk-***');
  });

  can('lastMessages: ordem cronológica, texto de user e assistant (texto + ferramenta)', () => {
    const now = 1_000_000;
    makeDb(
      dbPath,
      [{ id: 's1', created: now - 60_000, updated: now }],
      [
        { seq: 1, session: 's1', type: 'user', at: now - 30_000, data: { text: 'conserte o build' } },
        { seq: 2, session: 's1', type: 'assistant', at: now - 20_000, data: { content: [{ type: 'text', text: 'olhando' }, { type: 'tool', name: 'Bash', input: { command: 'npm test' } }] } },
        { seq: 3, session: 's1', type: 'assistant', at: now - 10_000, data: { content: [] } }, // sem texto: é pulada
      ],
    );
    const lines = lastMessages(dbPath, 's1');
    expect(lines.map((l) => [l.role, l.at])).toEqual([
      ['user', now - 30_000],
      ['assistant', now - 20_000],
    ]);
    expect(lines[1].text).toContain('olhando');
    expect(lines[1].text).toContain('Bash: npm test');
  });

  can('sessionStatus: assistant após o último idle = working; senão idle', () => {
    const now = 1_000_000;
    makeDb(
      dbPath,
      [{ id: 'sw', created: now - 60_000, updated: now }, { id: 'si', created: now - 60_000, updated: now }],
      [
        { seq: 1, session: 'sw', type: 'assistant', at: now - 30_000, data: {} },
        { seq: 2, session: 'sw', type: 'idle', at: now - 20_000, data: { outcome: 'succeeded' } },
        { seq: 3, session: 'sw', type: 'assistant', at: now - 5_000, data: {} },
        { seq: 1, session: 'si', type: 'idle', at: now - 5_000, data: {} },
      ],
    );
    expect(sessionStatus(dbPath, 'sw')).toBe('working');
    expect(sessionStatus(dbPath, 'si')).toBe('idle');
    expect(sessionStatus(join(dir, 'inexistente.db'), 'sw')).toBe('idle'); // banco ausente: nunca derruba
  });

  can('lastActivity: última mensagem relevante vira atividade do feed', () => {
    const now = 1_000_000;
    makeDb(
      dbPath,
      [{ id: 's1', created: now - 60_000, updated: now }],
      [{ seq: 1, session: 's1', type: 'user', at: now - 30_000, data: { text: 'escreva o teste' } }],
    );
    const s: OpenCodeSession = pollSessions(dbPath, now, 30 * 60_000).sessions[0];
    const act = lastActivity(s, dbPath);
    expect(act).toMatchObject({ kind: 'prompt', id: 's1#opencode-last', at: s.updated });
  });
});

describe('opencode/accounts', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'opencode-acct-'));
  });

  it('defaultOpenCodeDb: BUILDAGENT_OPENCODE_DB com ~ expandida; senão o padrão do home', () => {
    expect(defaultOpenCodeDb({ BUILDAGENT_OPENCODE_DB: '~/db/opencode.db' } as NodeJS.ProcessEnv, '/home/u')).toBe('/home/u/db/opencode.db');
    expect(defaultOpenCodeDb({} as NodeJS.ProcessEnv, '/home/u')).toBe('/home/u/.local/share/opencode/opencode.db');
  });

  it('discoverOpenCodeDirs: override por vírgula (pasta ou .db) e só entra o que existe', () => {
    const db = join(dir, 'opencode.db');
    writeFileSync(db, Buffer.from('x'));
    // Dois itens: a pasta do banco (existe) e um caminho .db inexistente (mantido na lista, mas inerte).
    const env = { BUILDAGENT_OPENCODE_DIRS: `${dir},${join(dir, 'outro', 'opencode.db')}` } as NodeJS.ProcessEnv;
    expect(discoverOpenCodeDirs(env, '/home/u')).toEqual([db, join(dir, 'outro', 'opencode.db')]);
  });

  it('discoverOpenCodeDirs: sem override, só o banco padrão se existir', () => {
    const env = { HOME: dir } as NodeJS.ProcessEnv;
    expect(discoverOpenCodeDirs(env, dir)).toEqual([]); // nada em dir/.local/share/opencode
    const db = join(dir, '.local', 'share', 'opencode', 'opencode.db');
    mkdirSync(join(db, '..'), { recursive: true });
    writeFileSync(db, Buffer.from('x'));
    expect(discoverOpenCodeDirs(env, dir)).toEqual([db]);
  });

  it('detectOpenCodeAccounts: uma conta por banco, letra O e cor sem repetir as tomadas', () => {
    const a = detectOpenCodeAccounts([join(dir, 'a', 'opencode.db')]);
    expect(a[0]).toMatchObject({ provider: 'opencode', short: 'O', name: 'OpenCode', color: '#f08a3c' });
    // "O" tomado: cai para a próxima letra
    const b = detectOpenCodeAccounts([join(dir, 'a', 'opencode.db')], { taken: { shorts: ['o'] } });
    expect(b[0].short).toBe('O2');
    // cor tomada: pula na paleta
    const c = detectOpenCodeAccounts([join(dir, 'a', 'opencode.db')], { taken: { colors: ['#f08a3c'] } });
    expect(c[0].color).toBe('#4aa8e8');
  });
});

describe('opencode/source', () => {
  let dir: string;
  let dbPath: string;
  const now0 = 2_000_000;
  let clock = now0;
  const now = () => clock;

  function makeOffice(): Office {
    return new Office({
      names: new NameStore(null),
      version: 'teste',
      startedAt: now0,
      accounts: () => [],
      sources: () => [],
      accountName: () => undefined,
      now,
    });
  }

  beforeEach(() => {
    clock = now0;
    dir = mkdtempSync(join(tmpdir(), 'opencode-src-'));
    dbPath = join(dir, 'opencode.db');
  });

  can('smoke: sessão ativa vira agente no escritório; sessão some, agente vai para offline', async () => {
    makeDb(dbPath, [{ id: 's1', agent: 'dedalo', created: now0 - 60_000, updated: now0 }], [
      { seq: 1, session: 's1', type: 'user', at: now0 - 40_000, data: { text: 'faça X' } },
      { seq: 2, session: 's1', type: 'idle', at: now0 - 30_000, data: { outcome: 'succeeded' } },
      { seq: 3, session: 's1', type: 'assistant', at: now0 - 5_000, data: {} },
    ]);
    // Stub mínimo do AccountsService (as operações que a fonte usa). `home` aponta para uma
    // pasta temporária: sem drafts.sqlite por lá, presence cai no fallback de recência.
    const detected = detectOpenCodeAccounts([dbPath]);
    const entries = detected.map((d) => ({ id: d.id, provider: 'opencode' as const, dir: dbPath, detected: d }));
    const stubAccounts = {
      entries: () => [],
      entriesOf: () => [],
      setProviderAccounts: () => entries,
    };
    const office = makeOffice();
    const source = new OpenCodeSource({ accounts: stubAccounts as unknown as AccountsService, office, dirs: [dbPath], env: {}, home: dir, now, pollMs: 25 });
    source.start();
    const key = `${entries[0].id}:s1`;
    expect(office.has(key)).toBe(true);
    expect(office.get(key)?.status).toBe('working');
    // Sessão some do banco: o próximo ciclo fecha o agente (vira 'offline' com período de graça).
    const db2 = new DatabaseSync!(dbPath, { open: true });
    db2.prepare('DELETE FROM session_v2 WHERE id = ?').run('s1');
    db2.close();
    clock += 30 * 60_000; // fora da janela de recência
    await new Promise((r) => setTimeout(r, 80)); // deixa o intervalo (25 ms) rodar pelo menos um ciclo
    expect(office.get(key)?.status).toBe('offline');
    source.stop();
  });
});
