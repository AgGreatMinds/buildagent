// Testes da identidade das pessoas: grupo, separação, prioridade, ciclo de conclusão, determinismo.
// Vitest + `agora` controlado (sem Date.now()).

import { describe, expect, it } from 'vitest';
import { consolidar, novaMemoria } from './identidade';
import type { AgenteEntrada } from './tipos';
import { PERMANENCIA_APOS_CONCLUIR } from './tipos';

const T0 = 1_000_000_000_000; // epoch de referência (ms)
const MIN = 60_000;

// Fábrica: agente sub "Iris" ativo; sobrepõe o que o teste precisa.
function agente(p: Partial<AgenteEntrada> & Pick<AgenteEntrada, 'id'>): AgenteEntrada {
  return {
    kind: 'sub',
    provider: undefined,
    roomId: 'repo-a',
    name: p.id,
    role: 'iris',
    sessionId: 'chat-1',
    account: 'conta-a',
    status: 'working',
    startedAt: T0,
    lastEventAt: T0,
    statusSince: T0,
    ...p,
  };
}

describe('identidade: agrupamento', () => {
  it('3 agentes role "iris" no mesmo chat/pasta/provider → 1 pessoa, contagem 3', () => {
    const mem = novaMemoria();
    const pessoas = consolidar(
      [agente({ id: 'a1' }), agente({ id: 'a2' }), agente({ id: 'a3' })],
      T0,
      mem,
    );
    expect(pessoas).toHaveLength(1);
    expect(pessoas[0].nome).toBe('Iris');
    expect(pessoas[0].nomeAutomatico).toBe(false);
    expect(pessoas[0].papel).toBe('iris');
    expect(pessoas[0].contagem).toBe(3);
    expect(pessoas[0].agenteIds).toEqual(['a1', 'a2', 'a3']);
  });

  it('mesma Iris em 2 pastas → 2 pessoas', () => {
    const mem = novaMemoria();
    const pessoas = consolidar(
      [agente({ id: 'a1', roomId: 'repo-a' }), agente({ id: 'a2', roomId: 'repo-b' })],
      T0,
      mem,
    );
    expect(pessoas).toHaveLength(2);
  });

  it('mesma Iris em 2 chats → 2 pessoas', () => {
    const mem = novaMemoria();
    const pessoas = consolidar(
      [agente({ id: 'a1', sessionId: 'chat-1' }), agente({ id: 'a2', sessionId: 'chat-2' })],
      T0,
      mem,
    );
    expect(pessoas).toHaveLength(2);
  });

  it('mesma Iris em 2 providers (claude e codex) → 2 pessoas', () => {
    const mem = novaMemoria();
    const pessoas = consolidar(
      [agente({ id: 'a1', provider: 'claude' }), agente({ id: 'a2', provider: 'codex' })],
      T0,
      mem,
    );
    expect(pessoas).toHaveLength(2);
    expect(pessoas.map((p) => p.provider).sort()).toEqual(['claude', 'codex']);
  });
});

describe('identidade: pessoas automáticas', () => {
  it('dois "Explore" no mesmo chat → 2 pessoas, nomes automáticos, contagem 1 cada', () => {
    const mem = novaMemoria();
    const pessoas = consolidar(
      [
        agente({ id: 'e1', role: 'explore', name: 'Recruta 1' }),
        agente({ id: 'e2', role: 'explore', name: 'Recruta 2' }),
      ],
      T0,
      mem,
    );
    expect(pessoas).toHaveLength(2);
    for (const p of pessoas) {
      expect(p.nomeAutomatico).toBe(true);
      expect(p.contagem).toBe(1);
      expect(p.papel).toBe('explore');
    }
    expect(pessoas.map((p) => p.nome).sort()).toEqual(['Recruta 1', 'Recruta 2']);
  });

  it('principal vira pessoa com nomeAutomatico=true', () => {
    const mem = novaMemoria();
    const pessoas = consolidar(
      [agente({ id: 'main1', kind: 'main', role: 'Agente principal', name: 'Mestre' })],
      T0,
      mem,
    );
    expect(pessoas).toHaveLength(1);
    expect(pessoas[0].nome).toBe('Mestre');
    expect(pessoas[0].nomeAutomatico).toBe(true);
    expect(pessoas[0].papel).toBe('Agente principal');
  });
});

describe('identidade: prioridade de estado', () => {
  it('waiting vence working; working vence shell; shell vence idle', () => {
    const mem = novaMemoria();
    const pessoas = consolidar(
      [
        agente({ id: 'a1', status: 'waiting' }),
        agente({ id: 'a2', status: 'working' }),
      ],
      T0,
      mem,
    );
    expect(pessoas[0].estado).toBe('waiting');

    const pessoas2 = consolidar(
      [
        agente({ id: 'a1', status: 'working' }),
        agente({ id: 'a2', status: 'idle' }),
        agente({ id: 'a3', status: 'shell' }),
      ],
      T0 + MIN,
      mem,
    );
    expect(pessoas2[0].estado).toBe('working');

    const pessoas3 = consolidar(
      [agente({ id: 'a1', status: 'shell' }), agente({ id: 'a2', status: 'idle' })],
      T0 + 2 * MIN,
      mem,
    );
    expect(pessoas3[0].estado).toBe('shell');

    const pessoas4 = consolidar([agente({ id: 'a1', status: 'idle' })], T0 + 3 * MIN, mem);
    expect(pessoas4[0].estado).toBe('idle');
  });
});

describe('identidade: ciclo de conclusão', () => {
  it('todos done → concluidoEm; presente aos 29 min; some aos 30; reaparece ativo com concluidoEm limpo', () => {
    const mem = novaMemoria();
    const ativos = [agente({ id: 'a1' }), agente({ id: 'a2' })];

    const p0 = consolidar(ativos, T0, mem);
    expect(p0[0].contagem).toBe(2);
    expect(p0[0].concluidoEm).toBeUndefined();

    // Transição 1→0: grava concluidoEm.
    const p1 = consolidar(
      ativos.map((a) => ({ ...a, status: 'done' as const })),
      T0 + 5 * MIN,
      mem,
    );
    expect(p1).toHaveLength(1);
    expect(p1[0].concluidoEm).toBe(T0 + 5 * MIN);
    expect(p1[0].estado).toBe('done');

    // 29 min depois da conclusão: ainda presente.
    const p29 = consolidar([], T0 + 5 * MIN + 29 * MIN, mem);
    expect(p29).toHaveLength(1);

    // 30 min: expira, some do resultado e da memória.
    const p30 = consolidar([], T0 + 5 * MIN + PERMANENCIA_APOS_CONCLUIR, mem);
    expect(p30).toHaveLength(0);
    expect(mem.pessoas.size).toBe(0);

    // Volta a ser visto depois da expiração: renasce (removida da memória), sem concluidoEm.
    const pVoltou = consolidar(ativos, T0 + 40 * MIN, mem);
    expect(pVoltou).toHaveLength(1);
    expect(pVoltou[0].contagem).toBe(2);
    expect(pVoltou[0].concluidoEm).toBeUndefined();
    // Nascida de novo: entrouEm é a primeira vez vista desta vida.
    expect(pVoltou[0].entrouEm).toBe(T0 + 40 * MIN);
  });

  it('volta ativo antes da expiração → mesma pessoa, entrouEm preservado e concluidoEm limpo', () => {
    const mem = novaMemoria();
    const ativos = [agente({ id: 'a1' })];
    const p0 = consolidar(ativos, T0, mem);
    expect(p0[0].entrouEm).toBe(T0);

    const pDone = consolidar([{ ...ativos[0], status: 'done' as const }], T0 + MIN, mem);
    expect(pDone[0].concluidoEm).toBe(T0 + MIN);

    // 10 min depois (dentro da janela): reativa → mesma pessoa, memória preservada.
    const pVoltou = consolidar(ativos, T0 + 11 * MIN, mem);
    expect(pVoltou).toHaveLength(1);
    expect(pVoltou[0].contagem).toBe(1);
    expect(pVoltou[0].concluidoEm).toBeUndefined();
    expect(pVoltou[0].entrouEm).toBe(T0);
  });
});

describe('identidade: nascida done', () => {
  it('agente que nunca foi ativo e nasce done → não entra', () => {
    const mem = novaMemoria();
    const pessoas = consolidar([agente({ id: 'a1', status: 'done' })], T0, mem);
    expect(pessoas).toHaveLength(0);
    expect(mem.pessoas.size).toBe(0);
  });
});

describe('identidade: determinismo', () => {
  it('mesma entrada + mesma memória → mesmo resultado', () => {
    const entrada = [
      agente({ id: 'a1', status: 'waiting' }),
      agente({ id: 'a2', role: 'explore', name: 'Recruta' }),
      agente({ id: 'm1', kind: 'main', role: 'Agente principal', name: 'Mestre' }),
    ];

    const memA = novaMemoria();
    const memB = novaMemoria();
    const rA = consolidar(entrada, T0, memA);
    const rB = consolidar(entrada, T0, memB);
    expect(rA).toEqual(rB);

    // Rodar de novo na mesma memória não muda nada.
    const rA2 = consolidar(entrada, T0, memA);
    expect(rA2).toEqual(rA);
  });

  it('a ordem dos agentes na entrada não muda a saída', () => {
    const base = [
      agente({ id: 'a1', status: 'waiting' }),
      agente({ id: 'a2' }),
      agente({ id: 'a3' }),
      agente({ id: 'e1', role: 'explore', name: 'Recruta' }),
    ];
    const embaralhado = [base[3], base[1], base[0], base[2]];

    const memA = novaMemoria();
    const memB = novaMemoria();
    const rA = consolidar(base, T0, memA);
    const rB = consolidar(embaralhado, T0, memB);
    expect(rA).toEqual(rB);
  });
});

// O boneco 3D usa a MESMA semente do rosto da lista (seed do servidor) também na pessoa
// nomeada; com vários agentes, vale o de menor id — independente da ordem do snapshot.
describe('identidade: aparência igual à da lista', () => {
  it('pessoa nomeada recebe seed/look do agente de menor id, em qualquer ordem', () => {
    const a1 = agente({ id: 'a1', seed: 111, look: 'f' });
    const a2 = agente({ id: 'a2', seed: 222, look: 'm' });
    for (const ordem of [[a1, a2], [a2, a1]]) {
      const [p] = consolidar(ordem, T0, novaMemoria());
      expect(p.nomeAutomatico).toBe(false);
      expect(p.seedVisual).toBe(111);
      expect(p.look).toBe('f');
    }
  });

  it('sem seed no snapshot, seedVisual fica ausente (o 3D cai na `semente` da chave)', () => {
    const [p] = consolidar([agente({ id: 'b1' })], T0, novaMemoria());
    expect(p.seedVisual).toBeUndefined();
  });
});
