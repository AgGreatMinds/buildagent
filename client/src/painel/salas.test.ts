// Testes de salas.ts: apelido (sobrescreve, vazio reseta, teto 40, colapsa espaços) e
// ordem (reordena, sala nova vai p/ fim, moverSala antes/depois, storage corrompido cai
// no fallback sem quebrar). Storage injetado — roda em node.
import { describe, expect, it } from 'vitest';
import {
  CHAVE_APELIDOS, CHAVE_ORDEM, NOME_MAX,
  definirApelido, getApelido, moverSala, nomeEfetivo, ordenarGrupos,
  type StorageLike,
} from './salas';

/** localStorage de teste em memória (mesma forma do storagePadrao injetável). */
function storageFake(): StorageLike {
  const d = new Map<string, string>();
  return {
    getItem: (k) => (d.has(k) ? d.get(k)! : null),
    setItem: (k, v) => { d.set(k, String(v)); },
    removeItem: (k) => { d.delete(k); },
  };
}

describe('apelido (definirApelido/getApelido/nomeEfetivo)', () => {
  it('sobrescreve: o apelido vira o nome efetivo da sala', () => {
    const st = storageFake();
    definirApelido('projeto-a', 'Painel P2', st);
    expect(getApelido('projeto-a', st)).toBe('Painel P2');
    expect(nomeEfetivo('projeto-a', 'PROJETO-A', st)).toBe('Painel P2');
  });

  it('espaços colapsados, trim e teto de 40 caracteres', () => {
    const st = storageFake();
    definirApelido('s', '  muito   espaço   ', st);
    expect(getApelido('s', st)).toBe('muito espaço');
    definirApelido('s', 'x'.repeat(NOME_MAX + 10), st);
    expect(getApelido('s', st)).toBe('x'.repeat(NOME_MAX));
  });

  it('vazio (só espaços) apaga o apelido: volta ao nome do snapshot', () => {
    const st = storageFake();
    definirApelido('s', 'apelido', st);
    definirApelido('s', '   ', st);
    expect(getApelido('s', st)).toBeUndefined();
    expect(nomeEfetivo('s', 'NOME-SNAPSHOT', st)).toBe('NOME-SNAPSHOT');
  });

  it('sem apelido, nomeEfetivo devolve o nome do snapshot', () => {
    const st = storageFake();
    expect(nomeEfetivo('outra', 'NOME-OUTRA', st)).toBe('NOME-OUTRA');
  });
});

describe('ordem (ordenarGrupos/moverSala)', () => {
  it('ordem salva reordena; sala nova vai para o fim na ordem de chegada', () => {
    const st = storageFake();
    moverSala(['a', 'b', 'c'], 'c', 'a', false, st); // c sobe antes de a: [c, a, b]
    expect(ordenarGrupos(['a', 'b', 'c'], st)).toEqual(['c', 'a', 'b']);
    // Sala nova ('d') não tem posto guardado → fim, na ordem em que veio.
    expect(ordenarGrupos(['d', 'a', 'b', 'c', 'e'], st)).toEqual(['c', 'a', 'b', 'd', 'e']);
  });

  it('sem ordem guardada, a ordem do snapshot vale', () => {
    const st = storageFake();
    expect(ordenarGrupos(['a', 'b', 'c'], st)).toEqual(['a', 'b', 'c']);
  });

  it('moverSala: "depois" e "antes"; mover para si mesma / desconhecida não faz nada', () => {
    const st = storageFake();
    expect(moverSala(['a', 'b', 'c'], 'a', 'a', true, st)).toBe(false);
    expect(moverSala(['a', 'b', 'c'], 'z', 'a', true, st)).toBe(false);
    moverSala(['a', 'b', 'c'], 'a', 'c', true, st); // a depois de c: [b, c, a]
    expect(ordenarGrupos(['a', 'b', 'c'], st)).toEqual(['b', 'c', 'a']);
    moverSala(['a', 'b', 'c'], 'c', 'a', false, st); // c antes de a: [c, a, b]
    expect(ordenarGrupos(['a', 'b', 'c'], st)).toEqual(['c', 'a', 'b']);
  });

  it('ids guardados que não estão visíveis agora ficam no fim, com posição relativa', () => {
    const st = storageFake();
    moverSala(['a', 'b'], 'b', 'a', false, st); // guarda [b, a]
    // 'b' não está visível agora, mas mantém o posto guardado (o 1º) na próxima lista:
    expect(ordenarGrupos(['a', 'c', 'b'], st)).toEqual(['b', 'a', 'c']);
  });
});

describe('storage corrompido → fallback sem quebrar', () => {
  it('apelidos com JSON inválido ou valor não-objeto → sem apelido', () => {
    const st = storageFake();
    st.setItem(CHAVE_APELIDOS, 'isso não é JSON{{{');
    expect(getApelido('s', st)).toBeUndefined();
    st.setItem(CHAVE_APELIDOS, JSON.stringify(['lista', 'não', 'é', 'objeto']));
    expect(nomeEfetivo('s', 'NOME', st)).toBe('NOME');
  });

  it('ordem com JSON inválido ou não-objeto → ordem do snapshot', () => {
    const st = storageFake();
    st.setItem(CHAVE_ORDEM, 'nem JSON');
    expect(ordenarGrupos(['a', 'b'], st)).toEqual(['a', 'b']);
    st.setItem(CHAVE_ORDEM, JSON.stringify({ não: 'é array' }));
    expect(ordenarGrupos(['a', 'b'], st)).toEqual(['a', 'b']);
  });

  it('moverSala / definirApelido sobre storage corrompido escreve estado limpo', () => {
    const st = storageFake();
    st.setItem(CHAVE_ORDEM, 'lixo');
    moverSala(['a', 'b'], 'b', 'a', false, st);
    expect(ordenarGrupos(['a', 'b'], st)).toEqual(['b', 'a']);
    st.setItem(CHAVE_APELIDOS, 'lixo');
    definirApelido('a', 'A2', st);
    expect(nomeEfetivo('a', 'A', st)).toBe('A2');
  });
});
