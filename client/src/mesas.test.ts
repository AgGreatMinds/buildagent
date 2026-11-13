import { describe, expect, it } from 'vitest';
import { ASSENTOS_FILEIRA, CORREDORES_Z, CORREDOR_X, FILEIRAS_POS, MESAS_POR_LADO, PASSO_MESA, TRAVESSIA_Z, corredorDoAssento } from './mesas';

const PILARES = [-16, -8, 8, 16].flatMap((x) => [0, 8].map((z) => ({ x, z })));
const RAIO_PILAR = 0.28;

// Cadeiras como montarFileira as põe: x0 + i·passo, z0 + lado·(0,5 + 0,95).
const cadeiras = FILEIRAS_POS.flatMap((f) =>
  [-1, 1].flatMap((lado) => Array.from({ length: MESAS_POR_LADO }, (_, i) => ({ x: f.x0 + i * PASSO_MESA, z: f.z0 + lado * 1.45, linha: f.linha, indice: (lado < 0 ? 0 : MESAS_POR_LADO) + i }))),
);
// Tapete (a maior peça da fileira): largura n·2,1 + 1,0 centrada em x0 + (n−1)·1,05, profundidade 3,6.
const tapete = (f: (typeof FILEIRAS_POS)[number]) => ({ x0: f.x0 + (MESAS_POR_LADO - 1) * 1.05 - (MESAS_POR_LADO * PASSO_MESA + 1) / 2, x1: f.x0 + (MESAS_POR_LADO - 1) * 1.05 + (MESAS_POR_LADO * PASSO_MESA + 1) / 2, z0: f.z0 - 1.8, z1: f.z0 + 1.8 });

describe('planta das mesas', () => {
  it('48 lugares em 8 fileiras', () => {
    expect(FILEIRAS_POS).toHaveLength(8);
    expect(FILEIRAS_POS.length * ASSENTOS_FILEIRA).toBe(48);
  });

  it('tapetes não se sobrepõem e a coluna 1 termina antes do corredor leste', () => {
    const t = FILEIRAS_POS.map(tapete);
    for (let a = 0; a < t.length; a++) {
      for (let b = a + 1; b < t.length; b++) {
        const sobrepoe = t[a].x0 < t[b].x1 && t[b].x0 < t[a].x1 && t[a].z0 < t[b].z1 && t[b].z0 < t[a].z1;
        expect(sobrepoe, `fileiras ${a} e ${b}`).toBe(false);
      }
    }
    for (const r of t) expect(r.x1).toBeLessThan(CORREDOR_X);
  });

  it('nenhuma cadeira toca um pilar (raio + 0,25 m de folga)', () => {
    for (const c of cadeiras) for (const p of PILARES) expect(Math.hypot(c.x - p.x, c.z - p.z), `cadeira ${c.x};${c.z}`).toBeGreaterThan(RAIO_PILAR + 0.25);
  });

  it('corredores em z: livres de pilar e de cadeira (≥ 0,7 m), em ordem crescente', () => {
    for (const zc of CORREDORES_Z) {
      for (const p of PILARES) expect(Math.abs(zc - p.z)).toBeGreaterThan(RAIO_PILAR + 0.25);
      for (const c of cadeiras) expect(Math.abs(zc - c.z), `corredor ${zc} × cadeira ${c.x};${c.z}`).toBeGreaterThanOrEqual(0.7);
    }
    expect([...CORREDORES_Z]).toEqual([...CORREDORES_Z].sort((a, b) => a - b));
  });

  it('cada cadeira abre para o corredor ao lado dela (norte nos 3 primeiros, sul nos outros)', () => {
    for (const c of cadeiras) {
      const zc = corredorDoAssento(c.linha, c.indice);
      expect(Math.abs(zc - c.z)).toBeLessThan(3); // adjacente: nunca o corredor da outra ponta da fileira
      expect(c.indice < MESAS_POR_LADO ? zc < c.z : zc > c.z).toBe(true);
    }
  });

  it('travessia leste–oeste passa entre a bancada (z ≥ 3,6) e as mesas; corredor x livre de fileira', () => {
    expect(TRAVESSIA_Z).toBeLessThan(3.6 - 0.25);
    expect(CORREDOR_X).toBeGreaterThan(-3.3);
    expect(CORREDOR_X).toBeLessThan(-2);
  });
});
