// Testes da lógica pura do corte: o plano só depende do andar escolhido.
import { describe, expect, it } from 'vitest';
import { alturaDeCorte, deslocamentoDaVista, ORDEM } from './camera';

const ALT = 6;
const ABERTO = ALT * 3 + 4; // plano acima do telhado: nada é cortado

describe('alturaDeCorte', () => {
  it('"todos" não corta nada (plano acima do telhado)', () => {
    expect(alturaDeCorte('todos', ALT)).toBeGreaterThanOrEqual(ABERTO);
  });
  it('cada andar corta logo abaixo da própria laje de cima', () => {
    expect(alturaDeCorte(0, ALT)).toBeCloseTo(ALT - 0.45);
    expect(alturaDeCorte(1, ALT)).toBeCloseTo(2 * ALT - 0.45);
    expect(alturaDeCorte(2, ALT)).toBeCloseTo(3 * ALT - 0.45);
  });
  it('andar mais alto corta mais alto; todos os andares cortam abaixo do telhado', () => {
    const alturas = ORDEM.map((f) => alturaDeCorte(f, ALT));
    expect([...alturas].sort((a, b) => a - b)).toEqual([alturas[1], alturas[2], alturas[3], alturas[0]]);
  });
});

describe('deslocamentoDaVista', () => {
  it('sem painel, a vista não desloca', () => {
    expect(deslocamentoDaVista(1440, 0, 0)).toBe(0);
  });
  it('lista aberta à esquerda: a cena vai meia lista para a direita', () => {
    expect(deslocamentoDaVista(1440, 320, 0)).toBe(-160);
  });
  it('lista e detalhe abertos: centraliza no vão entre os dois', () => {
    expect(deslocamentoDaVista(1440, 320, 400)).toBe(40);
  });
  it('área livre estreita (celular, gaveta por cima): não desloca', () => {
    expect(deslocamentoDaVista(390, 320, 0)).toBe(0);
    expect(deslocamentoDaVista(0, 0, 0)).toBe(0);
  });
});
