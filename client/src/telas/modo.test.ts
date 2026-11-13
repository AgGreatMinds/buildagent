// Testes table-driven de `modo.ts`:
// as 9 linhas da tabela 2.1, todos os `kind` da tabela 2.2, anti-pisca e representante.
// Vitest + `agora` controlado (sem Date.now()/Math.random()).

import { describe, expect, it } from 'vitest';
import {
  ANTI_PISCA_MS,
  DONE_FECHANDO_MS,
  IDLE_LONGO_MS,
  MODOS,
  modoDaTela,
  modoEstavel,
  representanteDe,
  type EntradaModoTela,
} from './modo';
import type { AgenteEntrada, PessoaId } from '../vida/tipos';

const AGORA = 1_000_000_000_000;
const BASE: Omit<EntradaModoTela, 'estado'> = {
  ocupado: true,
  noLugar: true,
  atividade: undefined,
  desdeEstado: AGORA,
  agora: AGORA,
};

// Fábrica mínima de agente/entrada, só com o que cada teste precisa.
function agente(overrides: Partial<AgenteEntrada> & Pick<AgenteEntrada, 'id'>): AgenteEntrada {
  return {
    kind: 'main',
    roomId: 'repo',
    name: 'x',
    role: 'r',
    sessionId: 'c',
    account: 'a',
    status: 'working',
    startedAt: AGORA,
    lastEventAt: AGORA,
    statusSince: AGORA,
    ...overrides,
  } as AgenteEntrada;
}
function pessoa(overrides: Partial<PessoaId> & Pick<PessoaId, 'chave'>): PessoaId {
  return {
    nome: 'I',
    nomeAutomatico: true,
    papel: 'p',
    roomId: 'r',
    provider: 'claude',
    sessionId: 'c',
    agenteIds: [],
    contagem: 1,
    estado: 'working',
    entrouEm: AGORA,
    semente: 1,
    ...overrides,
  };
}

describe('modoDaTela — as 9 linhas de §2.1, na ordem', () => {
  const linhas: Array<[string, EntradaModoTela, ReturnType<typeof modoDaTela>]> = [
    // Linha 1: assento sem pessoa → `off` (e `off` mesmo com estado estranho pendurado).
    ['assento vazio → off', { ...BASE, ocupado: false, estado: 'idle' }, 'off'],
    // Linha 2: `waiting` → `alert` — ganha até da atividade e do tempo decorrido.
    ['waiting → alert (mesmo com atividade e 4 min decorridos)',
      { ...BASE, estado: 'waiting', atividade: 'edit', desdeEstado: AGORA - 4 * 60_000 }, 'alert'],
    // Linha 3: `shell` → `progress`.
    ['shell → progress', { ...BASE, estado: 'shell' }, 'progress'],
    // Linha 4: `working` fora do lugar (sala de guerra) → `standby`, sem olhar a atividade.
    ['working fora do lugar → standby (ignora atividade)',
      { ...BASE, estado: 'working', noLugar: false, atividade: 'edit' }, 'standby'],
    // Linha 5: `working` no lugar → tabela 2.2 (coberta em detalhe no describe abaixo).
    // Linha 6: `idle` há 1 min → `standby`.
    ['idle há 1 min → standby', { ...BASE, estado: 'idle', desdeEstado: AGORA - 60_000 }, 'standby'],
    // Linha 7: `idle` há 4 min → `idle`.
    ['idle há 4 min → idle', { ...BASE, estado: 'idle', desdeEstado: AGORA - 4 * 60_000 }, 'idle'],
    // Limite exato de §2.1: "há ≥ 3 min" — em 3 min inteiros já é `idle`.
    ['idle há exatamente 3 min → idle', { ...BASE, estado: 'idle', desdeEstado: AGORA - IDLE_LONGO_MS }, 'idle'],
    // Linha 8: `done` há 1 min → `tasks` (checklist fechando).
    ['done há 1 min → tasks', { ...BASE, estado: 'done', desdeEstado: AGORA - 60_000 }, 'tasks'],
    // Linha 9: `done` há 3 min → `off` (e 2 min exatos já viram `off`: "≥ 2 min").
    ['done há 3 min → off', { ...BASE, estado: 'done', desdeEstado: AGORA - 3 * 60_000 }, 'off'],
    ['done há exatamente 2 min → off', { ...BASE, estado: 'done', desdeEstado: AGORA - DONE_FECHANDO_MS }, 'off'],
    // Linha 9 continua: `offline` e estado desconhecido → `off`.
    ['offline → off', { ...BASE, estado: 'offline' }, 'off'],
    ['estado desconhecido → off', { ...BASE, estado: 'zumbi' }, 'off'],
  ];
  for (const [nome, entrada, esperado] of linhas) {
    it(nome, () => expect(modoDaTela(entrada)).toBe(esperado));
  }
});

describe('modoDaTela — todos os `kind` da tabela 2.2 (working no lugar)', () => {
  // [nome, kind (undefined = atividade ausente), modo esperado]
  const kinds: Array<[string, string | undefined, ReturnType<typeof modoDaTela>]> = [
    ['edit → code', 'edit', 'code'],
    ['write → code', 'write', 'code'],
    ['run → terminal', 'run', 'terminal'],
    ['test → terminal', 'test', 'terminal'],
    ['git → terminal', 'git', 'terminal'],
    ['web → browser', 'web', 'browser'],
    ['browser → browser', 'browser', 'browser'],
    ['mcp → browser', 'mcp', 'browser'],
    ['search → search', 'search', 'search'],
    ['read → docs', 'read', 'docs'],
    ['skill → docs', 'skill', 'docs'],
    ['plan → tasks', 'plan', 'tasks'],
    ['delegate → tasks', 'delegate', 'tasks'],
    ['compact → progress', 'compact', 'progress'],
    ['error → alert', 'error', 'alert'],
    ['wait → alert', 'wait', 'alert'],
    ['done → standby', 'done', 'standby'],
    // Neutro de propósito (§2.2): nunca cair em `code` quando não se sabe.
    ['think → chat', 'think', 'chat'],
    ['respond → chat', 'respond', 'chat'],
    ['prompt → chat', 'prompt', 'chat'],
    ['communicate → chat', 'communicate', 'chat'],
    ['ask → chat', 'ask', 'chat'],
    ['other → chat', 'other', 'chat'],
    ['atividade ausente → chat', undefined, 'chat'],
    ['atividade desconhecida ("fluxo") → chat', 'fluxo', 'chat'],
  ];
  for (const [nome, kind, esperado] of kinds) {
    const entrada: EntradaModoTela = { ...BASE, estado: 'working', atividade: kind };
    it(nome, () => expect(modoDaTela(entrada)).toBe(esperado));
  }
});

describe('modoEstavel — anti-pisca de 3 s', () => {
  it('mesmo modo não muda', () => {
    expect(modoEstavel('code', 0, 'code', AGORA)).toBe('code');
  });

  it('entre modos de trabalho só troca depois de 3000 ms no atual', () => {
    const desde = AGORA - ANTI_PISCA_MS;
    expect(modoEstavel('code', desde, 'terminal', AGORA - 1)).toBe('code'); // 2999 ms: segura
    expect(modoEstavel('code', desde, 'terminal', AGORA)).toBe('terminal'); // 3000 ms: troca
    expect(modoEstavel('terminal', desde, 'code', AGORA)).toBe('code'); // e no sentido oposto
  });

  it('troca imediata quando o NOVO é alert/progress/off/standby', () => {
    for (const novo of ['alert', 'progress', 'off', 'standby'] as const) {
      expect(modoEstavel('code', AGORA - 10, novo, AGORA)).toBe(novo);
    }
  });

  it('troca imediata quando o ATUAL é alert/progress/off/standby', () => {
    for (const atual of ['alert', 'progress', 'off', 'standby'] as const) {
      expect(modoEstavel(atual, AGORA - 10, 'code', AGORA)).toBe('code');
    }
  });

  it('alert → progress também é imediato (não é modo de trabalho)', () => {
    expect(modoEstavel('alert', AGORA - 10, 'progress', AGORA)).toBe('progress');
  });
});

describe('representanteDe — §2.1', () => {
  const agentes = [
    agente({ id: 'a1', status: 'working', lastEventAt: AGORA + 100 }),
    agente({ id: 'a2', status: 'waiting', lastEventAt: AGORA + 300 }),
    agente({ id: 'a3', status: 'idle', lastEventAt: AGORA + 200 }),
    agente({ id: 'outro', status: 'working', lastEventAt: AGORA + 999 }), // fora da pessoa
  ];

  it('escolhe o mais recente COM O STATUS da pessoa', () => {
    const p = pessoa({ chave: 'p', agenteIds: ['a1', 'a2', 'a3'], estado: 'working' });
    expect(representanteDe(p, agentes)?.id).toBe('a1');
  });

  it('fallback para o mais recente geral quando nenhum casa com o status', () => {
    const p = pessoa({ chave: 'p', agenteIds: ['a1', 'a2'], estado: 'shell' });
    expect(representanteDe(p, agentes)?.id).toBe('a2');
  });

  it('ignora agentes fora de `agenteIds`', () => {
    const p = pessoa({ chave: 'p', agenteIds: ['a1'], estado: 'idle' });
    // a1 é working, a3 é idle mas não é meu: fallback para o mais recente geral = a1.
    expect(representanteDe(p, agentes)?.id).toBe('a1');
  });

  it('pessoa `done` não tem representante', () => {
    const p = pessoa({ chave: 'p', agenteIds: ['a1', 'a2'], estado: 'done' });
    expect(representanteDe(p, agentes)).toBeNull();
  });

  it('nada casou → null', () => {
    const p = pessoa({ chave: 'p', agenteIds: [], estado: 'working' });
    expect(representanteDe(p, agentes)).toBeNull();
  });
});

describe('MODOS', () => {
  it('são exatamente os 14 modos do §1.1', () => {
    expect(MODOS).toHaveLength(14);
    expect(new Set(MODOS).size).toBe(14);
    expect([...MODOS].sort()).toEqual(
      ['alert', 'browser', 'chat', 'code', 'docs', 'game', 'idle', 'off', 'progress',
        'search', 'show', 'standby', 'tasks', 'terminal'].sort(),
    );
  });
});
