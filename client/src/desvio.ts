// Desvio de quem se cruza, puro (sem Three.js) para ser testado sozinho.
// As rotas são linhas retas entre pontos fixos: sem isto, duas pessoas em sentidos opostos no mesmo
// corredor se atravessavam. Aqui cada uma dá um passo para a própria direita enquanto a outra está perto
// e à frente; depois de cruzar, cada uma volta a andar reto para o seu ponto.

export const RAIO_DESVIO = 1.6; // m: distância em que o desvio começa
export const VEL_DESVIO = 1.4; // m/s de lado no ponto mais próximo (cai a zero em RAIO_DESVIO)

export interface Andante {
  x: number;
  z: number;
  dx: number; // sentido da caminhada no chão, unitário
  dz: number;
}

/**
 * Velocidade lateral (m/s, para a direita de `a`) por causa de `b`. Zero quando `b` está longe, atrás,
 * ou andando no mesmo sentido (fila indiana não desvia: os dois seguem um atrás do outro).
 */
export function desvioLateral(a: Andante, b: Andante): number {
  const rx = b.x - a.x, rz = b.z - a.z;
  const dist = Math.hypot(rx, rz);
  if (!(dist < RAIO_DESVIO)) return 0;
  if (a.dx * b.dx + a.dz * b.dz > 0.2) return 0; // mesmo sentido
  if (dist > 1e-6 && (a.dx * rx + a.dz * rz) / dist < 0.2) return 0; // `b` não está à frente
  return VEL_DESVIO * (1 - dist / RAIO_DESVIO);
}

/** Direita de quem anda no sentido (dx, dz), com Y para cima: de frente para -Z, a direita é +X. */
export function direitaDe(dx: number, dz: number): { x: number; z: number } {
  return { x: -dz, z: dx };
}
