// Testes da lógica pura do feed: detecção de mudanças entre snapshots, sem
// duplicar eventos, teto de linhas e máscaras do modo conteúdo.
import { describe, expect, it } from 'vitest';
import { RastreadorAtividade, nomeDaLinha, textoDaLinha, type LinhaFeed } from './atividade';
import type { AgentInfo } from '../../../shared/types';

const T0 = 1_700_000_000_000;
const MIN = 60_000;

// Fábrica mínima: agente principal; sobrepõe o que o teste precisa.
function agente(id: string, p: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id,
    kind: 'main',
    roomId: 'sala',
    look: 'f',
    name: id,
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
    ...p,
  } as AgentInfo;
}

const SALAS = [{ id: 'sala', name: 'projeto', path: '/x', slot: 0, seed: 1, createdAt: T0 }];

describe('RastreadorAtividade: detecção de mudanças', () => {
  it('primeiro snapshot: cada agente gera linha de status e de título', () => {
    const r = new RastreadorAtividade();
    const linhas = r.atualizar([agente('a1', { title: 'Corrigir bug' })], SALAS, T0);
    expect(linhas.map((l) => l.tipo).sort()).toEqual(['status', 'titulo']);
    expect(linhas.find((l) => l.tipo === 'status')?.status).toBe('working');
    expect(linhas.find((l) => l.tipo === 'titulo')?.titulo).toBe('Corrigir bug');
  });

  it('snapshot idêntico não gera nova linha (sem duplicar eventos)', () => {
    const r = new RastreadorAtividade();
    const s = [agente('a1', { title: 'Corrigir bug' })];
    r.atualizar(s, SALAS, T0);
    expect(r.atualizar(s, SALAS, T0 + MIN)).toHaveLength(0);
    expect(r.linhas).toHaveLength(2);
  });

  it('mudança de status gera linha só do status', () => {
    const r = new RastreadorAtividade();
    r.atualizar([agente('a1', { title: 'Corrigir bug' })], SALAS, T0);
    const novo = r.atualizar([agente('a1', { title: 'Corrigir bug', status: 'waiting', statusSince: T0 + MIN })], SALAS, T0 + MIN);
    expect(novo).toHaveLength(1);
    expect(novo[0]).toMatchObject({ tipo: 'status', status: 'waiting', hora: T0 + MIN });
  });

  it('mudança de título gera linha só do título; título ausente vira undefined', () => {
    const r = new RastreadorAtividade();
    r.atualizar([agente('a1', { title: 'Antes' })], SALAS, T0);
    const novo = r.atualizar([agente('a1', { title: 'Depois', lastEventAt: T0 + 2 * MIN })], SALAS, T0 + 2 * MIN);
    expect(novo).toHaveLength(1);
    expect(novo[0]).toMatchObject({ tipo: 'titulo', titulo: 'Depois', icone: '📌' });
    const sem = r.atualizar([agente('a1', { title: undefined, status: 'idle', statusSince: T0 + 3 * MIN })], SALAS, T0 + 3 * MIN);
    expect(sem.map((l) => l.tipo)).toEqual(['status', 'titulo']); // título também mudou (→ vazio)
  });

  it('agente que some do snapshot (sem offline/done) gera linha de saída e some da memória', () => {
    const r = new RastreadorAtividade();
    r.atualizar([agente('a1', { title: 'x' })], SALAS, T0);
    const saida = r.atualizar([], SALAS, T0 + MIN);
    expect(saida).toHaveLength(1);
    expect(saida[0]).toMatchObject({ agenteId: 'a1', status: 'offline', salaNome: 'projeto' });
    // Não repete na chamada seguinte.
    expect(r.atualizar([], SALAS, T0 + 2 * MIN)).toHaveLength(0);
  });

  it('ids são únicos mesmo entre eventos do mesmo agente', () => {
    const r = new RastreadorAtividade();
    const a = r.atualizar([agente('a1')], SALAS, T0);
    const b = r.atualizar([agente('a1', { status: 'idle', statusSince: T0 + MIN })], SALAS, T0 + MIN);
    const ids = [...a, ...b].map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('RastreadorAtividade: teto de linhas', () => {
  it('mantém no máximo o teto e descarta as mais antigas', () => {
    // Cada agente novo gera 2 linhas (status + título); os anteriores seguem no snapshot
    // (para não misturar com as linhas de saída). Com teto 5, as mais antigas caem primeiro.
    const r = new RastreadorAtividade(5);
    r.atualizar([agente('a0')], SALAS, T0); // 2
    r.atualizar([agente('a0'), agente('a1')], SALAS, T0 + 1); // 4
    r.atualizar([agente('a0'), agente('a1'), agente('a2')], SALAS, T0 + 2); // 6 → corta a0:status
    expect(r.linhas).toHaveLength(5);
    expect(r.linhas[0]).toMatchObject({ agenteId: 'a0', tipo: 'titulo' });
    r.atualizar([agente('a0'), agente('a1'), agente('a2'), agente('a3')], SALAS, T0 + 3); // 8 → corta a0:título e a1:status
    expect(r.linhas).toHaveLength(5);
    expect(r.linhas[0]).toMatchObject({ agenteId: 'a1', tipo: 'titulo' });
  });

  it('teto padrão é 200', () => {
    const r = new RastreadorAtividade();
    for (let i = 0; i < 210; i++) r.atualizar([agente(`a${i}`)], SALAS, T0 + i);
    expect(r.linhas).toHaveLength(200);
  });
});

describe('máscaras do modo conteúdo', () => {
  const linhaT = (titulo?: string): LinhaFeed => ({
    id: 'x', agenteId: 'a1', salaId: 's', salaNome: 'projeto',
    nome: 'Iris', sub: false, icone: '📌', hora: T0, tipo: 'titulo', titulo,
  });
  const linhaS: LinhaFeed = { ...linhaT('t'), icone: '⚙️', tipo: 'status', status: 'working' };

  it('modo conteúdo desligado mostra nome e título reais', () => {
    expect(nomeDaLinha(linhaT('Corrigir bug'), false)).toBe('Iris');
    expect(textoDaLinha(linhaT('Corrigir bug'), false)).toBe('Corrigir bug');
    expect(textoDaLinha(linhaS, false)).toBe('trabalhando');
  });

  it('modo conteúdo ligado troca nome/título por rótulos genéricos', () => {
    expect(nomeDaLinha(linhaT('Corrigir bug'), true)).toBe('Agente');
    expect(nomeDaLinha({ ...linhaT('t'), sub: true }, true)).toBe('Subagente');
    expect(textoDaLinha(linhaT('Corrigir bug'), true)).toBe('atividade (conteúdo oculto)');
    // Linha de status continua legível (não expõe conteúdo sensível).
    expect(textoDaLinha(linhaS, true)).toBe('trabalhando');
  });

  it('título ausente usa o rótulo "sem título" fora do modo conteúdo', () => {
    expect(textoDaLinha(linhaT(undefined), false)).toBe('sem título');
  });
});
