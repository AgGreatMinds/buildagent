// Fonte do Pi: leitura das sessões (somente leitura, sem texto de conversa) e o ciclo no Office.
// Tudo com arquivos sintéticos numa pasta temporária; nenhuma sessão real é lida.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccountsService } from '../../accounts/service';
import { NameStore } from '../../model/names';
import { Office } from '../../model/office';
import { listPiSessionFiles, parsePiSession, PiSource, piStatus, readPiSession, RECENT_WINDOW_MS, WORKING_WINDOW_MS } from './index';

const SECRET = 'CONVERSA-DE-EXEMPLO-9f3a';
const T0 = Date.UTC(2026, 10, 12, 12, 0, 0);

const line = (o: unknown): string => JSON.stringify(o);
const header = (id: string, cwd: string) => line({ type: 'session', version: 3, id, timestamp: new Date(T0).toISOString(), cwd });
const message = (role: string, extra: Record<string, unknown> = {}, at = T0 + 1000) =>
  line({ type: 'message', id: 'm', parentId: null, timestamp: new Date(at).toISOString(), message: { role, content: SECRET, ...extra } });

describe('pi/sessions', () => {
  it('lê o cabeçalho, o modelo e o estado do último turno', () => {
    const s = parsePiSession(
      [
        header('abc', '/proj/x'),
        line({ type: 'model_change', id: '1', parentId: null, timestamp: new Date(T0).toISOString(), provider: 'p', modelId: 'modelo-a' }),
        message('system'),
        message('user'),
        message('assistant', { content: [{ type: 'thinking', thinking: SECRET }, { type: 'toolCall', name: 'bash', arguments: { command: SECRET } }], stopReason: 'toolUse', model: 'modelo-b' }, T0 + 5000),
      ].join('\n'),
    );
    expect(s).toEqual({ id: 'abc', cwd: '/proj/x', startedAt: T0, model: 'modelo-b', lastRole: 'assistant', lastStop: 'toolUse', lastTool: 'bash', lastAt: T0 + 5000 });
  });

  it('nunca devolve texto de conversa, argumento de ferramenta nem resultado', () => {
    const s = parsePiSession([header('abc', '/proj/x'), message('user'), message('toolResult', { content: [{ type: 'text', text: SECRET }] })].join('\n'));
    expect(JSON.stringify(s)).not.toContain(SECRET);
  });

  it('ignora linha quebrada e arquivo sem cabeçalho', () => {
    expect(parsePiSession(`${header('abc', '/p')}\n{"type":"message","mess`)?.id).toBe('abc');
    expect(parsePiSession(message('user'))).toBeUndefined();
    expect(parsePiSession('')).toBeUndefined();
    expect(parsePiSession(line({ type: 'session', id: 'x' }))).toBeUndefined(); // sem cwd
  });

  it('status: trabalhando só com arquivo recente e turno aberto', () => {
    expect(piStatus({ lastRole: 'user' }, 1000)).toBe('working');
    expect(piStatus({ lastRole: 'toolResult' }, 1000)).toBe('working');
    expect(piStatus({ lastRole: 'assistant', lastStop: 'toolUse' }, 1000)).toBe('working');
    expect(piStatus({ lastRole: 'assistant', lastStop: 'stop' }, 1000)).toBe('idle');
    expect(piStatus({ lastRole: 'user' }, WORKING_WINDOW_MS + 1)).toBe('idle');
    expect(piStatus({}, 1000)).toBe('idle');
  });
});

describe('pi/source', () => {
  let dir: string;
  let clock = T0;
  const now = () => clock;

  function write(project: string, name: string, lines: string[], mtime = clock): string {
    mkdirSync(join(dir, project), { recursive: true });
    const path = join(dir, project, name);
    writeFileSync(path, lines.join('\n') + '\n');
    utimesSync(path, mtime / 1000, mtime / 1000);
    return path;
  }

  function make() {
    const office = new Office({ names: new NameStore(null), version: 'teste', startedAt: T0, accounts: () => [], sources: () => [], accountName: () => undefined, now });
    const accounts = {
      allEntries: () => [],
      setProviderAccounts: (_p: string, list: Array<{ dir: string; detected: { id: string } }>) => list.map((a) => ({ id: a.detected.id, provider: 'pi', dir: a.dir, detected: a.detected })),
    } as unknown as AccountsService;
    return { office, source: new PiSource({ accounts, office, dir, now, pollMs: 3_600_000 }) };
  }
  const poll = (source: PiSource) => (source as unknown as { poll(): void }).poll();

  beforeEach(() => {
    clock = T0 + 60_000;
    dir = mkdtempSync(join(tmpdir(), 'buildagent-pi-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('pasta ausente ou vazia não quebra e não cria agente', () => {
    expect(listPiSessionFiles(join(dir, 'nao-existe'), clock, RECENT_WINDOW_MS)).toEqual([]);
    const { office, source } = make();
    source.start();
    source.stop();
    expect(office.list()).toEqual([]);
    expect(source.sources()).toEqual([{ label: '.pi', provider: 'pi', path: dir, sessions: 0, ok: true }]);
  });

  it('sessão recente entra como agente do Pi, na pasta certa, trabalhando', () => {
    write('--proj-x--', '2026_abc.jsonl', [header('abc', '/proj/x'), message('user')]);
    const { office, source } = make();
    source.start();
    source.stop();
    const a = office.get('pi:abc');
    expect(a).toMatchObject({ id: 'pi:abc', provider: 'pi', status: 'working', sessionId: 'abc' });
    // A sala é a pasta do cabeçalho da sessão.
    expect(office.commit().snapshot.rooms.find((r) => r.id === a?.roomId)?.path).toBe('/proj/x');
    expect(source.sources()[0].sessions).toBe(1);
    expect(source.transcriptPathOf()).toBeUndefined();
  });

  it('turno encerrado vira ocioso; arquivo fora da janela faz o agente sair', () => {
    const path = write('p', 's.jsonl', [header('abc', '/proj/x'), message('user')]);
    const { office, source } = make();
    source.start();
    source.stop();
    writeFileSync(path, [header('abc', '/proj/x'), message('user'), message('assistant', { stopReason: 'stop' })].join('\n'));
    utimesSync(path, clock / 1000, clock / 1000);
    poll(source);
    expect(office.get('pi:abc')?.status).toBe('idle');
    clock += RECENT_WINDOW_MS + 60_000; // o arquivo não foi mais mexido
    poll(source);
    expect(office.get('pi:abc')?.status ?? 'offline').toBe('offline');
    expect(source.sources()[0].sessions).toBe(0);
  });

  it('arquivo antigo não entra; arquivo sem cabeçalho é ignorado', () => {
    write('p', 'velho.jsonl', [header('velho', '/proj/x'), message('user')], clock - RECENT_WINDOW_MS - 1000);
    write('p', 'ruim.jsonl', ['não é json', message('user')]);
    const { office, source } = make();
    source.start();
    source.stop();
    expect(office.list()).toEqual([]);
  });

  it('nada do texto da conversa chega ao snapshot e a pasta do Pi não é alterada', () => {
    const path = write('p', 's.jsonl', [header('abc', '/proj/x'), message('user'), message('assistant', { content: [{ type: 'toolCall', name: 'read', arguments: { path: SECRET } }], stopReason: 'toolUse' })]);
    const before = readFileSync(path, 'utf8');
    const { office, source } = make();
    source.start();
    source.stop();
    expect(JSON.stringify(office.commit().snapshot)).not.toContain(SECRET);
    expect(readFileSync(path, 'utf8')).toBe(before);
    expect(readdirSync(join(dir, 'p'))).toEqual(['s.jsonl']);
  });

  it('sessão longa: lê só o cabeçalho e o fim do arquivo', () => {
    const filler = Array.from({ length: 4000 }, () => message('user', { content: 'x'.repeat(200) }));
    const path = write('p', 'longa.jsonl', [header('longa', '/proj/y'), ...filler, message('assistant', { stopReason: 'stop' }, T0 + 9000)]);
    const s = readPiSession({ path, mtimeMs: clock, size: readFileSync(path).length });
    expect(s).toMatchObject({ id: 'longa', cwd: '/proj/y', lastRole: 'assistant', lastStop: 'stop', lastAt: T0 + 9000 });
  });
});
