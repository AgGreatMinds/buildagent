// Vitest da lógica pura do histórico de sessões (sources/history.ts):
// isSessionId, openMainAgent e readSessionMeta (projeto, título, horários).
// Transcripts sintéticos via fixtures (nada de conversas reais).
import { statSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgentInfo } from '../../shared/types';
import { L, tempDir, writeLines } from '../test/fixtures';
import { openMainAgent, readSessionMeta, SessionHistory, isSessionId } from './history';

const T0 = Date.parse('2026-10-06T10:00:00Z');
/** UUID válido (mesmo formato dos transcripts do Claude Code). */
const U1 = '00000000-0000-4000-8000-000000000001';
const U2 = '00000000-0000-4000-8000-000000000002';
const U_OLD = '99999999-9999-4999-8999-999999999999';
const sizeOf = (path: string): number => statSync(path).size;

describe('isSessionId', () => {
  it('aceita UUID e rejeita o resto', () => {
    expect(isSessionId(U1)).toBe(true);
    expect(isSessionId('ABCDEF00-1234-4abc-8def-0123456789AB')).toBe(true);
    expect(isSessionId('../etc')).toBe(false);
    expect(isSessionId('00000000-0000-4000-8000-00000000000')).toBe(false); // 11 hex no último grupo
    expect(isSessionId('')).toBe(false);
  });
});

describe('openMainAgent', () => {
  const main = { id: '.claude:1', kind: 'main', account: '.claude', sessionId: U1, status: 'working' } as AgentInfo;
  const sub = { id: `${U1}:a`, kind: 'sub', account: '.claude', sessionId: U1, status: 'working' } as AgentInfo;
  const offline = { id: '.claude:2', kind: 'main', account: '.claude', sessionId: U2, status: 'offline' } as AgentInfo;

  it('achar, e não achar (offline, sub, outra conta/sessão)', () => {
    expect(openMainAgent([main], '.claude', U1)).toBe('.claude:1');
    expect(openMainAgent([main, sub], '.claude', U1)).toBe('.claude:1');
    expect(openMainAgent([offline], '.claude', U2)).toBeUndefined(); // offline não conta como aberto
    expect(openMainAgent([sub], '.claude', U1)).toBeUndefined(); // só agente principal
    expect(openMainAgent([main], '.outra', U1)).toBeUndefined();
  });
});

describe('readSessionMeta', () => {
  it('projeto (cwd), título (custom-title) e horários', async () => {
    const t = tempDir();
    const file = join(t.dir, 'projeto', `${U1}.jsonl`);
    writeLines(file, [
      L.prompt('primeiro pedido', { at: T0 }),
      L.assistant([L.text('respondendo')], { at: T0 + 1000, stop: 'end_turn' }),
      L.raw('custom-title', { customTitle: 'sessão renomeada' }),
    ]);
    const meta = await readSessionMeta(file, sizeOf(file));
    expect(meta.project).toBe('/projetos/demo');
    expect(meta.title).toBe('sessão renomeada');
    expect(meta.firstAt).toBe(T0);
    expect(meta.lastAt).toBe(T0 + 1000);
    t.cleanup();
  });

  it('ai-title perde para o custom-title.json da sessão (/rename)', async () => {
    const t = tempDir();
    const proj = join(t.dir, 'projeto');
    const file = join(proj, `${U1}.jsonl`);
    writeLines(file, [L.raw('ai-title', { aiTitle: 'título automático' })]);
    // Sem custom-title.json: o título automático vale.
    expect((await readSessionMeta(file, sizeOf(file))).title).toBe('título automático');
    // O /rename no disco cobre o título automático (como no watcher).
    writeLines(join(proj, `${U1}/custom-title.json`), [JSON.stringify({ customTitle: 'título dado' })]);
    expect((await readSessionMeta(file, sizeOf(file))).title).toBe('título dado');
    t.cleanup();
  });

  it('arquivo grande: título que ficou além do head é achado no fim', async () => {
    const t = tempDir();
    const file = join(t.dir, 'projeto', `${U1}.jsonl`);
    // ~900 linhas de resultado (cada uma com 80 chars) empurra o título para além dos HEAD_BYTES do começo.
    const padding = Array.from({ length: 900 }, (_, i) => L.result(`tu${i}`, 'x'.repeat(80), { at: T0 + i }));
    writeLines(file, [L.prompt('começo', { at: T0 }), ...padding, L.raw('ai-title', { aiTitle: 'fim' })]);
    const meta = await readSessionMeta(file, sizeOf(file));
    expect(meta.title).toBe('fim');
    expect(meta.firstAt).toBe(T0);
    t.cleanup();
  });
});

describe('SessionHistory.list (integração em disco)', () => {
  let t = { dir: '', cleanup: () => undefined } as ReturnType<typeof tempDir>;
  /** "Agora" da listagem: 6 dias depois de T0 (dentro da janela de 7). */
  const NOW = T0 + 6 * 24 * 3600_000;
  const accounts = () => [{ id: '.claude', dir: join(t.dir, '.claude') }];
  const p = (name: string, file: string) => join(t.dir, '.claude', 'projects', name, file);
  /** Define o mtime de um arquivo (ms) — os testes controlam a ordem sem esperar. */
  const at = (path: string, ms: number) => utimesSync(path, ms / 1000, ms / 1000);
  const mkHistory = (extra: Partial<import('./history').HistoryOptions> = {}) =>
    new SessionHistory({ accounts, openAgentOf: () => undefined, now: () => NOW, ...extra });

  it('lista por mtime (o mais recente primeiro), ignora subagentes, ids inválidos e fora da janela', async () => {
    t = tempDir();
    writeLines(p('projeto-a', `${U1}.jsonl`), [L.prompt('pedido 1', { at: T0 })]);
    writeLines(p('projeto-b', `${U2}.jsonl`), [L.prompt('pedido 2', { at: T0 + 5000 })]);
    // Subagentes e nomes que não são UUID ficam de fora.
    writeLines(join(p('projeto-a', ''), `${U1}/subagents/agent-x.jsonl`), [L.prompt('sub', { at: T0 })]);
    writeLines(p('projeto-a', 'notacao.jsonl'), [L.prompt('lixo', { at: T0 })]);
    // Sessão modificada 8 dias antes de "agora": fora da janela de 7 dias.
    writeLines(p('projeto-b', `${U_OLD}.jsonl`), [L.prompt('velho', { at: T0 })]);
    const at = (path: string, ms: number) => utimesSync(path, ms / 1000, ms / 1000);
    at(p('projeto-a', `${U1}.jsonl`), T0);
    at(p('projeto-b', `${U2}.jsonl`), T0 + 5000);
    at(p('projeto-b', `${U_OLD}.jsonl`), NOW - 8 * 24 * 3600_000);

    const list = await mkHistory().list();
    expect(list.map((s) => s.sessionId)).toEqual([U2, U1]);
    expect(list[0]).toMatchObject({ account: '.claude', project: '/projetos/demo', open: false, size: expect.any(Number) });
    t.cleanup();
  });

  it('sessão aberta (openAgentOf) aparece mesmo sem horário nos timestamps', async () => {
    t = tempDir();
    const file = p('projeto-a', `${U1}.jsonl`);
    writeLines(file, [L.raw('custom-title', { customTitle: 'sem timestamps' })]); // só linhas sem horário
    const open = mkHistory({
      openAgentOf: (acc, sid) => (acc === '.claude' && sid === U1 ? '.claude:1' : undefined),
    } as ConstructorParameters<typeof SessionHistory>[0]);
    const [s] = await open.list();
    expect(s).toMatchObject({ sessionId: U1, open: true, agentId: '.claude:1' });
    t.cleanup();
  });

  it('limite corta as mais antigas', async () => {
    t = tempDir();
    writeLines(p('a', `${U1}.jsonl`), [L.prompt('um', { at: T0 })]);
    writeLines(p('b', `${U2}.jsonl`), [L.prompt('dois', { at: T0 + 1000 })]);
    at(p('a', `${U1}.jsonl`), T0);
    at(p('b', `${U2}.jsonl`), T0 + 5000);
    const limited = mkHistory({ limit: 1 });
    expect((await limited.list()).map((s) => s.sessionId)).toEqual([U2]);
    t.cleanup();
  });

  it('conta sem projects/ não derruba a listagem', async () => {
    t = tempDir();
    const empty = new SessionHistory({
      accounts: () => [{ id: '.vazia', dir: join(t.dir, 'nao-existe') }],
      openAgentOf: () => undefined,
      now: () => T0,
    });
    expect(await empty.list()).toEqual([]);
    t.cleanup();
  });
});
