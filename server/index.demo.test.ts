// Modo demonstração de ponta a ponta: o servidor sobe sem ler nada real e sem escrever fora da subpasta de demo.
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { start, type ServerHandle } from './index';

const PORT = 47650 + Math.floor(Math.random() * 300); // porta alta, fora da padrão (4750)
let base: string;
let handle: ServerHandle;

const get = (path: string) => fetch(`http://127.0.0.1:${PORT}${path}`);

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'buildagent-demo-'));
  handle = start({ HOME: join(base, 'home'), HABBLAUD_DEMO: '1', HABBLAUD_PORT: String(PORT), HABBLAUD_DATA_DIR: join(base, 'data'), HABBLAUD_UPDATE_CHECK: '0' });
  await new Promise<void>((ok) => handle.server.once('listening', () => ok()));
});

afterAll(async () => {
  await handle.close();
  rmSync(base, { recursive: true, force: true });
});

describe('servidor em modo demonstração', () => {
  it('o snapshot é fictício: salas e contas vêm do simulador, nenhuma do disco', async () => {
    const { snapshot } = (await (await get('/api/snapshot')).json()) as { snapshot: { meta: { demo?: boolean }; accounts: Array<{ configDir: string }>; rooms: Array<{ path: string }>; agents: unknown[] } };
    expect(snapshot.meta.demo).toBe(true);
    for (const a of snapshot.accounts) expect(a.configDir.startsWith('/demo')).toBe(true); // conta fictícia do simulador
    expect(snapshot.agents.length).toBeGreaterThan(0);
    for (const r of snapshot.rooms) expect(r.path.startsWith('/demo/')).toBe(true);
  });

  // Vale para API, página e erro: ninguém embute o painel em outra página e o navegador não adivinha o tipo.
  it('toda resposta leva os cabeçalhos de proteção', async () => {
    for (const path of ['/api/snapshot', '/', '/nao-existe']) {
      const r = await get(path);
      expect(r.headers.get('x-content-type-options')).toBe('nosniff');
      expect(r.headers.get('x-frame-options')).toBe('DENY');
      expect(r.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
      await r.arrayBuffer();
    }
  });

  it('histórico e detalhe de sessão ficam indisponíveis (nenhuma sessão real é lida)', async () => {
    expect((await get('/api/history')).status).toBe(404);
    expect((await get('/api/session/qualquer')).status).toBe(404);
  });

  it('o que o demo grava fica na subpasta demo/, separado do dado real', () => {
    const data = join(base, 'data');
    if (existsSync(data)) expect(readdirSync(data)).toEqual(['demo']);
  });
});
