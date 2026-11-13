// Testes só da parte pura do módulo —
// `intervaloDaTela`. `Telas`/`TelaViva` exigem DOM e three.js, então ficam
// de fora (não há DOM no teste); a regra de intervalo é a única lógica pura.

import { describe, expect, it } from 'vitest';
import { intervaloDaTela } from './telas';

describe('intervaloDaTela', () => {
  it('os 4 trechos de distância', () => {
    expect(intervaloDaTela(5, false)).toBe(100); // < 15 m
    expect(intervaloDaTela(20, false)).toBe(200); // 15–35 m
    expect(intervaloDaTela(50, false)).toBe(500); // 35–80 m
    expect(intervaloDaTela(100, false)).toBe(Infinity); // > 80 m congela
  });

  it('os limites 15/35/80 caem no trecho superior', () => {
    expect(intervaloDaTela(14.9, false)).toBe(100);
    expect(intervaloDaTela(15, false)).toBe(200);
    expect(intervaloDaTela(35, false)).toBe(500);
    expect(intervaloDaTela(80, false)).toBe(500);
    expect(intervaloDaTela(80.1, false)).toBe(Infinity);
  });

  it('com reduzido=true os trechos curtos viram 500', () => {
    expect(intervaloDaTela(5, true)).toBe(500); // <15: 100 vira 500
    expect(intervaloDaTela(20, true)).toBe(500); // 15–35: 200 vira 500
    expect(intervaloDaTela(50, true)).toBe(500); // 35–80: continua 500
  });

  it('com reduzido=true, >80 continua Infinity (tela congelada de verdade)', () => {
    expect(intervaloDaTela(100, true)).toBe(Infinity);
  });
});
