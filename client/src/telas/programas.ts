// Programas da TV (`show` → futebol)
// e do fliperama (`game` → corrida/luta). Módulo puro: tempo (ms) e semente chegam
// por argumento; nenhum Math.random/Date.now. Todo retângulo é inteiro e recortado
// a [0,w]×[0,h]; periodicidade via `t % PERIODO` (O(1) e determinístico mesmo em
// t ~ 1,8e12). Zero alocação no caminho quente: só constantes de módulo.

import type { CtxMin } from './desenho';

// Lance do futebol: 7000 ms — a tela e a plateia leem a mesma função (exportado, §2.4).
export const LANCE_MS = 7000;
// A partir de 80% do lance o lado tem gol: borda pisca e faixa GOL.
export const GOL_A_PARTIR = 0.8;

// ---------------------------------------------------------------------------
// Puro: estado do lance — quem consome (desenho.ts, S9) decide o que fazer.

export interface LanceFutebol {
  lance: number;      // nº do lance atual (sobe a cada 7000 ms)
  progresso: number;  // 0→1 dentro do lance
  direita: boolean;   // lado do gol, por hash(seed, lance) — lance inteiro, lado inteiro
  gol: boolean;       // progresso >= GOL_A_PARTIR
}

// Hash FNV-ish de dois inteiros (mesma família do hash2 de desenho.ts, sem
// string/alocação): mesmo input, mesma saída.
function hash(a: number, b: number): number {
  let x = (0x811c9dc5 ^ a) | 0;
  x = Math.imul(x ^ b, 0x01000193);
  x = Math.imul(x ^ ((x >>> 13) | 0), 0x01000193);
  return (x ^ (x >>> 16)) >>> 0;
}

// Lance periódico de LANCE_MS: t% dá a fase; hash fecha o lado (o mesmo para a
// tela e a plateia — não é sorteio por quadro).
export function lanceFutebol(t: number, seed: number): LanceFutebol {
  const lance = Math.floor(t / LANCE_MS);
  const progresso = (t % LANCE_MS) / LANCE_MS;
  return {
    lance,
    progresso,
    direita: hash(seed, lance) % 2 === 1,
    gol: progresso >= GOL_A_PARTIR,
  };
}

// ---------------------------------------------------------------------------
// Helpers — recorte (mesma receita de desenho.ts) e fontes de glifos 3×5 em
// retângulos (números do placar e "KO/GOL"): zero string por quadro.

// Ajusta x/y/larg/alt para caber em [0,w]×[0,h] (inteiros) e desenha; pula se
// não sobra nada visível.
function clip(ctx: CtxMin, cor: string, x: number, y: number, larg: number, alt: number, w: number, h: number): void {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (xi < 0 && xi + larg <= 0) return;
  const wxi = Math.max(0, xi);
  const wyi = Math.max(0, yi);
  if (wxi >= w || wyi >= h) return;
  const wli = Math.floor(Math.min(larg, w - wxi));
  const hli = Math.floor(Math.min(alt, h - wyi));
  if (wli <= 0 || hli <= 0) return;
  ctx.fillStyle = cor;
  ctx.fillRect(wxi, wyi, wli, hli);
}

// Glifos em [coluna, linhas] pré-alocados (3×5): números 0-9 para o placar,
// depois K/O/G/L para "KO" e "GOL" (O reusa o 8 — anel fechado; L, haste + base).
const G0: Array<[number, number[]]> = [[1, [0, 1, 2, 3, 4]]];
const G1: Array<[number, number[]]> = [[2, [0, 1, 2, 3, 4]]];
const G2: Array<[number, number[]]> = [[1, [0, 4]], [2, [1, 2, 3]]];
const G3: Array<[number, number[]]> = [[1, [0, 4]], [2, [2]]];
const G4: Array<[number, number[]]> = [[0, [0, 1]], [2, [0, 1, 2, 3, 4]]];
const G5: Array<[number, number[]]> = [[0, [0]], [1, [1, 4]], [2, [0, 1, 2]]];
const G6: Array<[number, number[]]> = [[0, [1, 2, 3, 4]], [1, [0, 1, 2]], [2, [0]]];
const G7: Array<[number, number[]]> = [[1, [0]], [2, [0, 1, 2, 3, 4]]];
const G8: Array<[number, number[]]> = [[0, [0, 4]], [1, [0, 1, 2, 3, 4]], [2, [0, 4]]];
const G9: Array<[number, number[]]> = [[0, [0, 1, 2]], [1, [0]], [2, [0, 1, 2, 3, 4]]];
const NUM: Array<Array<[number, number[]]>> = [G0, G1, G2, G3, G4, G5, G6, G7, G8, G9];
const LEK: Array<[number, number[]]> = [[0, [0, 1, 2]], [1, [1]], [2, [0, 2]]];
const LEO: Array<[number, number[]]> = [[0, [0, 1, 2]], [1, [0, 2]]];
const LEG: Array<[number, number[]]> = [[0, [0, 1, 2, 3, 4]], [1, [0, 3, 4]], [2, [1]]];
const LEL: Array<[number, number[]]> = [[0, [0, 1, 2, 3, 4]], [1, [4]]];

// Desenha um glifo em (x0,y0) com célula de `e` px, coluna a coluna.
function letra(ctx: CtxMin, glifo: Array<[number, number[]]>, x0: number, y0: number, e: number, cor: string, w: number, h: number): void {
  for (const [col, linhas] of glifo) {
    for (const l of linhas) clip(ctx, cor, x0 + col * e, y0 + l * e, e, e, w, h);
  }
}

// ---------------------------------------------------------------------------
// Cores — constantes de módulo, sem string montada por quadro.

// futebol
const C_CAMP0 = '#3f9a4a';
const C_CAMP1 = '#48a855';
const C_LINHA = '#cfeccd';
const C_GOL = '#ffffff';
const C_TIME_A = '#e8454a';
const C_TIME_B = '#3d7ce0';
const C_BORDA = '#ffd84d'; // fase ligada do piscar do GOL
// corrida
const C_PISTA = '#6a7280';
const C_FAIXA = '#8891a0';
// luta
const C_PALCO = '#3b2a6b';
const C_BONECO = '#f1e9d2';
const C_VIDA = '#ffd84d';
const C_KO = '#ffffff';

// ---------------------------------------------------------------------------
// `show` — futebol: listras de 4 px, linha do meio/círculo, gols brancos nas
// pontas, 6 jogadores (3 `#e8454a` / 3 `#3d7ce0`) puxados pela bola até o lado
// do lance, placar no canto zerando a cada 4 lances; nos 20% finais do lance,
// borda amarela/branca piscando a 180 ms nas 4 bordas + letras GOL.
export function futebol(ctx: CtxMin, t: number, seed: number, w: number, h: number): void {
  const l = lanceFutebol(t, seed);
  // Gramado: listras verticais de 4 px (um retângulo por listra).
  for (let x = 0; x < w; x += 4) clip(ctx, (x / 4) % 2 === 0 ? C_CAMP0 : C_CAMP1, x, 0, 4, h, w, h);
  const campoY = 2;
  const campoAlt = Math.max(1, h - 4);
  const cx = Math.floor(w / 2);
  clip(ctx, C_LINHA, cx, campoY, 1, campoAlt, w, h); // linha do meio
  for (let dy = -1; dy <= 1; dy++) clip(ctx, C_LINHA, cx + dy, h / 2 + dy, 1, 1, w, h); // círculo
  // Gols brancos nas pontas (40% da altura do campo).
  const golLarg = Math.max(1, Math.floor(w * 0.03));
  const golAlt = Math.max(2, Math.floor(campoAlt * 0.4));
  const golY = campoY + Math.floor((campoAlt - golAlt) / 2);
  clip(ctx, C_GOL, 0, golY, golLarg, golAlt, w, h);
  clip(ctx, C_GOL, w - golLarg, golY, golLarg, golAlt, w, h);
  // Bola: sai do meio e chega ao gol no lado do lance em 80% (depois fica lá).
  const fr = Math.min(1, l.progresso / GOL_A_PARTIR);
  const fx = l.direita ? 1 : -1;
  const xObj = l.direita ? w - golLarg - 3 : golLarg + 3;
  const xB = Math.floor(cx + fx * Math.abs(xObj - cx) * fr);
  const yB = Math.floor(h / 2 + l.progresso * 3); // quique vertical determinístico
  clip(ctx, C_GOL, xB, yB, 2, 2, w, h);
  // 6 jogadores puxados pela bola: 3 correndo para o lado do lance, 3 atrás;
  // fileiras verticais fixas (frações da altura), x por `fr` — O(1).
  const fila = FILA;
  for (let i = 0; i < 6; i++) {
    const cor = i < 3 ? C_TIME_A : C_TIME_B;
    const dist = Math.floor(w * 0.3) + (i % 3) * 3;
    const xj = i < 3
      ? Math.floor(cx + fx * dist * fr)
      : Math.floor(cx - fx * dist * fr);
    clip(ctx, cor, xj, campoY + Math.floor(campoAlt * fila[i]), 2, 2, w, h);
  }
  // Placar no canto: zera a cada 4 lances — soma só os gols do ciclo atual
  // (gol à direita → azul, esquerdo → vermelho). No início do ciclo, vazio.
  const ciclo = Math.floor(l.lance / 4);
  let red = 0;
  let blu = 0;
  for (let i = 0; i < 4; i++) {
    const lante = 4 * ciclo + i;
    if (lante >= l.lance) continue; // só lances já jogados neste ciclo
    if (hash(seed, lante) % 2 === 1) blu++;
    else red++;
  }
  letra(ctx, NUM[red], 4, 1, 1, C_GOL, w, h); // dígito vermelho (canto)
  clip(ctx, C_GOL, 8, 2, 1, 1, w, h); // "ponto de dois"
  letra(ctx, NUM[blu], 10, 1, 1, C_GOL, w, h); // dígito azul
  // Nos 20% finais: borda 1 px nas 4 bordas (amarela #ffd84d / branca)
  // piscando a 180 ms + letras GOL no centro.
  if (l.gol) {
    const lig = Math.floor((t % 360) / 180); // 180 ms por fase
    const cor = lig === 0 ? C_BORDA : C_GOL;
    clip(ctx, cor, 0, 0, w, 1, w, h); // topo
    clip(ctx, cor, 0, h - 1, w, 1, w, h); // base
    clip(ctx, cor, 0, 0, 1, h, w, h); // esquerda
    clip(ctx, cor, w - 1, 0, 1, h, w, h); // direita
    const e = Math.max(2, Math.floor(h / 12));
    const y0 = Math.max(2, Math.floor(h / 2 - 1.5 * e));
    letra(ctx, LEG, cx - 4 * e, y0, e, C_BORDA, w, h); // G
    letra(ctx, LEO, cx - e, y0, e, C_BORDA, w, h); // O
    letra(ctx, LEL, cx + 2 * e, y0, e, C_BORDA, w, h); // L
  }
}

// Fileiras dos 6 jogadores (frações da altura do campo) — constante de módulo.
const FILA = [0.15, 0.35, 0.6, 0.25, 0.5, 0.7];

// ---------------------------------------------------------------------------
// `game` (fliperama semente par) — corrida: tela dividida ao meio, pista
// cinza única, faixas rolando 1 linha/130 ms e 2 carros (vermelho/azul)
// trocando de posição devagar por sin de 2300 ms (fase 180° entre eles).
export function corrida(ctx: CtxMin, t: number, seed: number, w: number, h: number): void {
  const meia = Math.max(1, Math.floor(w / 2));
  clip(ctx, C_PISTA, 0, 0, w, h, w, h); // pista (um retângulo, não pixel a pixel)
  clip(ctx, C_FAIXA, meia - 1, 0, 1, h, w, h); // divisor da tela dividida
  // Faixas: `n` linhas por metade; rolagem de 1 linha a cada 130 ms (t/130 % n
  // — O(1) e exato em t grande, sem `t % 910`).
  const n = Math.max(2, Math.floor(h / 6));
  const altura = Math.ceil(h / n);
  const passo = Math.floor(t / 130) % n;
  for (let k = 0; k < n; k++) {
    const y = ((k + passo) % n) * altura;
    clip(ctx, C_FAIXA, 3, y, 3, Math.min(2, altura), w, h);
    clip(ctx, C_FAIXA, meia + 3, y, 3, Math.min(2, altura), w, h);
  }
  // Carros 3×2: x centralizado em cada meia; y oscila sin(t/2300) com amplitude
  // ~20% da altura e fase 180° → os dois trocam de posição devagar. `t % 2300`
  // antes do sin mantém precisão (senão NaN em t ~ 1,8e12).
  const f = Math.floor((t % 2300) / 2300 * 100) / 100; // 0→1, 23 passos por período
  const amp = Math.max(1, Math.floor(h * 0.2));
  const cy = Math.floor(h / 2);
  const x1 = Math.max(1, Math.floor(meia / 2 - 1));
  const x2 = Math.max(meia + 1, Math.floor(meia + meia / 2 - 1));
  const y1 = Math.max(1, Math.min(h - 3, cy - Math.floor(amp * Math.sin(f * 6.28318530718))));
  const y2 = Math.max(1, Math.min(h - 3, cy + Math.floor(amp * Math.sin(f * 6.28318530718))));
  clip(ctx, C_TIME_A, x1, y1, 3, 2, w, h);
  clip(ctx, C_TIME_B, x2, y2, 3, 2, w, h);
}

// ---------------------------------------------------------------------------
// `game` (fliperama semente ímpar) — luta: palco roxo, 2 bonecos, barras de
// vida amarelas esvaziando no round de 9000 ms, flash de golpe a cada
// 300 ms (lado por hash, semente des-sincroniza) e "KO" nos 18% finais.
export function luta(ctx: CtxMin, t: number, seed: number, w: number, h: number): void {
  const f = Math.floor(t % 9000) / 9000; // progresso do round 0→1
  clip(ctx, C_PALCO, 0, 0, w, h, w, h);
  clip(ctx, C_LINHA, 1, h - 2, Math.max(1, w - 2), 1, w, h); // chão
  const bx = Math.max(3, Math.floor(w * 0.25));
  const by = Math.max(1, h - 6);
  const bx2 = Math.min(w - 5, Math.floor(w * 0.75));
  clip(ctx, C_BONECO, bx, by, 2, 4, w, h); // boneco 1
  clip(ctx, C_BONECO, bx2, by, 2, 4, w, h); // boneco 2
  // Barras de vida (amarelas) no topo: 70% da largura, esvaziando 100→0 no
  // round inteiro (esvaziou? não mostra nada — round volta do zero).
  const rest = Math.floor(Math.max(1, w - 4) * 0.7 * Math.max(0, 1 - f));
  const bx0 = Math.max(2, Math.floor(w * 0.15));
  const bx20 = Math.min(w - 3, Math.floor(w * 0.85));
  if (rest > 0) {
    clip(ctx, C_VIDA, bx0, 1, rest, 1, w, h);
    clip(ctx, C_VIDA, Math.max(bx0, bx20 - rest + 1), 1, rest, 1, w, h);
  }
  // Flash de golpe: 1 passo a cada 300 ms (paridade + hash da semente), perto
  // do boneco da frente (o round decide qual está à frente).
  const gs = Math.floor(t / 300);
  if (gs % 2 === 0 && hash(seed, gs) % 2 === 1) {
    const fx = f < 0.5 ? bx + 3 : Math.max(0, bx2 - 2);
    clip(ctx, C_BORDA, fx, Math.max(1, by), 1, 2, w, h);
  }
  // "KO" (tinta) nos 18% finais do round.
  if (f >= 0.82) {
    const e = Math.max(2, Math.floor(h / 12));
    const x0 = Math.floor(w / 2) - 3 * e;
    const y0 = Math.max(2, Math.floor(h / 2 - 1.5 * e));
    for (const [c, ls] of LEK) for (const li of ls) clip(ctx, C_KO, x0 + c * e, y0 + li * e, e, e, w, h);
    for (const [c, ls] of LEO) for (const li of ls) clip(ctx, C_KO, x0 + 4 * e + c * e, y0 + li * e, e, e, w, h);
  }
}
