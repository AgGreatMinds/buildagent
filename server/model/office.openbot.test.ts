// Office com agentes do OpenBot: nome e cargo do cadastro do app, sala com o nome do agente e a pasta do
// usuário como "Pessoal". Sem `launcherOf` e sem `homeDir`, nada muda.
import { describe, expect, it } from 'vitest';
import { NameStore } from './names';
import { Office, type MainInput, type OfficeDeps } from './office';

const HOME = '/Users/ana';
const HERA = `${HOME}/OpenBot/Agents/agent-135a57cb-c4a0-4600-9d1e-000000000001`;

function office(extra: Partial<OfficeDeps> = {}): Office {
  return new Office({
    names: new NameStore(null),
    version: '0.0.0',
    startedAt: 0,
    accounts: () => [],
    sources: () => [],
    accountName: () => undefined,
    now: () => 1_000,
    ...extra,
  });
}

function main(id: string, cwd: string, extra: Partial<MainInput> = {}): MainInput {
  return { id, account: '.claude', sessionId: `s-${id}`, cwd, role: 'Agente principal', startedAt: 1, status: 'working', ...extra };
}

// Cadastro de mentira: só a pasta da Hera é do OpenBot.
const launcherOf: OfficeDeps['launcherOf'] = (cwd) =>
  cwd === HERA ? { launcher: 'openbot', name: 'Hera', role: 'Recursos de agentes' } : undefined;

describe('Office — agentes do OpenBot', () => {
  it('usa o nome e o cargo do cadastro e marca o agente e a sala', () => {
    const o = office({ launcherOf, homeDir: HOME });
    o.addMain(main('a', HERA, { nameOverride: 'build' }));
    const snap = o.commit().snapshot;
    expect(snap.agents[0]).toMatchObject({ name: 'Hera', role: 'Recursos de agentes', launcher: 'openbot' });
    expect(snap.rooms[0]).toMatchObject({ name: 'Hera', launcher: 'openbot', path: HERA });
  });

  it('cadastro sem cargo mantém o papel da fonte', () => {
    const o = office({ launcherOf: (cwd) => (cwd === HERA ? { launcher: 'openbot', name: 'Hera' } : undefined) });
    o.addMain(main('a', HERA));
    expect(o.commit().snapshot.agents[0]).toMatchObject({ name: 'Hera', role: 'Agente principal' });
  });

  it('a pasta do usuário aparece como "Pessoal"', () => {
    const o = office({ launcherOf, homeDir: `${HOME}/` });
    o.addMain(main('a', HOME));
    const snap = o.commit().snapshot;
    expect(snap.rooms[0].name).toBe('Pessoal');
    expect(snap.rooms[0].launcher).toBeUndefined();
    expect(snap.agents[0].launcher).toBeUndefined();
  });

  it('o apelido dado pelo usuário vence o nome do OpenBot e o "Pessoal"', () => {
    const o = office({ launcherOf, homeDir: HOME, roomAlias: (path) => (path === HERA ? 'Time da Hera' : path === HOME ? 'Casa' : undefined) });
    o.addMain(main('a', HERA));
    o.addMain(main('b', HOME));
    const nomes = new Map(o.commit().snapshot.rooms.map((r) => [r.path, r.name]));
    expect(nomes.get(HERA)).toBe('Time da Hera');
    expect(nomes.get(HOME)).toBe('Casa');
  });

  it('sem launcherOf e sem homeDir fica como antes', () => {
    const o = office();
    o.addMain(main('a', HERA, { nameOverride: 'build' }));
    o.addMain(main('b', HOME));
    const snap = o.commit().snapshot;
    const porSala = new Map(snap.rooms.map((r) => [r.path, r]));
    expect(porSala.get(HERA)!.name).toBe('Agente 135a');
    expect(porSala.get(HERA)!.launcher).toBeUndefined();
    expect(porSala.get(HOME)!.name).toBe('ana');
    expect(snap.agents.find((a) => a.id === 'a')).toMatchObject({ name: 'build', role: 'Agente principal' });
  });
});
