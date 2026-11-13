// Planta das mesas de trabalho do andar 1 (fonte única de coordenadas: interior.ts desenha, predio.ts roteia).
// 8 fileiras de 6 lugares = 48, em 2 colunas de 4 linhas. Puro: dados estáticos, sem three nem relógio.
// As pessoas andam em linha reta (sem pathfinding): a rota da mesa usa os corredores abaixo, livres de móvel e pilar.

export interface PosFileira {
  x0: number; // x da primeira mesa da fileira
  z0: number; // z do eixo da fileira
  linha: number; // 0..3 (qual par de corredores a serve)
}

// Colunas em x0 −17,05 e −9,05: os pilares x −16 e −8 caem no vão entre duas cadeiras (folga 0,52 m).
const COLUNA_X0 = [-17.05, -9.05] as const;
// Linhas em z0 −7,3 + 6,0·n (passo 6,0 m; com 6,2 só cabem 42 lugares).
const LINHA_Z0 = [-7.3, -1.3, 4.7, 10.7] as const;

// Ordem de preenchimento: a coluna 0 primeiro; a linha 0 da coluna 1 (a mais perto do núcleo) por último.
export const FILEIRAS_POS: readonly PosFileira[] = [
  { x0: COLUNA_X0[0], z0: LINHA_Z0[0], linha: 0 },
  { x0: COLUNA_X0[0], z0: LINHA_Z0[1], linha: 1 },
  { x0: COLUNA_X0[0], z0: LINHA_Z0[2], linha: 2 },
  { x0: COLUNA_X0[0], z0: LINHA_Z0[3], linha: 3 },
  { x0: COLUNA_X0[1], z0: LINHA_Z0[1], linha: 1 },
  { x0: COLUNA_X0[1], z0: LINHA_Z0[2], linha: 2 },
  { x0: COLUNA_X0[1], z0: LINHA_Z0[3], linha: 3 },
  { x0: COLUNA_X0[1], z0: LINHA_Z0[0], linha: 0 },
];

export const MESAS_POR_LADO = 3; // 3 mesas de cada lado do eixo → 6 lugares
export const PASSO_MESA = 2.1; // distância em x entre mesas
export const ASSENTOS_FILEIRA = MESAS_POR_LADO * 2;

// Corredores em z: antes da linha 0, entre linhas, depois da linha 3 (7,1 e não 7,7: o pilar z 8 começa em 7,72).
export const CORREDORES_Z = [-9.5, -4.3, 1.7, 7.1, 13.2] as const;
// Corredor em x: a leste da coluna 1 (o tapete termina em −3,3); o eixo livre de entrada x −2…2 fica de fora.
export const CORREDOR_X = -2.6;
// Travessia leste–oeste do centro do andar, entre a bancada (z ≥ 3,6) e a mesa colaborativa: a mesma altura de `VIA`.
export const TRAVESSIA_Z = 3.2;
// Entrada da copa (z 9…15,5, a leste): o último corredor em z, longe do pilar (8; 8) e da bancada.
export const COPA_ENTRADA_Z = CORREDORES_Z[4];

/** Corredor (z) que serve o assento `i` da fileira: os 3 primeiros (lado −1) abrem para o norte, os outros para o sul. */
export function corredorDoAssento(linha: number, i: number): number {
  return CORREDORES_Z[i < MESAS_POR_LADO ? linha : linha + 1];
}
