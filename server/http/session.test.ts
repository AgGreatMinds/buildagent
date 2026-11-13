// Adaptado de marmottajr/habblaud@faa1a01 server/http/sessions.ts (MIT)
// Teste de integração do GET /api/session/:id (start() real numa porta livre + transcripts
// sintéticos numa pasta de config temporária — nada de conversas reais). Contratos:
// 200 com shape do resumo (sem `detail`, sem prompt), ?limit= respeitado, 400 (id não-UUID,
// limit inválido/repetido), 404 (id inexistente), 405 (não-GET), 421 (Host de rede — guarda global).
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { start, type ServerHandle } from '../index';
import { L, writeLines } from '../test/fixtures';
import { setQuiet } from '../log';
import { readSessionDetail } from '../sources/session-detail';

setQuiet(true);

const T0 = Date.parse('2026-10-30T10:00:00Z');
const U1 = '00000000-0000-4000-8000-000000000001';

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

describe('GET /api/session/:id (integração)', () => {
  let handle: ServerHandle;
  let port = 0;

  beforeAll(async () => {
    port = await freePort();
    const tmp = mkdtempSync(join(tmpdir(), 'buildagent-session-'));
    // Transcript sintético: prompt longo (o marcador `FIM-UNICO` fica SEMPRE PÓS o corte de
    // 46 c do texto da atividade — se aparecer na resposta, vazou conteúdo bruto) + spawn de
    // subagente + 2 ferramentas, em ordem cronológica.
    const promptLongo = `${'x'.repeat(50)} FIM-UNICO ${'y'.repeat(50)}`;
    writeLines(join(tmp, '.claude/projects/projeto-sessao', `${U1}.jsonl`), [
      L.prompt(promptLongo, { at: T0, sessionId: U1 }),
      L.assistant(
        [L.tool('t1', 'Agent', { description: 'conferir testes', subagent_type: 'Explore', run_in_background: true })],
        { at: T0 + 1000, msgId: 'm1', sessionId: U1, stop: 'tool_use' },
      ),
      L.assistant([L.tool('t2', 'Read', { file_path: '/src/app.ts' })], { at: T0 + 2000, msgId: 'm2', sessionId: U1, stop: 'tool_use' }),
      L.assistant([L.tool('t3', 'Bash', { command: 'npm test' })], { at: T0 + 3000, msgId: 'm3', sessionId: U1, stop: 'end_turn' }),
    ]);
    const env = {
      ...process.env,
      HABBLAUD_PORT: String(port),
      HOME: tmp,
      HABBLAUD_DATA_DIR: join(tmp, 'data'),
      HABBLAUD_USAGE_DIR: join(tmp, 'usage'),
    };
    handle = start(env);
    await new Promise<void>((r) => handle.server.once('listening', () => r()));
  });

  afterAll(async () => {
    await handle.close();
  });

  it('200 com o shape do resumo: últimas N ações, tokens, ferramentas, subagentes — sem detail', async () => {
    const r = await request(port, { path: `/api/session/${U1}` });
    expect(r.status).toBe(200);
    const body = JSON.parse(r.body) as {
      sessionId: string;
      model?: string;
      tokens: { in: number; out: number };
      toolCalls: number;
      actions: Array<{ tool?: string; at: number; error: boolean; text: string }>;
      subagents: Array<{ tool: string; description?: string; subagentType?: string; background: boolean; at: number }>;
      truncated?: boolean;
    };
    expect(body.sessionId).toBe(U1);
    expect(body.model).toBe('claude-teste-1');
    expect(body.toolCalls).toBe(3);
    expect(body.tokens.in).toBeGreaterThan(0);
    expect(body.tokens.out).toBeGreaterThan(0);
    // Padrão: 50 ações → aqui só 4 (prompt + 3 ferramentas), da mais recente para a mais antiga;
    // o prompt não tem `tool`.
    expect(body.actions.filter((a) => a.tool).map((a) => a.tool)).toEqual(['Bash', 'Read', 'Agent']);
    expect(body.actions[3].tool).toBeUndefined(); // a mais antiga é o prompt (sem ferramenta)
    expect(body.actions[3].text.length).toBeLessThanOrEqual(46);
    // Hierarquia plana: o spawn do transcript principal, com o tipo do subagente.
    expect(body.subagents).toHaveLength(1);
    expect(body.subagents[0]).toMatchObject({ tool: 'Agent', subagentType: 'Explore', background: true });
    expect(body.truncated).toBeUndefined();
    // Sem conteúdo bruto: nem o campo `detail`, nem texto do prompt, nem conversa.
    expect(JSON.stringify(body)).not.toContain('"detail"');
    expect(JSON.stringify(body)).not.toContain('FIM-UNICO');
    for (const a of body.actions) expect(Object.keys(a)).not.toContain('detail');
  });

  it('limit é respeitado (e inválido/repetido → 400)', async () => {
    const two = JSON.parse((await request(port, { path: `/api/session/${U1}?limit=2` })).body);
    expect(two.actions.map((a: { tool?: string }) => a.tool)).toEqual(['Bash', 'Read']);
    for (const bad of [`/api/session/${U1}?limit=0`, `/api/session/${U1}?limit=101`, `/api/session/${U1}?limit=1&limit=2`]) {
      expect((await request(port, { path: bad })).status, bad).toBe(400);
    }
  });

  it('400 (id não-UUID), 404 (id inexistente), 405 (não-GET)', async () => {
    expect((await request(port, { path: '/api/session/nao-uuid' })).status).toBe(400);
    expect((await request(port, { path: '/api/session/aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })).status).toBe(404);
    expect((await request(port, { path: '/api/session' })).status).toBe(404);
    const post = await request(port, { path: `/api/session/${U1}`, method: 'POST' });
    expect(post.status).toBe(405);
  });

  it('Host fora da lista responde 421 (guarda global)', async () => {
    const r = await request(port, { path: `/api/session/${U1}`, host: 'evil.example.com' });
    expect(r.status).toBe(421);
  });
});

describe('readSessionDetail (janela truncada)', () => {
  it('arquivo maior que o teto lê só a janela e sinaliza truncated', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'buildagent-session-trunc-'));
    const path = join(tmp, 'a.jsonl');
    // 400 linhas de leitura + 1 de Agent (a última lida): com maxBytes pequeno, o prefixo cai fora.
    const lines: string[] = [];
    for (let i = 0; i < 400; i++) lines.push(L.assistant([L.tool(`f${i}`, 'Read', { file_path: `/f/${i}.ts` })], { at: T0 + i, msgId: `m${i}`, sessionId: U1, stop: 'tool_use' }));
    lines.push(L.assistant([L.tool('last', 'Agent', { description: 'ultima', subagent_type: 'Plan' })], { at: T0 + 500, msgId: 'mx', sessionId: U1, stop: 'end_turn' }));
    writeLines(path, lines);
    const r = await readSessionDetail(path, { limit: 2, maxBytes: 2000 });
    expect(r.detail?.truncated).toBe(true);
    // O prefixo (400 linhas) caiu fora da janela: só a leitura final sobreviveu — as últimas 2
    // ações (mais recente primeiro: o spawn de Agent e a última Read).
    const tools = r.detail?.actions.map((a) => a.tool) ?? [];
    expect(tools).toEqual(['Agent', 'Read']);
    expect(r.detail?.subagents[0]).toMatchObject({ tool: 'Agent', subagentType: 'Plan' });
  });
});
