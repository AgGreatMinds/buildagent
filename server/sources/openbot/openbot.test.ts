// Testes sintéticos do leitor do cadastro OpenBot (sem dado real): banco temporário em os.tmpdir()
// criado com node:sqlite. Se o runtime não tiver node:sqlite (Node < 22), os casos que dependem de
// banco são pulados (it.skipIf) — o próprio código é resiliente (banco ausente -> []).
// O construtor é carregado com createRequire (idêntico a server/sources/opencode/db.ts): import
// estático ou dinâmico de `node:sqlite` quebra o load do Vite.
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setQuiet } from '../../log';
import { OpenBotDirectory, readOpenBotAgents } from './db';

setQuiet(true);

/** node:sqlite só existe no Node 22+; sem ele, os casos que precisam de banco são pulados. */
let DatabaseSync: typeof import('node:sqlite').DatabaseSync | undefined;
try {
  DatabaseSync = (createRequire(import.meta.url)('node:sqlite') as unknown as { DatabaseSync: unknown }).DatabaseSync as typeof import('node:sqlite').DatabaseSync;
} catch {
  DatabaseSync = undefined;
}
const hasSqlite = Boolean(DatabaseSync);

/** Cria um banco OpenBot temporário com a tabela projection_agents e as linhas agent_json dadas. */
function makeDb(path: string, agentJsons: string[]): void {
  const db = new DatabaseSync!(path, { open: true });
  try {
    db.exec('CREATE TABLE projection_agents (agent_json TEXT);');
    const ins = db.prepare('INSERT INTO projection_agents (agent_json) VALUES (?);');
    for (const j of agentJsons) ins.run(j);
  } finally {
    db.close();
  }
}

describe('openbot/db', () => {
  let dir: string;
  let dbPath: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'openbot-test-'));
    dbPath = join(dir, 'openbot.db');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('readOpenBotAgents: banco ausente devolve [] (sem lançar)', () => {
    const r = readOpenBotAgents(join(dir, 'inexistente.db'));
    expect(r).toEqual([]);
  });

  it.skipIf(!hasSqlite)('readOpenBotAgents: banco sem a tabela devolve []', () => {
    const db = new DatabaseSync!(dbPath, { open: true });
    db.exec('CREATE TABLE outra_tabela (x TEXT);');
    db.close();
    const r = readOpenBotAgents(dbPath);
    expect(r).toEqual([]);
  });

  it.skipIf(!hasSqlite)('readOpenBotAgents: linha sem name ou sem workspacePath é ignorada; JSON inválido é ignorado', () => {
    makeDb(dbPath, [
      JSON.stringify({ name: 'SemPasta', title: 'X', provider: 'claude' }),
      JSON.stringify({ name: '', workspacePath: '/tmp/a' }),
      JSON.stringify({ workspacePath: '/tmp/a' }),
      '{não é json',
      JSON.stringify({ name: 42, workspacePath: '/tmp/a' }),
      JSON.stringify({ name: 'Válido', title: 'Cargão', provider: 'codex', workspacePath: '/tmp/valido' }),
    ]);
    const r = readOpenBotAgents(dbPath);
    // As 5 linhas ruins somem; só a válida fica, com workspace já normalizado.
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({ workspace: '/tmp/valido', name: 'Válido', title: 'Cargão', provider: 'codex' });
  });

  it.skipIf(!hasSqlite)('readOpenBotAgents: title/provider vazios viram undefined; control characters saem; name é cortado em 40', () => {
    const longName = 'x'.repeat(60);
    makeDb(dbPath, [
      JSON.stringify({ name: 'SóNome', workspacePath: '/tmp/somamente' }),
      JSON.stringify({ name: longName, title: 't'.repeat(80), provider: '   ', workspacePath: '/tmp/longo' }),
    ]);
    const r = readOpenBotAgents(dbPath);
    expect(r[0]).toEqual({ workspace: '/tmp/somamente', name: 'SóNome' });
    // title/provider vazios não aparecem como '' no objeto.
    expect(r[0].title).toBeUndefined();
    expect(r[0].provider).toBeUndefined();
    expect(r[1]?.name).toBe('x'.repeat(40));
    expect(r[1]?.title).toBe('t'.repeat(60));
    expect(r[1]?.provider).toBeUndefined();
  });

  it.skipIf(!hasSqlite)('lookup: acha o agente pela pasta exata e por subpasta', () => {
    makeDb(dbPath, [
      JSON.stringify({ name: 'Agente 135a', title: 'Engenheiro', provider: 'claude', workspacePath: '/home/u/OpenBot/Agents/agent-135a57cb' }),
      JSON.stringify({ name: 'Outro', workspacePath: '/home/u/outro' }),
    ]);
    const d = new OpenBotDirectory({ dbPath });
    const byExact = d.lookup('/home/u/OpenBot/Agents/agent-135a57cb');
    expect(byExact?.name).toBe('Agente 135a');
    expect(byExact?.title).toBe('Engenheiro');
    // Subpasta: o cwd dentro do workspace casa.
    const bySub = d.lookup('/home/u/OpenBot/Agents/agent-135a57cb/src');
    expect(bySub?.name).toBe('Agente 135a');
    // Prefixo parecido não casa (a comparação exige a barra).
    expect(d.lookup('/home/u/OpenBot/Agents/agent-135a57cb-x')).toBeUndefined();
    expect(d.lookup('/home/u/outro')).toBeDefined();
  });

  it.skipIf(!hasSqlite)('lookup: cwd normalizado (barras finais/dobras) casa como o workspace', () => {
    makeDb(dbPath, [JSON.stringify({ name: 'N', workspacePath: '/home/u/OpenBot/Agents/agent-1' })]);
    const d = new OpenBotDirectory({ dbPath });
    expect(d.lookup('/home/u//OpenBot/Agents/agent-1/')?.name).toBe('N');
  });

  it.skipIf(!hasSqlite)('lookup: cache respeita o ttl (não re-lê antes; re-lê depois)', () => {
    makeDb(dbPath, [JSON.stringify({ name: 'Início', workspacePath: '/home/u/w' })]);
    let clock = 1000;
    const d = new OpenBotDirectory({ dbPath, now: () => clock, ttlMs: 100 });
    expect(d.lookup('/home/u/w')?.name).toBe('Início');
    // Adiciona um agente no banco: antes do ttl, o cache continua entregando o estado antigo.
    const db = new DatabaseSync!(dbPath, { open: true });
    db.prepare('INSERT INTO projection_agents (agent_json) VALUES (?)').run(JSON.stringify({ name: 'Novo', workspacePath: '/home/u/novo' }));
    db.close();
    clock = 1099;
    expect(d.lookup('/home/u/novo')).toBeUndefined();
    // Passou do ttl: re-lê e encontra o novo agente.
    clock = 1101;
    expect(d.lookup('/home/u/novo')?.name).toBe('Novo');
  });

  it('lookup: banco ausente devolve undefined (não lança)', () => {
    const d = new OpenBotDirectory({ dbPath: join(dir, 'inexistente.db') });
    expect(d.lookup('/qualquer/cwd')).toBeUndefined();
  });
});
