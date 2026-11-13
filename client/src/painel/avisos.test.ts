// Testes da detecção de transições de avisos (avisos.ts): a função pura
// `transicoesDeAvisos` compara o estado anterior com o snapshot atual. Sem DOM.
import { describe, expect, it } from 'vitest';
import { transicoesDeAvisos, type EstadoAviso } from './avisos';
import type { AgentInfo } from '../../../shared/types';

const T0 = 1_700_000_000_000;

// Fábrica mínima: campos que a transição lê (id, status, statusSince, name, waitingFor);
// o resto cai em padrões estáveis. `...p` sobrepõe (id/status/statusSince obrigatórios vêm de p).
function agente(p: Partial<AgentInfo> & Pick<AgentInfo, 'id' | 'status' | 'statusSince'>): AgentInfo {
  const base = {
    id: p.id,
    kind: 'main' as const,
    roomId: 'sala-a',
    name: p.id,
    role: 'Agente principal',
    look: 'f' as const,
    sessionId: 'chat-1',
    account: '.claude',
    status: p.status,
    statusSince: p.statusSince,
    startedAt: T0,
    lastEventAt: T0,
    recent: [] as AgentInfo['recent'],
    tasks: [] as AgentInfo['tasks'],
    stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
    seed: 1,
  };
  return { ...base, ...p } as AgentInfo;
}

describe('transicoesDeAvisos', () => {
  it('entrada em waiting gera alert com o motivo do espera', () => {
    const anterior = new Map<string, EstadoAviso>([['a1', { status: 'working', statusSince: T0 }]]);
    const atual = [agente({ id: 'a1', status: 'waiting', statusSince: T0 + 5000, waitingFor: 'aprovar uma permissão' })];
    const avisos = transicoesDeAvisos(anterior, atual);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].nivel).toBe('alert');
    expect(avisos[0].motivo).toBe('aprovar uma permissão');
    expect(avisos[0].id).toBe(`a1:waiting:${T0 + 5000}`);
  });

  it('entrada em done gera success', () => {
    const anterior = new Map<string, EstadoAviso>([['s1', { status: 'working', statusSince: T0 }]]);
    const atual = [agente({ id: 's1', status: 'done', statusSince: T0 + 9000 })];
    const avisos = transicoesDeAvisos(anterior, atual);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].nivel).toBe('success');
  });

  it('sem mudança de status não gera aviso', () => {
    const anterior = new Map<string, EstadoAviso>([
      ['a1', { status: 'waiting', statusSince: T0 }],
      ['a2', { status: 'done', statusSince: T0 }],
    ]);
    const atual = [
      agente({ id: 'a1', status: 'waiting', statusSince: T0 + 1000 }), // mesmo status, só segue
      agente({ id: 'a2', status: 'done', statusSince: T0 + 1000 }),
    ];
    expect(transicoesDeAvisos(anterior, atual)).toHaveLength(0);
  });

  it('primeira vez que um agente é visto só semeia (não é transição)', () => {
    const atual = [agente({ id: 'a1', status: 'waiting', statusSince: T0 })];
    expect(transicoesDeAvisos(new Map(), atual)).toHaveLength(0);
  });

  it('agente que saiu não repete o aviso ao sumir do snapshot', () => {
    const anterior = new Map<string, EstadoAviso>([
      ['a1', { status: 'waiting', statusSince: T0 }],
      ['a2', { status: 'idle', statusSince: T0 }],
    ]);
    // a1 saiu; a2 segue idle.
    const atual = [agente({ id: 'a2', status: 'idle', statusSince: T0 })];
    expect(transicoesDeAvisos(anterior, atual)).toHaveLength(0);
  });

  it('dedupe por statusSince: a mesma transição repetida não gera de novo', () => {
    const anterior = new Map<string, EstadoAviso>([['a1', { status: 'waiting', statusSince: T0 + 5000 }]]);
    const atual = [agente({ id: 'a1', status: 'waiting', statusSince: T0 + 5000 })];
    expect(transicoesDeAvisos(anterior, atual)).toHaveLength(0);
  });

  it('transição diferente do mesmo agente (waiting → done) gera novo aviso', () => {
    const anterior = new Map<string, EstadoAviso>([['a1', { status: 'waiting', statusSince: T0 }]]);
    const atual = [agente({ id: 'a1', status: 'done', statusSince: T0 + 40000 })];
    const avisos = transicoesDeAvisos(anterior, atual);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].nivel).toBe('success');
  });

  it('outros status (idle, shell, working, offline) não geram aviso', () => {
    const anterior = new Map<string, EstadoAviso>([['a1', { status: 'waiting', statusSince: T0 }]]);
    const atual = [agente({ id: 'a1', status: 'idle', statusSince: T0 + 1000 })];
    expect(transicoesDeAvisos(anterior, atual)).toHaveLength(0);
  });
});
