// Testes da lógica pura da lista de agentes: aninhamento pai/filho, sala vazia,
// busca por nome/projeto/conta, filtro por conta. `agruparPorSala` e `buscar` não tocam DOM.
import { describe, expect, it } from 'vitest';
import {
  agruparPorSala,
  buscar,
  contagemDeEstados,
  contagemPorConta,
  estadosDoGrupo,
  linhaDaAtividade,
  precisamDeVoce,
  coresDeExcecao,
  complementoDoConcluido,
  type ItemAgente,
} from './agrupar';
import type { AccountInfo, AgentInfo, RoomInfo } from '../../../shared/types';

const T0 = 1_700_000_000_000; // epoch de referência (ms)
const SALA_A = 'sala-a';
const SALA_B = 'sala-b';

// Fábrica: agente principal; sobrepõe o que o teste precisa.
function agente(p: Partial<AgentInfo> & Pick<AgentInfo, 'id'>): AgentInfo {
  const base: AgentInfo = {
    id: p.id,
    kind: 'main',
    roomId: SALA_A,
    look: 'f',
    name: p.id,
    role: 'Agente principal',
    sessionId: 'chat-1',
    account: '.claude',
    status: 'working',
    startedAt: T0,
    lastEventAt: T0,
    statusSince: T0,
    recent: [],
    tasks: [],
    stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
    seed: 1,
  };
  // Sobrepõe o que o teste precisa; `as` encerra os campos opcionais que base não traz.
  return { ...base, ...p } as AgentInfo;
}

function sala(p: Partial<RoomInfo> & Pick<RoomInfo, 'id'>): RoomInfo {
  return { name: p.id, path: `/projetos/${p.id}`, slot: 0, seed: 1, createdAt: T0, ...p };
}

const contas: AccountInfo[] = [
  { id: '.claude', short: 'C', name: 'Conta C', color: '#4f8cff', configDir: '~/.claude', sessions: 2, usageStatus: 'ok', usage: { source: 'cache', fetchedAt: T0 } },
  { id: '.codex', provider: 'codex', short: 'D', name: 'Conta D', color: '#38c172', configDir: '~/.codex', sessions: 1, usageStatus: 'disabled' },
];

describe('agruparPorSala: sala e ordem', () => {
  it('ordena as salas por slot e dá rótulo amigável à conta', () => {
    const s = {
      rooms: [sala({ id: SALA_B, slot: 2 }), sala({ id: SALA_A, slot: 1 })],
      agents: [agente({ id: 'a1', roomId: SALA_A }), agente({ id: 'b1', roomId: SALA_B })],
      accounts: contas,
    };
    const g = agruparPorSala(s);
    expect(g.map((x) => x.id)).toEqual([SALA_A, SALA_B]);
    expect(g[0].agentes[0].contaRotulo).toBe('Conta C');
    // Conta desconhecida cai no id.
    const g2 = agruparPorSala({ rooms: [sala({ id: SALA_A })], agents: [agente({ id: 'a1', account: '.desconhecido' })] });
    expect(g2[0].agentes[0].contaRotulo).toBe('.desconhecido');
  });

  it('sala sem agente ativo não aparece; agente offline sai', () => {
    const g = agruparPorSala({
      rooms: [sala({ id: SALA_A }), sala({ id: SALA_B })],
      agents: [
        agente({ id: 'a1', status: 'offline' }),
        agente({ id: 'b1', roomId: SALA_B }),
      ],
      accounts: contas,
    });
    expect(g.map((x) => x.id)).toEqual([SALA_B]);
  });
});

describe('agruparPorSala: aninhamento pai/filho', () => {
  it('sub sob o main; filhados ordenados por nome', () => {
    const g = agruparPorSala({
      rooms: [sala({ id: SALA_A })],
      agents: [
        agente({ id: 'p1', name: 'Zéfiro' }),
        agente({ id: 's1', kind: 'sub', parentId: 'p1', name: 'Iris' }),
        agente({ id: 's2', kind: 'sub', parentId: 'p1', name: 'Argos' }),
      ],
      accounts: contas,
    });
    expect(g[0].agentes).toHaveLength(1);
    expect(g[0].agentes[0].id).toBe('p1');
    expect(g[0].agentes[0].filhados.map((f) => f.id)).toEqual(['s2', 's1']);
  });

  it('sub sem pai visível sobe para o nível da sala', () => {
    const g = agruparPorSala({
      rooms: [sala({ id: SALA_A })],
      agents: [agente({ id: 's1', kind: 'sub', parentId: 'paizinha-sumida', name: 'Recruta' })],
    });
    expect(g[0].agentes.map((a) => a.id)).toEqual(['s1']);
    expect(g[0].agentes[0].filhados).toEqual([]);
  });

  it('sub filha de sub (sem o main) sobe: aninhamento tem 1 nível', () => {
    const g = agruparPorSala({
      rooms: [sala({ id: SALA_A })],
      agents: [agente({ id: 's2', kind: 'sub', parentId: 's1', name: 'Filha de sub' })],
    });
    expect(g[0].agentes.map((a) => a.id)).toEqual(['s2']);
  });
});

describe('buscar: nome, projeto, conta', () => {
  const grupos = agruparPorSala({
    rooms: [sala({ id: SALA_A }), sala({ id: SALA_B })],
    agents: [
      agente({ id: 'a1', name: 'Iris' }),
      agente({ id: 'a2', name: 'Dédalo', roomId: SALA_B, account: '.codex', provider: 'codex' }),
      agente({ id: 's1', kind: 'sub', parentId: 'a1', name: 'Argos', role: 'Testes' }),
    ],
    accounts: contas,
  });

  it('busca por nome e pelo papel do filhado', () => {
    const porNome = buscar(grupos, 'iris', '');
    expect(porNome[0].agentes[0].id).toBe('a1');
    expect(porNome[0].agentes[0].filhados).toHaveLength(1); // filhado do pai casado permanece
    const porPapel = buscar(grupos, 'testes', '');
    expect(porPapel[0].agentes[0].id).toBe('a1');
    expect(porPapel[0].agentes[0].filhados.map((f) => f.id)).toEqual(['s1']);
  });

  it('busca pelo nome do projeto e da conta (case-insensitive)', () => {
    expect(buscar(grupos, 'sala-b', '').map((g) => g.id)).toEqual([SALA_B]);
    expect(buscar(grupos, 'codex', '').map((g) => g.id)).toEqual([SALA_B]);
  });

  it('filhado que casa sozinho puxa o pai como contexto', () => {
    const r = buscar(grupos, 'argos', '');
    expect(r[0].agentes[0].id).toBe('a1');
    expect(r[0].agentes[0].filhados.map((f) => f.id)).toEqual(['s1']);
  });

  it('busca vazia não casa: sala e grupos somem', () => {
    expect(buscar(grupos, 'ninguém-existe', '')).toEqual([]);
    expect(buscar(grupos, '', '')).toEqual(grupos);
  });

  it('filtro por conta: só agentes dessa conta; fila vazia some', () => {
    const r = buscar(grupos, '', '.codex');
    expect(r.map((g) => g.id)).toEqual([SALA_B]);
    expect(r[0].agentes.map((a) => a.id)).toEqual(['a2']);
  });
});

describe('agruparPorSala: dados da linha ao vivo', () => {
  it('leva atividade, motivo da espera, shell e lançador; texto vazio não vira atividade', () => {
    const g = agruparPorSala({
      rooms: [sala({ id: SALA_A, launcher: 'openbot' })],
      agents: [
        agente({ id: 'a1', activity: { id: 'x', kind: 'edit', icon: '✏️', text: 'Editando app.ts', at: T0 }, waitingFor: 'aprovar uma permissão' }),
        agente({ id: 'a2', activity: { id: 'y', kind: 'run', icon: '▶️', text: '', at: T0 }, shells: [{ id: 's', label: 'npm test', startedAt: T0, background: true, kind: 'shell' }] }),
      ],
    });
    expect(g[0].lancador).toBe('openbot');
    expect(g[0].agentes[0].atividade).toEqual({ kind: 'edit', texto: 'Editando app.ts' });
    expect(g[0].agentes[0].esperandoPor).toBe('aprovar uma permissão');
    expect(g[0].agentes[1].atividade).toBeUndefined();
    expect(g[0].agentes[1].shellRotulo).toBe('npm test');
  });
});

describe('linhaDaAtividade (segunda linha da lista)', () => {
  const at = (kind: ItemAgente['atividade'] extends infer A ? (A extends { kind: infer K } ? K : never) : never, texto: string) => ({ kind, texto });

  it('trabalhando: sem selo, ícone e texto da atividade; sem atividade, linha vazia', () => {
    expect(linhaDaAtividade({ status: 'working', atividade: at('test', 'Rodando os testes') })).toEqual({ selo: null, icone: 'test', texto: 'Rodando os testes' });
    expect(linhaDaAtividade({ status: 'working' })).toEqual({ selo: null, icone: null, texto: '' });
  });

  it('precisa de você: selo forte; o motivo manda, a pergunta é o plano B', () => {
    expect(linhaDaAtividade({ status: 'waiting', esperandoPor: 'aprovar uma permissão', atividade: at('edit', 'Editando x') })).toEqual({ selo: 'forte', icone: 'ask', texto: 'aprovar uma permissão' });
    expect(linhaDaAtividade({ status: 'waiting', atividade: at('ask', 'Qual banco usar?') })).toEqual({ selo: 'forte', icone: 'ask', texto: 'Qual banco usar?' });
    expect(linhaDaAtividade({ status: 'waiting', atividade: at('edit', 'Editando x') })).toEqual({ selo: 'forte', icone: null, texto: '' });
  });

  it('esperando shell: sem selo; rótulo do shell vence a última atividade', () => {
    expect(linhaDaAtividade({ status: 'shell', shellRotulo: 'npm run build', atividade: at('respond', 'Escrevendo') })).toEqual({ selo: null, icone: 'run', texto: 'npm run build' });
    expect(linhaDaAtividade({ status: 'shell' })).toEqual({ selo: null, icone: null, texto: '' });
  });

  it('parado: selo discreto; só o fechamento do turno sobrevive (gerúndio antigo sai)', () => {
    expect(linhaDaAtividade({ status: 'idle', atividade: at('done', 'Concluiu em 1 min') })).toEqual({ selo: null, icone: 'done', texto: 'Concluiu em 1 min' });
    expect(linhaDaAtividade({ status: 'idle', atividade: at('respond', 'Escrevendo a resposta') })).toEqual({ selo: 'discreto', icone: null, texto: '' });
    expect(linhaDaAtividade({ status: 'done' })).toEqual({ selo: 'discreto', icone: null, texto: '' });
  });

  it('um sinal por linha: com duração a frase inteira fica sem selo; "Concluiu" sozinho vira só o selo', () => {
    expect(linhaDaAtividade({ status: 'done', atividade: at('done', 'Concluiu') })).toEqual({ selo: 'discreto', icone: null, texto: '' });
    expect(linhaDaAtividade({ status: 'idle', atividade: at('done', 'Concluiu') })).toEqual({ selo: 'discreto', icone: null, texto: '' });
    expect(linhaDaAtividade({ status: 'done', atividade: at('done', 'Concluiu em 1min 18s') })).toEqual({ selo: null, icone: 'done', texto: 'Concluiu em 1min 18s' });
    expect(linhaDaAtividade({ status: 'idle', atividade: at('done', 'Concluiu em 1min 18s') })).toEqual({ selo: null, icone: 'done', texto: 'Concluiu em 1min 18s' });
  });

  it('complementoDoConcluido: o que a frase diz além de "concluiu"', () => {
    expect(complementoDoConcluido('Concluiu em 1min 18s')).toBe('em 1min 18s');
    expect(complementoDoConcluido('Concluiu')).toBe('');
    expect(complementoDoConcluido('Finished in 2s')).toBe('in 2s');
    expect(complementoDoConcluido('Rodou os testes')).toBe('Rodou os testes');
  });
});

describe('estados do cabeçalho e bloco "Precisam de você"', () => {
  const grupos = () =>
    agruparPorSala({
      rooms: [sala({ id: SALA_A, slot: 0 }), sala({ id: SALA_B, slot: 1 })],
      agents: [
        agente({ id: 'a1', status: 'idle' }),
        agente({ id: 's1', kind: 'sub', parentId: 'a1', status: 'waiting', statusSince: T0 + 5_000, name: 'Zeca' }),
        agente({ id: 'a2', status: 'working', account: '.codex' }),
        agente({ id: 'b1', roomId: SALA_B, status: 'waiting', statusSince: T0, name: 'Ana' }),
      ],
      accounts: contas,
    });

  it('pontos em ordem de prioridade, com subagentes, e contagem por estado', () => {
    const est = estadosDoGrupo(grupos()[0]);
    expect(est).toEqual(['waiting', 'working', 'idle']);
    expect(contagemDeEstados(['idle', 'working', 'working', 'waiting'])).toEqual([['waiting', 1], ['working', 2], ['idle', 1]]);
  });

  it('precisamDeVoce: todas as salas, subagentes inclusos, quem espera há mais tempo primeiro', () => {
    const u = precisamDeVoce(grupos());
    expect(u.map((x) => x.item.id)).toEqual(['b1', 's1']);
    expect(u[0].salaId).toBe(SALA_B);
    expect(precisamDeVoce([])).toEqual([]);
  });

  it('contagemPorConta soma principais e subagentes', () => {
    const n = contagemPorConta(grupos());
    expect(n.get('.claude')).toBe(3);
    expect(n.get('.codex')).toBe(1);
  });
});

describe('coresDeExcecao (ponto de cor só na conta que não é a dominante do provedor)', () => {
  const contas3 = [
    { id: '.claude', color: '#f4682a' },
    { id: '.claude-b', color: ' #2e7fd4 ' },
    { id: '.codex', provider: 'codex' as const, color: '#ffffff' },
  ];
  it('a conta com mais agentes fica sem ponto; a outra do mesmo provedor ganha; provedor de conta única não', () => {
    const s = coresDeExcecao(contas3, new Map([['.claude', 16], ['.claude-b', 1], ['.codex', 3]]));
    expect([...s.entries()]).toEqual([['.claude-b', '#2e7fd4']]);
  });
  it('empate no topo: nenhuma é dominante e todas mostram; cor que não é hex é descartada', () => {
    const s = coresDeExcecao([...contas3, { id: '.claude-c', color: 'red;x:url(y)' }], new Map([['.claude', 2], ['.claude-b', 2]]));
    expect([...s.entries()]).toEqual([['.claude', '#f4682a'], ['.claude-b', '#2e7fd4']]);
    expect(coresDeExcecao(undefined, new Map()).size).toBe(0);
  });
});
