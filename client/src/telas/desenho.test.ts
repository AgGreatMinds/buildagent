// Testes de `desenho.ts`.
// Usam um CtxMin falso que grava cada fillRect em um array de saída pré-alocado,
// e checam: limites e teto de retângulos, determinismo, des-sincronização por
// semente e variação no tempo, e o custo de 100 chamadas por modo.

import { describe, expect, it } from 'vitest';
import { CtxMin, desenharTela } from './desenho';
import { MODOS, ModoTela } from './modo';

// CtxMin de teste: sem alocação por chamada além de 1 entrada por retângulo.
// Grava [cor, x, y, w, h] para comparação sequencial.
type Retangulo = [string, number, number, number, number];

class CtxFalso implements CtxMin {
  fillStyle = '';
  // Linha por retângulo, reutilizando o array quando cabe (evita crescer a cada teste).
  linhas: Retangulo[] = [];
  private n = 0;
  fillRect(x: number, y: number, w: number, h: number): void {
    if (this.n >= this.linhas.length) this.linhas.push([this.fillStyle, x, y, w, h]);
    else this.linhas[this.n] = [this.fillStyle, x, y, w, h];
    this.n++;
  }
  get tam(): number { return this.n; }
}

// Desenha um modo num contexto limpo e devolve a sequência de retângulos.
function quadro(modo: ModoTela, t: number, seed: number, w: number, h: number): [string, number, number, number, number][] {
  const ctx = new CtxFalso();
  desenharTela(ctx, modo, t, seed, w, h);
  return ctx.linhas.slice(0, ctx.tam);
}

function sequenciasIguais(a: readonly [string, number, number, number, number][], b: readonly [string, number, number, number, number][]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    const q = b[i];
    if (p[0] !== q[0] || p[1] !== q[1] || p[2] !== q[2] || p[3] !== q[3] || p[4] !== q[4]) return false;
  }
  return true;
}

const TENS = [0, 12345, 1.8e12] as const;
const TAMANHOS: [number, number][] = [[48, 28], [96, 54], [32, 24]];
// Os seis modos cuja sequência muda com a semente (critério c).
const POR_SEMENTE: ModoTela[] = ['code', 'terminal', 'browser', 'chat', 'tasks', 'progress'];

describe('desenharTela — retângulos dentro dos limites (a)', () => {
  for (const modo of MODOS) {
    for (const [w, h] of TAMANHOS) {
      for (const t of TENS) {
        it(`modo ${modo} em ${w}×${h} @ t=${t}: dentro de [0,w]×[0,h], sem NaN, ≤ 200 retângulos`, () => {
          const seq = quadro(modo, t, 1, w, h);
          expect(seq.length).toBeLessThanOrEqual(200);
          for (const [cor, x, y, rw, rh] of seq) {
            expect(Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(rw) || Number.isNaN(rh)).toBe(false);
            expect(x).toBeGreaterThanOrEqual(0);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(x + rw).toBeLessThanOrEqual(w);
            expect(y + rh).toBeLessThanOrEqual(h);
            expect(typeof cor).toBe('string');
          }
        });
      }
    }
  }
});

describe('desenharTela — determinismo (b)', () => {
  for (const modo of MODOS) {
    it(`modo ${modo}: mesma entrada → mesma sequência`, () => {
      for (const [w, h] of TAMANHOS) {
        const a = quadro(modo, 12345, 7, w, h);
        const b = quadro(modo, 12345, 7, w, h);
        expect(sequenciasIguais(a, b)).toBe(true);
      }
    });
  }
});

describe('desenharTela — des-sincronização por semente (c)', () => {
  for (const modo of POR_SEMENTE) {
    it(`modo ${modo}: sementes 1 e 2 → sequências diferentes`, () => {
      const s1 = quadro(modo, 12345, 1, 48, 28);
      const s2 = quadro(modo, 12345, 2, 48, 28);
      expect(sequenciasIguais(s1, s2)).toBe(false);
    });
  }
});

describe('desenharTela — variação no tempo (d)', () => {
  for (const modo of MODOS) {
    it(`modo ${modo}: t=0 e t=2000 diferentes${modo === 'off' ? ' (off se mantém estático)' : ''}`, () => {
      const t0 = quadro(modo, 0, 3, 48, 28);
      const t2 = quadro(modo, 2000, 3, 48, 28);
      if (modo === 'off') {
        expect(sequenciasIguais(t0, t2)).toBe(true); // off é estático por construção
      } else {
        expect(sequenciasIguais(t0, t2)).toBe(false);
      }
    });
  }
});

describe('desenharTela — custo (e)', () => {
  it('14 modos × 100 chamadas em t=1,8e12 rodam em < 1 s', () => {
    const inicio = performance.now();
    for (const modo of MODOS) {
      for (let i = 0; i < 100; i++) quadro(modo, 1.8e12, i, 48, 28);
    }
    expect(performance.now() - inicio).toBeLessThan(1000);
  });
});
