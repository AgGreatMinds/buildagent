// Layout da sala de descanso.
// Fonte única de coordenadas: props 3D (S8b) e destinos da vida social leem este arquivo.
// Puro: dados estáticos + `temporada(agora)` — sem relógio global, Math.random nem three.

// Faixa da sala (andar 1, leste): os itens SÓLIDOS caem aqui. z −2,7…2,9 é a borda;
// lugares do lounge ficam no espaço antigo (fora da cota, por definição da spec).
export const SALA = { x0: 9.6, x1: 23.9, z0: -2.7, z1: 2.9 } as const;

// Peças da sala (tabela 4.3): centro em metros + footprint em x×z.
// `decor: true` = não entra em teste de overlap nem na cota de limites (tapete no chão,
// planta na borda) — o solid footprint é o que o corpo não atravessa.
export interface ItemSala {
  id: string;
  x: number; // centro
  z: number; // centro
  largura: number; // footprint em x
  profundidade: number; // footprint em z
  decor?: boolean; // tapete/planta: não bloqueiam nem somem no teste de overlap
}

// Tabela 4.3, números como estão. Bebedouro (9,9; −1,9) fica de fora do v1.
export const ITENS: ItemSala[] = [
  { id: 'console-tv', x: 12.4, z: -1.95, largura: 2.2, profundidade: 0.5 },
  { id: 'sofa', x: 12.4, z: 2.3, largura: 3.0, profundidade: 1.0 },
  { id: 'poltrona', x: 15.0, z: 1.9, largura: 0.8, profundidade: 0.8 },
  { id: 'mesa', x: 12.4, z: 0.4, largura: 1.2, profundidade: 0.7 },
  { id: 'tapete', x: 12.4, z: 0.45, largura: 3.6, profundidade: 3.4, decor: true },
  { id: 'fliperama-a', x: 17.2, z: -1.9, largura: 0.8, profundidade: 0.9 },
  { id: 'fliperama-b', x: 18.3, z: -1.9, largura: 0.8, profundidade: 0.9 },
  { id: 'pingpong', x: 21.3, z: 0.9, largura: 2.74, profundidade: 1.525 },
  { id: 'estante', x: 23.6, z: -1.4, largura: 0.4, profundidade: 2.4 },
  { id: 'planta', x: 23.0, z: 2.7, largura: 0.7, profundidade: 0.7, decor: true },
];

// Lugares (4.3 + linha do lounge): onde o corpo para, em pé ou sentado.
// `olhar` = rotação Y de quem está no ponto, voltado para o alvo.
export interface Lugar {
  destino: 'tv' | 'fliperama' | 'pingpong' | 'estante' | 'lounge';
  x: number;
  z: number;
  olhar: number; // rad
  sentado: boolean;
}

// Poltrona: olhar = atan2(12,4−15,0; −1,95−1,9) ≈ −2,5 (tabela 4.3).
const OLHAR_POLTRONA = Math.atan2(12.4 - 15.0, -1.95 - 1.9);

// O lounge (espaço antigo, fora da cota da sala) tem os 9 lugares sentados da linha 268.
// 0..2 sofá fundo · 3..4 sofá esquerdo · 5..6 sofá direito · 7..8 poltronas
export const LUGARES: Lugar[] = [
  // tv — sofá 3,0 m + poltrona, todos de frente para a TV (olhar π = virado a −z... na prática
  // o corpo vira para o console, `olhar` é a rotação Y no ponto do lugar)
  { destino: 'tv', x: 11.5, z: 2.3, olhar: Math.PI, sentado: true },
  { destino: 'tv', x: 12.4, z: 2.3, olhar: Math.PI, sentado: true },
  { destino: 'tv', x: 13.3, z: 2.3, olhar: Math.PI, sentado: true },
  { destino: 'tv', x: 15.0, z: 1.9, olhar: OLHAR_POLTRONA, sentado: true },
  // fliperama — em pé diante de cada máquina
  { destino: 'fliperama', x: 17.2, z: -0.85, olhar: Math.PI, sentado: false },
  { destino: 'fliperama', x: 18.3, z: -0.85, olhar: Math.PI, sentado: false },
  // pingpong — um em cada mesa? Não: um por lado da mesa (oeste/leste)
  { destino: 'pingpong', x: 19.2, z: 0.9, olhar: Math.PI / 2, sentado: false },
  { destino: 'pingpong', x: 23.4, z: 0.9, olhar: -Math.PI / 2, sentado: false },
  // estante — em pé folheando, um por prateleira
  { destino: 'estante', x: 22.7, z: -1.9, olhar: Math.PI / 2, sentado: false },
  { destino: 'estante', x: 22.7, z: -0.9, olhar: Math.PI / 2, sentado: false },
  // lounge (espaço antigo) — 9 lugares sentados da linha 268 da spec
  { destino: 'lounge', x: 14.0, z: -12.4, olhar: 0, sentado: true },
  { destino: 'lounge', x: 15.0, z: -12.4, olhar: 0, sentado: true },
  { destino: 'lounge', x: 16.0, z: -12.4, olhar: 0, sentado: true },
  { destino: 'lounge', x: 11.4, z: -10.15, olhar: Math.PI / 2, sentado: true },
  { destino: 'lounge', x: 11.4, z: -9.05, olhar: Math.PI / 2, sentado: true },
  { destino: 'lounge', x: 18.6, z: -10.15, olhar: -Math.PI / 2, sentado: true },
  { destino: 'lounge', x: 18.6, z: -9.05, olhar: -Math.PI / 2, sentado: true },
  { destino: 'lounge', x: 13.4, z: -7.8, olhar: Math.PI, sentado: true },
  { destino: 'lounge', x: 16.6, z: -7.8, olhar: Math.PI, sentado: true },
];

export type Obstaculo =
  | { tipo: 'caixa'; x0: number; x1: number; z0: number; z1: number }
  | { tipo: 'circ'; x: number; z: number; raio: number };

// Obstáculos existentes da região (4.3) — nada da sala pode se sobrepor ou tocá-los.
// O pilar (16,0) já soma os 0,2 m de folga ao raio (0,28 → 0,48).
export const OBSTACULOS: Obstaculo[] = [
  { tipo: 'circ', x: 16, z: 0, raio: 0.48 }, // pilar com folga
  { tipo: 'circ', x: 8, z: 0, raio: 0.28 }, // pilar sem folga (fora da faixa da sala)
  { tipo: 'caixa', x0: 17.2, x1: 22.8, z0: -3.25, z1: -2.75 }, // floreiras, z −3
  { tipo: 'caixa', x0: 9.5, x1: 14.5, z0: 3.6, z1: 4.4 }, // bancada de pé
  { tipo: 'circ', x: 9.1, z: 4, raio: 0.35 }, // planta (valor de partida; z=4, fora da cota da sala)
  { tipo: 'circ', x: 14.9, z: 4, raio: 0.35 }, // planta (idem)
  { tipo: 'caixa', x0: 18.8, x1: 21.2, z0: 3.5, z1: 4.5 }, // mesa colaborativa
  { tipo: 'caixa', x0: 18.8, x1: 21.2, z0: 3.05, z1: 4.95 }, // banquetas ao redor
];

// Ponto de rota: toda ida/volta da sala de descanso passa por aqui (corredor entre
// bancada e mesa colaborativa). `{ x: 17, z: 3.2 }`.
export const VIA = { x: 17, z: 3.2 } as const;

// Sazonal (4.6): pelas datas da spec — Halloween 15/10…02/11, Natal 01/12…06/01.
// Pura: recebe `agora` (epoch ms) e devolve só a etiqueta. `new Date(agora)` é a única
// referência ao relógio, e é local (dia/mês) — determinística para o mesmo `agora`.
export type Temporada = 'halloween' | 'natal' | null;

export function temporada(agora: number): Temporada {
  const d = new Date(agora);
  const m = d.getMonth() + 1; // 1..12
  const dia = d.getDate(); // 1..31
  if ((m === 10 && dia >= 15) || (m === 11 && dia <= 2)) return 'halloween';
  if ((m === 12 && dia >= 1) || (m === 1 && dia <= 6)) return 'natal';
  return null;
}
