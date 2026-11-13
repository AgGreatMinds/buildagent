import { describe, expect, it } from 'vitest';
import { FAIXA_ELEV, FILA_CHEIA, INTERVALO_APERTADO_MS, INTERVALO_ENTRADA_MS, esperaNaFila, partidaNaFila, passosDoElevador, pousoDireto } from './entrada';

describe('fila da calçada', () => {
  it('fila vazia: a pessoa parte na hora', () => {
    expect(partidaNaFila(1000, -Infinity)).toEqual({ partida: 1000, proxima: 1000 + INTERVALO_ENTRADA_MS });
  });

  it('nove pessoas no mesmo instante partem espaçadas, nunca juntas', () => {
    let proxima = -Infinity;
    const partidas: number[] = [];
    for (let i = 0; i < 9; i++) {
      const r = partidaNaFila(5000, proxima);
      partidas.push(r.partida);
      proxima = r.proxima;
    }
    expect(new Set(partidas).size).toBe(9);
    for (let i = 1; i < partidas.length; i++) expect(partidas[i] - partidas[i - 1]).toBe(INTERVALO_ENTRADA_MS);
  });

  it('quem chega depois de a fila esvaziar não espera', () => {
    const { proxima } = partidaNaFila(1000, -Infinity);
    expect(partidaNaFila(proxima + 60_000, proxima).partida).toBe(proxima + 60_000);
  });
});

describe('fila longa', () => {
  it('vinte pessoas de uma vez: o intervalo aperta depois das primeiras e a última não espera meio minuto', () => {
    let proxima = -Infinity;
    const partidas: number[] = [];
    for (let i = 0; i < 20; i++) {
      const r = partidaNaFila(0, proxima);
      partidas.push(r.partida);
      proxima = r.proxima;
    }
    for (let i = 1; i < partidas.length; i++) expect(partidas[i] - partidas[i - 1]).toBeGreaterThanOrEqual(INTERVALO_APERTADO_MS);
    expect(partidas[FILA_CHEIA] - partidas[FILA_CHEIA - 1]).toBe(INTERVALO_ENTRADA_MS);
    expect(partidas[FILA_CHEIA + 1] - partidas[FILA_CHEIA]).toBe(INTERVALO_APERTADO_MS);
    expect(partidas[19]).toBeLessThan(17_000); // sem teto seriam 26,6 s
  });

  it('fila indiana: os primeiros no espaço normal, os seguintes apertados, sempre crescente', () => {
    expect(esperaNaFila(0, 900)).toBe(0);
    expect(esperaNaFila(3, 900)).toBe(2700);
    expect(esperaNaFila(FILA_CHEIA + 4, 900)).toBe(FILA_CHEIA * 900 + 4 * 350);
    for (let n = 1; n < 30; n++) expect(esperaNaFila(n, 900)).toBeGreaterThan(esperaNaFila(n - 1, 900));
  });
});

describe('pouso direto', () => {
  it('rota vazia não pousa', () => {
    expect(pousoDireto([], 1)).toBeNull();
  });

  it('fica só o ponto final, no andar de partida quando não há elevador', () => {
    const fila: Array<{ x: number; troca?: number }> = [{ x: 1 }, { x: 2 }, { x: 3 }];
    expect(pousoDireto(fila, 1)).toEqual({ fim: { x: 3 }, andar: 1 });
  });

  it('rota com elevador termina no andar da última troca', () => {
    const fila = [{ x: 0 }, { x: 0, troca: 2 }, { x: 5 }];
    expect(pousoDireto(fila, 1)).toEqual({ fim: { x: 5 }, andar: 2 });
  });
});

describe('elevador em mão dupla', () => {
  const passos = passosDoElevador({ x: 0, z: -8.4 }, { x: 0, z: -9.3 }, 6, 12, 2);

  it('entra por um lado e sai pelo outro, sem voltar pela mesma linha', () => {
    expect(passos.map((p) => Math.sign(p.x))).toEqual([1, 1, -1, -1]);
    expect(passos[0].x - passos[3].x).toBeCloseTo(2 * FAIXA_ELEV);
  });

  it('troca de andar só dentro do vão, e sai andando para a frente', () => {
    expect(passos.filter((p) => p.troca !== undefined)).toEqual([{ x: -FAIXA_ELEV, y: 12, z: -9.3, troca: 2 }]);
    expect(passos.slice(0, 2).every((p) => p.y === 6)).toBe(true);
    expect(passos[3]).toEqual({ x: -FAIXA_ELEV, y: 12, z: -8.4 });
  });
});
