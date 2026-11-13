// Testes de `tempoDesde`: limites (0 s, 59 m, 1 h+, futuro) e plural simples em PT-BR.
import { describe, expect, it } from 'vitest';
import { tempoDesde } from './tempo';

const T0 = 1_700_000_000_000;
const S = 1_000;
const M = 60 * S;
const H = 60 * M;

describe('tempoDesde', () => {
  it('0 s a 14 s → "agora"', () => {
    expect(tempoDesde(T0, T0)).toBe('agora');
    expect(tempoDesde(T0 - 14 * S, T0)).toBe('agora');
  });

  it('15 s a 59 m → minutos, arredondando para cima; 60 m já vira "1 h"', () => {
    expect(tempoDesde(T0 - 15 * S, T0)).toBe('1 m');
    expect(tempoDesde(T0 - 120 * S, T0)).toBe('2 m');
    expect(tempoDesde(T0 - 59 * M, T0)).toBe('59 m');
    expect(tempoDesde(T0 - (59 * M + 30 * S), T0)).toBe('1 h');
  });

  it('1 h+ → "X h Y m"; hora cheia sem resto', () => {
    expect(tempoDesde(T0 - H, T0)).toBe('1 h');
    expect(tempoDesde(T0 - (H + 4 * M), T0)).toBe('1 h 4 m');
    expect(tempoDesde(T0 - (2 * H + 4 * M), T0)).toBe('2 h 4 m');
    expect(tempoDesde(T0 - (2 * H + 1 * M + 30 * S), T0)).toBe('2 h 2 m');
  });

  it('relógio desalinhado (statusSince no futuro) → "agora"', () => {
    expect(tempoDesde(T0 + 5 * M, T0)).toBe('agora');
  });
});
