// Testes das funções puras do acabamento da gaveta de detalhe.
// Padrão da pasta: Vitest, sem DOM, "agora" e dados por parâmetro (ver tempo.test.ts).
import { describe, expect, it } from 'vitest';
import {
  abreviarMeio,
  agoraDoAgente,
  fatiaAcoes,
  grupoDaAcao,
  haTempo,
  inicialDoNome,
} from './detalhe-formato';
import type { Activity, ActivityKind, AgentInfo } from '../../../shared/types';

const T0 = 1_700_000_000_000;
const S = 1_000;

// Fábrica mínima de Activity para os testes de grupo/paginação.
function acao(kind: ActivityKind, i = 0, erro?: boolean): Activity {
  return {
    id: `${kind}-${i}`,
    kind,
    icon: '⚙️',
    text: `Ação ${i}`,
    at: T0 + i * S,
    ...(erro ? { error: true } : {}),
  };
}

describe('abreviarMeio', () => {
  it("corta o meio preservando início e fim ('abcdefghij',6) → 'abc…ij'", () => {
    expect(abreviarMeio('abcdefghij', 6)).toBe('abc…ij');
  });

  it('devolve igual quando o texto cabe no max', () => {
    expect(abreviarMeio('abc', 6)).toBe('abc');
    expect(abreviarMeio('abcdef', 6)).toBe('abcdef');
  });

  it('inicio=0.35 mantém mais cauda (mesmo exemplo: 2 no topo, 3 no fim)', () => {
    expect(abreviarMeio('abcdefghij', 6, 0.35)).toBe('ab…hij');
  });
});

describe('haTempo', () => {
  it('5 s → "agora" (sem prefixo colado, resolve D6)', () => {
    expect(haTempo(T0 - 5 * S, T0, 'há', 'agora')).toBe('agora');
  });

  it('120 s → "há 2 m"', () => {
    expect(haTempo(T0 - 120 * S, T0, 'há', 'agora')).toBe('há 2 m');
  });
});

describe('inicialDoNome', () => {
  it('primeiro caractere visível em maiúscula pt-BR', () => {
    expect(inicialDoNome('  rafaela')).toBe('R');
  });

  it('vazio ou só espaços → "?"', () => {
    expect(inicialDoNome('')).toBe('?');
    expect(inicialDoNome('   ')).toBe('?');
  });
});

describe('grupoDaAcao', () => {
  it('mapeia os 23 ActivityKind à tabela da spec 2.9', () => {
    const tabela: Record<ActivityKind, string> = {
      read: 'ler', search: 'ler', web: 'ler', browser: 'ler', mcp: 'ler', skill: 'ler',
      edit: 'escrever', write: 'escrever',
      run: 'rodar', test: 'rodar', git: 'rodar',
      prompt: 'pensar', think: 'pensar', respond: 'pensar', plan: 'pensar',
      delegate: 'pensar', communicate: 'pensar', compact: 'pensar',
      ask: 'atencao', wait: 'atencao',
      done: 'fim',
      error: 'erro',
      other: 'outro',
    };
    for (const [kind, esperado] of Object.entries(tabela)) {
      expect(grupoDaAcao(kind as ActivityKind)).toBe(esperado);
    }
  });

  it('erro===true força o grupo "erro" independentemente do kind', () => {
    expect(grupoDaAcao('read', true)).toBe('erro');
    expect(grupoDaAcao('done', true)).toBe('erro');
    // sem flag, mantém o kind
    expect(grupoDaAcao('error')).toBe('erro');
    expect(grupoDaAcao('read', undefined)).toBe('ler');
  });
});

// Agente mínimo com o shape esperado por `agoraDoAgente`.
function agente(parcial: Partial<Pick<AgentInfo, 'status' | 'activity' | 'waitingFor' | 'shells' | 'recent'>>):
  Pick<AgentInfo, 'status' | 'activity' | 'waitingFor' | 'shells' | 'recent'> {
  const base: Pick<AgentInfo, 'status' | 'activity' | 'waitingFor' | 'shells' | 'recent'> = {
    status: 'idle',
    activity: undefined,
    waitingFor: undefined,
    shells: undefined,
    recent: [],
  };
  return { ...base, ...parcial };
}

describe('agoraDoAgente', () => {
  it('working → acao com a atividade atual', () => {
    const at = acao('edit');
    expect(agoraDoAgente(agente({ status: 'working', activity: at }), false)).toEqual({ tipo: 'acao', acao: at });
  });

  it('waiting → espera com o motivo', () => {
    expect(agoraDoAgente(agente({ status: 'waiting', waitingFor: 'aprovar uma permissão' }), false))
      .toEqual({ tipo: 'espera', motivo: 'aprovar uma permissão' });
  });

  it('idle → ocioso com a última ação (activity ou a mais recente de recent)', () => {
    const at = acao('git');
    expect(agoraDoAgente(agente({ status: 'idle', activity: at }), false)).toEqual({ tipo: 'ocioso', ultima: at });
    expect(agoraDoAgente(agente({ status: 'idle', recent: [acao('read', 0), at] }), false))
      .toEqual({ tipo: 'ocioso', ultima: at });
  });

  it('shell → rótulo do 1º shell + quantos ficam em segundo plano', () => {
    expect(agoraDoAgente(
      agente({
        status: 'shell',
        shells: [
          { id: 's1', label: 'npm run build', startedAt: T0, background: false, kind: 'shell' },
          { id: 's2', label: 'watch', startedAt: T0, background: true, kind: 'monitor' },
        ],
      }),
      false,
    )).toEqual({ tipo: 'shell', rotulo: 'npm run build', extra: 1 });
  });

  it('done → concluido', () => {
    expect(agoraDoAgente(agente({ status: 'done' }), false)).toEqual({ tipo: 'concluido' });
  });

  it('offline → encerrado (card não é desenhado)', () => {
    expect(agoraDoAgente(agente({ status: 'offline' }), false)).toEqual({ tipo: 'encerrado' });
  });

  it('sumido → encerrado, mesmo com status vivo', () => {
    expect(agoraDoAgente(agente({ status: 'working' }), true)).toEqual({ tipo: 'encerrado' });
  });
});

describe('fatiaAcoes', () => {
  const at = [acao('read', 0), acao('edit', 1), acao('git', 2), acao('test', 3)];

  it('devolve as mais recentes primeiro', () => {
    const { itens } = fatiaAcoes(at, 2);
    expect(itens.map((a) => a.id)).toEqual(['test-3', 'git-2']);
  });

  it('restantes e total acompanham a fatia', () => {
    const f = fatiaAcoes(at, 2);
    expect(f.restantes).toBe(2);
    expect(f.total).toBe(4);
    // tudo visível → zero restantes, sem estourar a lista
    expect(fatiaAcoes(at, 10)).toEqual({ itens: at.slice().reverse(), restantes: 0, total: 4 });
  });
});
