// Adaptado de marmottajr/habblaud@faa1a01 server/http/sessions.ts (MIT)
// Teste de integração do GET /api/history (servidor real + pasta de config temporária
// com transcripts sintéticos das fixtures — nada de conversas reais).
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { utimesSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RecentSession } from '../../shared/types';
import { L, tempDir, writeLines } from '../test/fixtures';
import { setQuiet } from '../log';
import { HISTORY_LIMIT, SessionHistory } from '../sources/history';
import { handleHistoryRoute, parsePaging } from './history';

setQuiet(true);

const T0 = Date.parse('2026-10-06T10:00:00Z');
const U1 = '00000000-0000-4000-8000-000000000001';
const U2 = '00000000-0000-4000-8000-000000000002';

describe('parsePaging', () => {
  const q = (search: string) => parsePaging(new URL(`http://x/api/history${search}`), HISTORY_LIMIT);

  it('padrões: sem parâmetros (limit cheio, offset 0)', () => {
    expect(q('')).toEqual({ limit: HISTORY_LIMIT, offset: 0 });
  });

  it('limit/offset válidos e erros 400', () => {
    expect(q('?limit=5&offset=10')).toEqual({ limit: 5, offset: 10 });
    for (const bad of ['?limit=0', `?limit=${HISTORY_LIMIT + 1}`, '?limit=1.5', '?limit=abc', '?offset=-1', '?offset=x', '?limit=5&limit=6', '?limit=5&offset=2&offset=3']) {
      expect(q(bad), bad).toHaveProperty('error');
    }
  });
});

describe('GET /api/history (integração)', () => {
  let base = '';
  let close: () => Promise<void> = async () => {};
  let cleanup = () => {};

  const send = (res: http.ServerResponse, status: number, body: unknown): void => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  beforeEach(async () => {
    const tmp = tempDir();
    cleanup = tmp.cleanup;
    const dir = join(tmp.dir, '.claude');
    writeLines(join(dir, 'projects/projeto-a', `${U1}.jsonl`), [
      L.prompt('pedido 1', { at: T0 }),
      L.assistant([L.text('pronto')], { at: T0 + 1000, stop: 'end_turn' }),
      L.raw('custom-title', { customTitle: 'projeto A' }),
    ]);
    writeLines(join(dir, 'projects/projeto-b', `${U2}.jsonl`), [L.prompt('pedido 2', { at: T0 + 5000 })]);
    // mtime controlado: A mais antiga, B mais recente (dentro da janela).
    const at = (path: string, ms: number) => utimesSync(path, ms / 1000, ms / 1000);
    at(join(dir, 'projects/projeto-a', `${U1}.jsonl`), T0);
    at(join(dir, 'projects/projeto-b', `${U2}.jsonl`), T0 + 5000);
    const history = new SessionHistory({
      accounts: () => [{ id: '.claude', dir }],
      openAgentOf: () => undefined,
      now: () => T0 + 6 * 24 * 3600_000,
    });
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      handleHistoryRoute(req, res, url, history, HISTORY_LIMIT, send);
    });
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () =>
      new Promise((ok) => {
        server.closeAllConnections();
        server.close(() => ok());
      });
  });

  afterEach(async () => {
    await close();
    cleanup();
  });

  it('lista as sessões, mais recente primeiro, com paginação', async () => {
    const res = await fetch(`${base}/api/history`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sessions: RecentSession[]; days: number; limit: number; offset: number };
    expect(body.days).toBe(7);
    expect(body.sessions.map((s) => s.sessionId)).toEqual([U2, U1]);
    expect(body.sessions[1]).toMatchObject({ account: '.claude', project: '/projetos/demo', open: false, title: 'projeto A' });

    const page = (await (await fetch(`${base}/api/history?limit=1&offset=1`)).json()) as typeof body;
    expect(page.sessions.map((s) => s.sessionId)).toEqual([U1]);
    expect(page.offset).toBe(1);
    const beyond = (await (await fetch(`${base}/api/history?offset=10`)).json()) as typeof body;
    expect(beyond.sessions).toEqual([]);
  });

  it('resumo: GET /api/history/:id devolve só o que a listagem expõe', async () => {
    const res = await fetch(`${base}/api/history/${U1}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ sessionId: U1, account: '.claude', project: '/projetos/demo', open: false, title: 'projeto A' });
    expect('text' in body || 'messages' in body).toBe(false); // nunca o corpo da conversa
  });

  it('erros: 400 (id não-UUID), 404 (fora da janela), 405 (não-GET)', async () => {
    const bad = await fetch(`${base}/api/history/nao-uuid`);
    expect(bad.status).toBe(400);
    const unknown = await fetch(`${base}/api/history/aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa`);
    expect(unknown.status).toBe(404);
    const post = await fetch(`${base}/api/history`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(post.status).toBe(405);
    expect(post.headers.get('allow')).toBe('GET, HEAD');
    const sub = await fetch(`${base}/api/history/${U1}/x`);
    expect(sub.status).toBe(404); // sub-rota desconhecida
  });
});
