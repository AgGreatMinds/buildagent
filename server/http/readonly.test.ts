// Teste do contrato de somente leitura de server/index.ts: sobe o servidor numa
// porta livre e prova as três bordas — snapshot (200 + JSON), método de escrita (405)
// e Host estranho (421).
import http from 'node:http';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setQuiet } from '../log';
import { start, type ServerHandle } from '../index';

setQuiet(true);

interface Resp {
  status: number;
  body: string;
}

/** Requisição HTTP pura (fetch não deixa trocar o cabeçalho Host). */
function request(port: number, opts: { path?: string; method?: string; host?: string }): Promise<Resp> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: opts.path ?? '/',
        method: opts.method ?? 'GET',
        headers: opts.host ? { Host: opts.host } : {},
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('close', () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/** Porta livre: escuta em 0 uma vez só para ler a porta real. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = http.createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

describe('server (somente leitura)', () => {
  let handle: ServerHandle;
  let port = 0;

  beforeAll(async () => {
    port = await freePort();
    // HOME vazia: nenhuma conta nem shell alias é lido; nada toca em ~/.claude nem em dataDir.
    const env = {
      ...process.env,
      BUILDAGENT_PORT: String(port),
      HOME: mkdtempSync(join(tmpdir(), 'buildagent-test-')),
    };
    handle = start(env);
    await new Promise<void>((r) => handle.server.once('listening', () => r()));
  });

  afterAll(async () => {
    await handle.close();
  });

  it('GET /api/snapshot responde 200 com o snapshot em JSON', async () => {
    const r = await request(port, { path: '/api/snapshot' });
    expect(r.status).toBe(200);
    const parsed = JSON.parse(r.body) as { snapshot?: { rev: number; rooms: unknown[]; agents: unknown[] } };
    expect(parsed.snapshot).toBeDefined();
    expect(typeof parsed.snapshot?.rev).toBe('number');
    expect(Array.isArray(parsed.snapshot?.rooms)).toBe(true);
  });

  it('método de escrita responde 405', async () => {
    const r = await request(port, { path: '/api/snapshot', method: 'POST' });
    expect(r.status).toBe(405);
  });

  it('Host fora da lista responde 421', async () => {
    const r = await request(port, { path: '/api/snapshot', host: 'evil.example.com' });
    expect(r.status).toBe(421);
  });

  it('rota desconhecida responde 404', async () => {
    const r = await request(port, { path: '/api/outra' });
    expect(r.status).toBe(404);
  });
});
