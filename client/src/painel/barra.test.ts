// Testes da lógica pura da barra superior: agregação dos contadores a partir de
// um snapshot. `contagensDoSnapshot` não toca DOM; o DOM fica em barra.ts.
import { describe, expect, it } from 'vitest';
import { contagensDoSnapshot } from './barra';
import type { AgentInfo, RoomInfo } from '../../../shared/types';

const T0 = 1_700_000_000_000;

// Fábrica mínima: só os campos que a contagem consome (status).
function agente(id: string, status: AgentInfo['status']): AgentInfo {
  return {
    id,
    kind: 'main',
    roomId: 'sala-a',
    look: 'f',
    name: id,
    role: 'Agente principal',
    sessionId: 'chat-1',
    account: '.claude',
    status,
    startedAt: T0,
    lastEventAt: T0,
    statusSince: T0,
    recent: [],
    tasks: [],
    stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
    seed: 1,
  };
}

function sala(id: string): RoomInfo {
  return { id, name: id, path: `/projetos/${id}`, slot: 0, seed: 1, createdAt: T0 };
}

describe('contagensDoSnapshot', () => {
  it('snap nulo: todos zero', () => {
    expect(contagensDoSnapshot(null)).toEqual({ salas: 0, agentes: 0, trabalhando: 0, precisamDeVoce: 0 });
    expect(contagensDoSnapshot(undefined)).toEqual({ salas: 0, agentes: 0, trabalhando: 0, precisamDeVoce: 0 });
  });

  it('contagem base: salas = rooms, agentes exclui offline, working e waiting separados', () => {
    const snap = {
      rooms: [sala('sala-a'), sala('sala-b')],
      agents: [
        agente('a1', 'working'),
        agente('a2', 'waiting'),
        agente('a3', 'idle'),
        agente('a4', 'shell'),
        agente('a5', 'done'),
        agente('a6', 'offline'), // sai do prédio: não conta
      ],
    };
    expect(contagensDoSnapshot(snap)).toEqual({
      salas: 2,
      agentes: 5, // a6 offline não conta
      trabalhando: 1,
      precisamDeVoce: 1,
    });
  });

  it('subagentes contam como agentes presentes', () => {
    const sub = { ...agente('a1:sub', 'working'), kind: 'sub' as const, parentId: 'a1' };
    const snap = { rooms: [sala('sala-a')], agents: [agente('a1', 'idle'), sub] };
    expect(contagensDoSnapshot(snap)).toEqual({ salas: 1, agentes: 2, trabalhando: 1, precisamDeVoce: 0 });
  });
});
