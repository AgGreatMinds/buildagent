import { describe, expect, it } from 'vitest';
import { fatorDia } from './mundo';

describe('fatorDia (0 = noite fechada, 1 = dia pleno)', () => {
  it('meio-dia é dia pleno e a madrugada é noite fechada', () => {
    expect(fatorDia(12)).toBe(1);
    expect(fatorDia(0)).toBe(0);
    expect(fatorDia(3)).toBe(0);
    expect(fatorDia(22)).toBe(0);
  });

  it('amanhece e anoitece em curva, sem salto', () => {
    expect(fatorDia(6)).toBeCloseTo(0, 6);
    expect(fatorDia(18)).toBeCloseTo(0, 6);
    let antes = fatorDia(6);
    for (let h = 6.25; h <= 9; h += 0.25) {
      const agora = fatorDia(h);
      expect(agora).toBeGreaterThanOrEqual(antes);
      expect(agora - antes).toBeLessThan(0.15); // um quarto de hora nunca muda a luz de uma vez
      antes = agora;
    }
  });

  it('fica sempre entre 0 e 1, inclusive com hora forçada fora de 0–24 (?hora=25, ?hora=-2)', () => {
    for (let h = -30; h <= 60; h += 0.5) {
      const f = fatorDia(h);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
      expect(fatorDia(h + 24)).toBeCloseTo(f, 6); // o ciclo se repete a cada 24 h
    }
  });
});
