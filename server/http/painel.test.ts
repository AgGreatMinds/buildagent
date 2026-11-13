// Integração da Etapa 2 do painel: sobe o start() de verdade numa porta livre com
// HOME e dataDir temporários e prova que as rotas novas respondem — GET /api/stats,
// /api/stats/days e /api/timeline/days → 200 JSON; POST em qualquer rota → 405;
// Host fora da lista → 421. As gravações (stats/timeline) vão para a pasta de dados
// temporária, nunca para ~/.claude nem ~/.codex.
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { start, type ServerHandle } from '../index';
import { setQuiet } from '../log';

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

describe('painel (stats + timeline ligadas)', () => {
  let handle: ServerHandle;
  let port = 0;

  beforeAll(async () => {
    port = await freePort();
    const tmp = mkdtempSync(join(tmpdir(), 'buildagent-painel-'));
    // HOME vazia: nenhuma conta nem alias é lido; dataDir na pasta temporária:
    // as gravações de stats/timeline não tocam em casa alguma.
    const env = {
      ...process.env,
      BUILDAGENT_PORT: String(port),
      HOME: tmp,
      BUILDAGENT_DATA_DIR: join(tmp, 'data'),
      BUILDAGENT_USAGE_DIR: join(tmp, 'usage'),
    };
    handle = start(env);
    await new Promise<void>((r) => handle.server.once('listening', () => r()));
  });

  afterAll(async () => {
    await handle.close();
  });

  it('GET /api/stats responde 200 com o dia de hoje', async () => {
    const r = await request(port, { path: '/api/stats' });
    expect(r.status).toBe(200);
    const body = JSON.parse(r.body) as { today: string; stats: { day: string } };
    expect(body.stats.day).toBe(body.today);
  });

  it('GET /api/stats/days responde 200 com a lista de dias', async () => {
    const r = await request(port, { path: '/api/stats/days' });
    expect(r.status).toBe(200);
    const body = JSON.parse(r.body) as { tz: string; days: string[] };
    expect(Array.isArray(body.days)).toBe(true);
  });

  it('GET /api/timeline/days responde 200 com o estado de gravação', async () => {
    const r = await request(port, { path: '/api/timeline/days' });
    expect(r.status).toBe(200);
    const body = JSON.parse(r.body) as { recording: boolean; days: unknown[] };
    expect(body.recording).toBe(true); // timeline ligada por padrão (BUILDAGENT_TIMELINE ausente)
    expect(Array.isArray(body.days)).toBe(true);
  });

  it('POST responde 405 nas rotas novas', async () => {
    for (const path of ['/api/stats', '/api/stats/days', '/api/timeline/days']) {
      const r = await request(port, { path, method: 'POST' });
      expect(r.status, path).toBe(405);
    }
  });

  it('Host fora da lista responde 421 mesmo nas rotas novas', async () => {
    const r = await request(port, { path: '/api/stats', host: 'evil.example.com' });
    expect(r.status).toBe(421);
  });
});
