// Modo demonstração: roteiro determinístico, completo (chega, trabalha, pede atenção, circula, sai) e sem dado real.
import { describe, expect, it } from 'vitest';
import type { AgentStatus } from '../../shared/types';
import { CYCLE_MS, DemoSimulator } from './simulator';

const T0 = 1_800_000_000_000;

describe('demo/simulator', () => {
  it('o mesmo instante dá o mesmo snapshot (não depende de relógio nem de sorteio)', () => {
    const a = new DemoSimulator({ idPrefix: 'demo:' }, T0);
    const b = new DemoSimulator({ idPrefix: 'demo:' }, T0);
    for (const dt of [0, 5_000, 31_000, 59_999, 3 * CYCLE_MS + 12_345]) {
      expect(a.snapshot(T0 + dt)).toEqual(b.snapshot(T0 + dt));
    }
  });

  it('4 salas fictícias, no máximo 10 pessoas, tudo marcado como demo', () => {
    const sim = new DemoSimulator({ idPrefix: 'demo:' }, T0);
    let max = 0;
    for (let dt = 0; dt < 2 * CYCLE_MS; dt += 1000) {
      const s = sim.snapshot(T0 + dt);
      expect(s.meta.demo).toBe(true);
      expect(s.rooms.map((r) => r.path)).toEqual(['/demo/loja-online', '/demo/app-mobile', '/demo/site-institucional', '/demo/api-pagamentos']);
      for (const a of s.agents) {
        expect(a.id.startsWith('demo:')).toBe(true);
        expect(s.accounts.some((c) => c.id === a.account && (c.provider ?? 'claude') === (a.provider ?? 'claude'))).toBe(true); // conta fictícia da própria ferramenta
        expect(s.rooms.some((r) => r.id === a.roomId)).toBe(true);
        if (a.parentId) expect(a.kind).toBe('sub');
      }
      max = Math.max(max, s.agents.length);
    }
    expect(max).toBeGreaterThanOrEqual(6);
    expect(max).toBeLessThanOrEqual(10);
  });

  it('em dois ciclos aparecem todos os estados e todas as ferramentas, e gente sai e volta', () => {
    const sim = new DemoSimulator({ idPrefix: 'demo:' }, T0);
    const statuses = new Set<AgentStatus>();
    const providers = new Set<string>();
    const presence: boolean[] = [];
    for (let dt = 0; dt < 2 * CYCLE_MS + 30_000; dt += 500) {
      const s = sim.snapshot(T0 + dt);
      for (const a of s.agents) {
        statuses.add(a.status);
        providers.add(a.provider ?? 'claude');
      }
      presence.push(s.agents.some((a) => a.id === 'demo:davi'));
    }
    expect([...statuses].sort()).toEqual(['done', 'idle', 'offline', 'waiting', 'working']);
    expect([...providers].sort()).toEqual(['claude', 'codex', 'opencode', 'pi']);
    // Davi: ausente no começo, presente, ausente de novo, presente de novo.
    const changes = presence.filter((v, i) => i > 0 && v !== presence[i - 1]).length;
    expect(presence[0]).toBe(false);
    expect(changes).toBeGreaterThanOrEqual(3);
  });

  it('tick só acusa mudança quando algo muda, e cada atividade entra no feed uma única vez', () => {
    const sim = new DemoSimulator({ idPrefix: 'demo:' }, T0);
    const first = sim.tick(T0);
    expect(first.changed).toBe(true);
    expect(first.feed.length).toBeGreaterThan(0);
    expect(sim.tick(T0 + 250)).toEqual({ changed: false, feed: [], notices: [] });
    const ids = new Set(first.feed.map((f) => f.id));
    let changed = 0;
    for (let dt = 500; dt <= CYCLE_MS; dt += 250) {
      const r = sim.tick(T0 + dt);
      if (r.changed) changed++;
      for (const f of r.feed) {
        expect(ids.has(f.id)).toBe(false);
        ids.add(f.id);
      }
    }
    expect(changed).toBeGreaterThan(10);
    expect(changed).toBeLessThan(120); // nada de mudar a cada tick
  });

  it('é somente leitura: não responde permissão nem recebe mensagem', () => {
    const sim = new DemoSimulator();
    expect(sim.decidePermission('x', 'allow' as never)).toBe(false);
    expect(sim.receiveMessage('demo:lia', 'oi')).toBe(false);
  });
});

describe('contas fictícias do modo demonstração', () => {
  it('uma conta por ferramenta, todas dentro de /demo, com sessões contadas por ferramenta', () => {
    const sim = new DemoSimulator({ idPrefix: 'demo:' }, T0);
    const s = sim.snapshot(T0 + 20_000);
    expect(s.accounts.map((a) => a.provider ?? 'claude')).toEqual(['claude', 'codex', 'opencode', 'pi']);
    expect(new Set(s.accounts.map((a) => a.id)).size).toBe(4);
    for (const a of s.accounts) {
      expect(a.configDir.startsWith('/demo/')).toBe(true);
      expect(a.name).toContain('demo'); // ninguém confunde com conta de verdade
      const abertas = s.agents.filter((g) => g.kind === 'main' && g.status !== 'offline' && g.account === a.id).length;
      expect(a.sessions).toBe(abertas);
    }
  });

  it('Claude e Codex trazem uso entre 0 e 100 (um deles perto do limite); OpenCode e Pi ficam sem números', () => {
    const sim = new DemoSimulator({ idPrefix: 'demo:' }, T0);
    let maior = 0;
    for (let dt = 0; dt < 12 * CYCLE_MS; dt += 7_000) {
      const now = T0 + dt;
      for (const a of sim.snapshot(now).accounts) {
        const comUso = a.provider === undefined || a.provider === 'codex';
        expect(a.usageStatus).toBe(comUso ? 'ok' : 'unavailable');
        expect(a.usage === undefined).toBe(!comUso);
        for (const j of [a.usage?.fiveHour, a.usage?.sevenDay]) {
          if (!j) continue;
          expect(Number.isInteger(j.utilization)).toBe(true);
          expect(j.utilization).toBeGreaterThanOrEqual(0);
          expect(j.utilization).toBeLessThanOrEqual(100);
          expect(j.resetsAt!).toBeGreaterThan(now);
          maior = Math.max(maior, j.utilization);
        }
      }
    }
    expect(maior).toBeGreaterThanOrEqual(80); // a faixa de uso tem um estado crítico para mostrar
  });

  it('é função pura do tempo, e o tick só acusa mudança de uso quando um percentual inteiro muda', () => {
    const a = new DemoSimulator({ idPrefix: 'demo:' }, T0);
    const b = new DemoSimulator({ idPrefix: 'demo:' }, T0);
    expect(a.snapshot(T0 + 123_456).accounts).toEqual(b.snapshot(T0 + 123_456).accounts);
    // Com o elenco parado (mesmo passo de atividade), 200 ms depois nenhum percentual inteiro mudou.
    a.tick(T0 + 9_000);
    expect(a.tick(T0 + 9_200).changed).toBe(false);
  });
});
