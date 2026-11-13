// Entrega do cliente construído: tipos, cache, HEAD e, principalmente, nada fora da pasta.
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStaticHandler } from './static';

let base: string;
let server: http.Server;

/** Requisição crua: o `fetch` normaliza `..` antes de enviar, então os caminhos hostis vão pelo http direto. */
function get(path: string, method = 'GET', headers: http.OutgoingHttpHeaders = {}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const { port } = server.address() as AddressInfo;
    const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'buildagent-static-'));
  const dir = join(base, 'client');
  mkdirSync(join(dir, 'assets', 'people'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>predio</title>');
  writeFileSync(join(dir, 'assets', 'main-BFqheOCa.js'), 'console.log(1)');
  writeFileSync(join(dir, 'assets', 'people', 'pessoa.glb'), 'glTF');
  mkdirSync(join(dir, 'assets', 'city'), { recursive: true });
  writeFileSync(join(dir, 'assets', 'city', 'road-straight.glb'), 'glTF'); // hífen + 8 letras, mas sem hash
  writeFileSync(join(dir, 'GeneralSans-Variable.woff2'), 'wOF2');
  writeFileSync(join(base, 'segredo.txt'), 'FORA-DA-PASTA');
  symlinkSync(join(base, 'segredo.txt'), join(dir, 'atalho.txt'));
  const handler = createStaticHandler({ dir });
  server = http.createServer((req, res) => {
    if (handler(req, res, new URL(req.url ?? '/', 'http://localhost'))) return;
    res.writeHead(404).end('nada');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  rmSync(base, { recursive: true, force: true });
});

describe('http/static', () => {
  it('serve o index na raiz, sem cache, com nosniff', async () => {
    const r = await get('/');
    expect(r.status).toBe(200);
    expect(r.body).toContain('predio');
    expect(r.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(r.headers['cache-control']).toBe('no-cache');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });

  it('arquivo com hash ganha cache imutável; o GLB sai com o tipo certo', async () => {
    const js = await get('/assets/main-BFqheOCa.js');
    expect(js.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(js.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    const glb = await get('/assets/people/pessoa.glb');
    expect(glb.headers['content-type']).toBe('model/gltf-binary');
    expect(glb.headers['cache-control']).toBe('no-cache');
  });

  it('nome comum com hífen e 8 letras não é hash: revalida sempre', async () => {
    expect((await get('/assets/city/road-straight.glb')).headers['cache-control']).toBe('no-cache');
    expect((await get('/GeneralSans-Variable.woff2')).headers['cache-control']).toBe('no-cache');
  });

  it('revalidação: mesmo ETag devolve 304 sem corpo; ETag velho devolve o arquivo', async () => {
    const primeiro = await get('/assets/people/pessoa.glb');
    const etag = primeiro.headers.etag as string;
    expect(etag).toMatch(/^W\/"/);
    const igual = await get('/assets/people/pessoa.glb', 'GET', { 'If-None-Match': etag });
    expect(igual.status).toBe(304);
    expect(igual.body).toBe('');
    const velho = await get('/assets/people/pessoa.glb', 'GET', { 'If-None-Match': 'W/"0-0"' });
    expect(velho.status).toBe(200);
    expect(velho.body).toBe('glTF');
  });

  it('HEAD devolve os cabeçalhos sem corpo', async () => {
    const r = await get('/index.html', 'HEAD');
    expect(r.status).toBe(200);
    expect(r.headers['content-length']).toBe('36');
    expect(r.body).toBe('');
  });

  it('nunca entrega arquivo de fora da pasta', async () => {
    for (const path of ['/../segredo.txt', '/assets/../../segredo.txt', '/%2e%2e/segredo.txt', '/..%2fsegredo.txt', '/assets/..%5c..%5csegredo.txt', '/atalho.txt', '/%00', '/%E0%A4%A']) {
      const r = await get(path);
      expect([path, r.status]).toEqual([path, 404]);
      expect(r.body).not.toContain('FORA-DA-PASTA');
    }
  });

  it('arquivo inexistente e método de escrita não são atendidos', async () => {
    expect((await get('/nao-existe.js')).status).toBe(404);
    expect((await get('/index.html', 'POST')).status).toBe(404);
  });

  it('sem o build, a raiz explica o que falta', async () => {
    const handler = createStaticHandler({ dir: join(base, 'nao-construido') });
    const s = http.createServer((req, res) => {
      if (!handler(req, res, new URL(req.url ?? '/', 'http://localhost'))) res.writeHead(404).end();
    });
    await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
    const r = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/`);
    expect(r.status).toBe(503);
    expect(await r.text()).toContain('npm run build');
    await new Promise((d) => s.close(d));
  });
});
