// agenteDoSnapshot passa só activity.kind/at e a contagem de shells —
// nunca o texto da atividade (privacidade: a tela não desenha dado do agente).
import { describe, expect, it } from 'vitest';
import { agenteDoSnapshot } from './dados';

// Agente "completo" do snapshot: atividade com texto sensível + shells.
const agenteCompleto: any = {
  id: 'g1', kind: 'main', provider: 'claude', roomId: 'proj-x', name: 'Iris',
  role: 'Agente principal', title: 'Tela 2.0', sessionId: 's1', account: 'work',
  status: 'working', startedAt: 100, lastEventAt: 200, statusSince: 150,
  activity: { id: 'ac-1', kind: 'edit', text: 'Editando main.ts', detail: '/caminho/main.ts', at: 180 },
  shells: [{ id: 'sh-1' }, { id: 'sh-2' }],
};

describe('agenteDoSnapshot', () => {
  it('passa kind e at da atividade, sem o texto', () => {
    const out = agenteDoSnapshot(agenteCompleto);
    expect(out.atividade).toEqual({ kind: 'edit', at: 180 });
    const bruto = JSON.stringify(out);
    expect(bruto).not.toContain('Editando main.ts'); // text não viaja
    expect(bruto).not.toContain('/caminho/main.ts'); // detail não viaja
  });

  it('passa a contagem de shells, nunca o conteúdo', () => {
    expect(agenteDoSnapshot(agenteCompleto).shells).toBe(2);
  });

  it('agente sem activity fica sem atividade', () => {
    const sem: any = { ...agenteCompleto };
    delete sem.activity;
    const out = agenteDoSnapshot(sem);
    expect(out.atividade).toBeUndefined();
    expect('atividade' in out).toBe(false);
  });

  it('agente sem shells fica com shells ausente', () => {
    const sem: any = { ...agenteCompleto };
    delete sem.shells;
    const out = agenteDoSnapshot(sem);
    expect(out.shells).toBeUndefined();
    expect('shells' in out).toBe(false);
  });

  it('seed só passa como inteiro ≥ 0 (NaN, negativa, fracionária e texto ficam de fora)', () => {
    expect(agenteDoSnapshot({ ...agenteCompleto, seed: 0 }).seed).toBe(0);
    expect(agenteDoSnapshot({ ...agenteCompleto, seed: 4_000_000_000 }).seed).toBe(4_000_000_000);
    for (const ruim of [NaN, -1, 1.5, Infinity, '7']) {
      const out = agenteDoSnapshot({ ...agenteCompleto, seed: ruim });
      expect('seed' in out, `seed ${String(ruim)}`).toBe(false);
    }
  });
});
