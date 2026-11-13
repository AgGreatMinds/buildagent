import { describe, expect, it } from 'vitest';
import { RAIO_DESVIO, VEL_DESVIO, desvioLateral, direitaDe, type Andante } from './desvio';

const indo: Andante = { x: 0, z: 0, dx: 0, dz: -1 }; // anda para -Z
const vindo = (z: number, x = 0): Andante => ({ x, z, dx: 0, dz: 1 }); // vem de frente

describe('desvio de quem se cruza', () => {
  it('de frente e perto: os dois desviam, mais forte quanto mais perto', () => {
    const longe = desvioLateral(indo, vindo(-1.4));
    const perto = desvioLateral(indo, vindo(-0.5));
    expect(longe).toBeGreaterThan(0);
    expect(perto).toBeGreaterThan(longe);
    expect(perto).toBeLessThanOrEqual(VEL_DESVIO);
    expect(desvioLateral(vindo(-0.5), indo)).toBeCloseTo(perto); // simétrico
  });

  it('cada um vai para a própria direita, então os dois se afastam', () => {
    const a = direitaDe(indo.dx, indo.dz);
    const b = direitaDe(0, 1);
    expect(a).toEqual({ x: 1, z: 0 });
    expect(b.x).toBe(-1);
  });

  it('fora do raio, atrás ou no mesmo sentido não há desvio', () => {
    expect(desvioLateral(indo, vindo(-RAIO_DESVIO))).toBe(0);
    expect(desvioLateral(indo, vindo(1))).toBe(0); // já passou: está atrás
    expect(desvioLateral(indo, { x: 0, z: -0.6, dx: 0, dz: -1 })).toBe(0); // fila indiana
  });

  it('simulação: dois em linha reta, de frente, nunca ficam a menos de 0,5 m', () => {
    const a = { x: 0, z: 0 }, b = { x: 0, z: -6 };
    const dt = 1 / 30, vel = 1.3;
    let menor = Infinity;
    for (let i = 0; i < 200; i++) {
      // cada um mira o seu ponto final (a rota real também é uma reta até o próximo ponto)
      const da = Math.hypot(0 - a.x, -6 - a.z), db = Math.hypot(0 - b.x, 0 - b.z);
      if (da < 0.05 || db < 0.05) break;
      const A: Andante = { ...a, dx: (0 - a.x) / da, dz: (-6 - a.z) / da };
      const B: Andante = { ...b, dx: (0 - b.x) / db, dz: (0 - b.z) / db };
      const la = desvioLateral(A, B), lb = desvioLateral(B, A);
      const ra = direitaDe(A.dx, A.dz), rb = direitaDe(B.dx, B.dz);
      a.x += (A.dx * vel + ra.x * la) * dt; a.z += (A.dz * vel + ra.z * la) * dt;
      b.x += (B.dx * vel + rb.x * lb) * dt; b.z += (B.dz * vel + rb.z * lb) * dt;
      menor = Math.min(menor, Math.hypot(a.x - b.x, a.z - b.z));
    }
    expect(menor).toBeGreaterThan(0.5);
  });
});
