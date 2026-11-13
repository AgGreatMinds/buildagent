// Testes do layout da sala.
// Invariantes geométricas: footprint sólido não se sobrepõe, não toca obstáculo,
// cota da sala, lugares em pé livres, lugares sentados dentro do móvel, 9 de lounge,
// `temporada` nas datas da spec.

import { describe, expect, it } from 'vitest';
import { ITENS, LUGARES, OBSTACULOS, SALA, temporada } from './layout';
import type { ItemSala, Lugar, Obstaculo } from './layout';

// Só os footprint SÓLIDOS entram no teste (tapete/planta são decor: true).
const solidos = ITENS.filter((i: ItemSala) => !i.decor);

// Retângulos que se tocam/overlappam: distâncias entre limites <= 0 (folga zero conta).
function seTozam(a: ItemSala, b: ItemSala): boolean {
  const ax0 = a.x - a.largura / 2, ax1 = a.x + a.largura / 2;
  const bx0 = b.x - b.largura / 2, bx1 = b.x + b.largura / 2;
  const az0 = a.z - a.profundidade / 2, az1 = a.z + a.profundidade / 2;
  const bz0 = b.z - b.profundidade / 2, bz1 = b.z + b.profundidade / 2;
  return ax0 < bx1 && bx0 < ax1 && az0 < bz1 && bz0 < az1;
}

// Distância (0 se um contém o outro) entre retângulo e obstáculo, nos dois eixos.
function tocaObstaculo(i: ItemSala, o: Obstaculo): boolean {
  const ix0 = i.x - i.largura / 2, ix1 = i.x + i.largura / 2;
  const iz0 = i.z - i.profundidade / 2, iz1 = i.z + i.profundidade / 2;
  if (o.tipo === 'caixa') {
    // sobreposição inclusive no toque (folga = 0 já conta como tocar)
    return ix0 <= o.x1 && o.x0 <= ix1 && iz0 <= o.z1 && o.z0 <= iz1;
  }
  // círculo × retângulo: menor distância do centro ao retângulo
  const dx = Math.max(o.x - ix1, 0, ix0 - o.x);
  const dz = Math.max(o.z - iz1, 0, iz0 - o.z);
  return dx * dx + dz * dz <= o.raio * o.raio;
}

// Lugar (ponto) dentro do footprint do seu móvel.
function pontoNoItem(x: number, z: number, i: ItemSala): boolean {
  return Math.abs(x - i.x) <= i.largura / 2 + 1e-9 && Math.abs(z - i.z) <= i.profundidade / 2 + 1e-9;
}

describe('layout: footprint sólidos', () => {
  it('nenhum footprint sólido se sobrepõe a outro', () => {
    for (let a = 0; a < solidos.length; a++) {
      for (let b = a + 1; b < solidos.length; b++) {
        expect(seTozam(solidos[a], solidos[b])).toBe(false);
      }
    }
  });

  it('nenhum footprint sólido toca obstáculo', () => {
    for (const i of solidos) {
      for (const o of OBSTACULOS) {
        expect(tocaObstaculo(i, o), `${i.id} × ${JSON.stringify(o)}`).toBe(false);
      }
    }
  });
});

describe('layout: cota da sala', () => {
  // A cota 9,6…23,9 × −2,7…2,9 vale para os footprint SÓLIDOS — decor (tapete/planta)
  // fica de fora da cota, como do overlap (planta em (23; 2,7) estoura 2,9 de propósito).
  it('footprints sólidos dentro de x 9,6…23,9 / z −2,7…2,9', () => {
    for (const i of solidos) {
      expect(i.x - i.largura / 2, `${i.id} x0`).toBeGreaterThanOrEqual(SALA.x0);
      expect(i.x + i.largura / 2, `${i.id} x1`).toBeLessThanOrEqual(SALA.x1);
      expect(i.z - i.profundidade / 2, `${i.id} z0`).toBeGreaterThanOrEqual(SALA.z0);
      expect(i.z + i.profundidade / 2, `${i.id} z1`).toBeLessThanOrEqual(SALA.z1);
    }
  });
});

describe('layout: lugares', () => {
  it('9 lugares de lounge', () => {
    expect(LUGARES.filter((l: Lugar) => l.destino === 'lounge')).toHaveLength(9);
  });

  it('lugares em pé (fliperama, pingpong, estante) fora de qualquer footprint sólido', () => {
    for (const l of LUGARES) {
      if (l.sentado) continue;
      for (const i of solidos) {
        expect(pontoNoItem(l.x, l.z, i), `${l.destino} (${l.x},${l.z}) em ${i.id}`).toBe(false);
      }
    }
  });

  it('lugares sentados da sala dentro do footprint do seu móvel', () => {
    // tv → sofá (0..2) ou poltrona (3) · lounge → espaço antigo (fora da cota; sem item lá)
    for (const l of LUGARES) {
      if (!l.sentado || l.destino === 'lounge') continue;
      const dentro = solidos.some((i: ItemSala) =>
        (i.id === 'sofa' || i.id === 'poltrona') && pontoNoItem(l.x, l.z, i),
      );
      expect(dentro, `${l.destino} (${l.x},${l.z})`).toBe(true);
    }
  });
});

describe('layout: temporada', () => {
  const em = (ano: number, mes: number, dia: number) => new Date(ano, mes - 1, dia).getTime();

  it('datas da spec', () => {
    expect(temporada(em(2026, 10, 31))).toBe('halloween');
    expect(temporada(em(2026, 11, 2))).toBe('halloween');
    expect(temporada(em(2026, 11, 3))).toBe(null);
    expect(temporada(em(2026, 12, 1))).toBe('natal');
    expect(temporada(em(2026, 1, 6))).toBe('natal');
    expect(temporada(em(2026, 1, 7))).toBe(null);
    expect(temporada(em(2026, 6, 15))).toBe(null);
  });
});
