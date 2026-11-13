// Desenho abstrato dos 14 modos de monitor.
// Módulo puro: sem three.js, sem Math.random/Date.now — o tempo (ms) e a semente chegam
// sempre por argumento. Toda animação é O(1) em `t` via `Math.floor(t / PERIODO + fase)`,
// e cada animado soma `(semente % N)` ao passo (des-sincronização, §2.3).
// Orçamento por quadro (§2.5): só fillRect com inteiros, ≤ 200 retângulos, zero alocação
// (constantes de módulo; nenhum `new`, template string ou array novo no caminho quente).

import type { ModoTela } from './modo';
import { corrida, futebol, luta } from './programas';

// Contexto mínimo da textura: só o que os desenhos usam.
export interface CtxMin {
  fillStyle: CanvasRenderingContext2D['fillStyle'];
  fillRect(x: number, y: number, w: number, h: number): void;
}

// Ponto de entrada determinístico: mesmo (modo, t, seed, w, h) → mesmo quadro.
// O switch é exaustivo sobre os 14 modos de `modo.ts`; o `never` no default quebra o
// typecheck se um modo for adicionado sem desenho.
export function desenharTela(ctx: CtxMin, modo: ModoTela, t: number, seed: number, w: number, h: number): void {
  switch (modo) {
    case 'off': desenharOff(ctx, w, h); return;
    case 'standby': desenharStandby(ctx, t, seed, w, h); return;
    case 'idle': desenharIdle(ctx, t, seed, w, h); return;
    case 'code': desenharCode(ctx, t, seed, w, h); return;
    case 'terminal': desenharTerminal(ctx, t, seed, w, h); return;
    case 'browser': desenharBrowser(ctx, t, seed, w, h); return;
    case 'search': desenharSearch(ctx, t, seed, w, h); return;
    case 'chat': desenharChat(ctx, t, seed, w, h); return;
    case 'docs': desenharDocs(ctx, t, seed, w, h); return;
    case 'tasks': desenharTasks(ctx, t, seed, w, h); return;
    case 'alert': desenharAlert(ctx, t, w, h); return;
    case 'progress': desenharProgress(ctx, t, seed, w, h); return;
    // `show` exibe o futebol; `game` alterna
    // os fliperamas — semente par = corrida, ímpar = luta (novela/desenho fora do v1).
    case 'show':
      futebol(ctx, t, seed, w, h);
      return;
    case 'game':
      if (seed % 2 === 0) corrida(ctx, t, seed, w, h);
      else luta(ctx, t, seed, w, h);
      return;
    default: {
      const nunca: never = modo; // exaustividade: modo novo sem caso é erro de tipo
      throw new Error('modo desconhecido: ' + String(nunca));
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers — recorte por chamada e hash sem alocação (regra §2.4: tudo recortado
// a [0,w]×[0,h]; a armadilha do recorte em variável de módulo não se repete, §1.1).

// Ajusta x/y/lw/lh para caber em [0,w]×[0,h] (inteiros) e desenha; pula se não sobra nada.
function clip(ctx: CtxMin, cor: string, x: number, y: number, lw: number, lh: number, w: number, h: number): void {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (xi < 0 && xi + lw <= 0) return; // inteiramente à esquerda (só pode por x<0)
  const wxi = Math.max(0, xi);
  const wyi = Math.max(0, yi);
  if (wxi >= w || wyi >= h) return;
  const wli = Math.floor(Math.min(lw, w - wxi));
  const hli = Math.floor(Math.min(lh, h - wyi));
  if (wli <= 0 || hli <= 0) return;
  ctx.fillStyle = cor;
  ctx.fillRect(wxi, wyi, wli, hli);
}

// Faixa de largura total (um retângulo por bloco, nunca linha por pixel no fundo).
function faixa(ctx: CtxMin, cor: string, w: number, h: number, y: number, lh: number): void {
  clip(ctx, cor, 0, y, w, lh, w, h);
}

// Hash determinístico de dois inteiros (FNV-ish, sem string): mesmo input, mesma saída,
// e zero alocação — alimenta larguras/cor de fichas e parágrafos sem Math.random.
function hash2(a: number, b: number): number {
  let x = (0x811c9dc5 ^ a) | 0;
  x = Math.imul(x ^ b, 0x01000193);
  x = Math.imul(x ^ ((x >>> 13) | 0), 0x01000193);
  return (x ^ (x >>> 16)) >>> 0;
}

// ---------------------------------------------------------------------------
// Cores — constantes de módulo; nenhuma string montada por quadro.

// off
const C_OFF = '#22324f';
const C_OFF_TOPO = '#2a3d5f';
const C_OFF_REF_L = '#2f4569'; // reflexo diagonal, traço largo
const C_OFF_REF_F = '#283c5d'; // reflexo diagonal, traço fino
// standby — 4 faixas azuis de fundo
const C_SB = ['#2d63ad', '#285a9f', '#235192', '#1f4884'];
const C_LOSANGO = ['#9fcaf5', '#b7d8f8', '#d3e8fb', '#b7d8f8']; // tons do losango (700 ms)
const C_SB_BARRA = '#4f86c9';
// idle — degradê em 8 faixas (#1b2a4a → #2c1f4a)
const C_IDLE_BG = ['#1b2a4a', '#1d284a', '#1f274a', '#21254a', '#23234a', '#25224a', '#27204a', '#291f4a'];
const C_IDLE_COR = ['#7fd0ff', '#ff9ad5', '#9be59b', '#ffd36b']; // quique muda a cada 900 ms
// code
const C_CODE_BG = '#1d2130';
const C_CODE_CALHA = '#252a3c';
const C_CODE_NUM = '#4a5170';
const C_CODE_CORES = ['#ff79c6', '#8be9fd', '#f1fa8c', '#50fa7b', '#bd93f9', '#ffb86c', '#f8f8f2'];
const C_CODE_CURSOR = '#f8f8f2';
// terminal
const C_TERM_BG = '#0c120f';
const C_TERM_PROMPT = '#5cff7a';
const C_TERM_TEXTO = '#3fae5c';
const C_TERM_ATUAL = '#8ef0a0';
const C_TERM_CURSOR = '#d6ffe0';
// browser
const C_BROWSER_BG = '#f3f5f8';
const C_BROWSER_BARRA = '#d5dbe4';
const C_BROWSER_DOTES = ['#ff6b6b', '#f7c948', '#4cae6a'];
const C_BROWSER_CAMPO = '#ffffff';
const C_BROWSER_DESTAQUE = ['#5b8fe0', '#4cae6a', '#e2604f', '#8d66cf'];
const C_BROWSER_PAR1 = '#9aa5b5';
const C_BROWSER_PAR2 = '#c8cfd9';
const C_BROWSER_IMG = '#a8c3ea'; // "imagem" 2 px, na cor de destaque clara
// search
const C_SEARCH_BG = '#ffffff';
const C_SEARCH_BARRA = '#e3e8ef';
const C_SEARCH_LUPA = '#3f7fd8';
const C_SEARCH_TITULO = '#3f7fd8';
const C_SEARCH_LINHA = '#b6bfcc';
const C_SEARCH_SEL = '#eef4ff';
// chat
const C_CHAT_BG = '#eef1f6';
const C_CHAT_MINHA = '#5b8fe0';
const C_CHAT_OUTRA = '#d6dce6';
const C_CHAT_DOTO = '#9aa5b5';
const C_CHAT_DOTO_S = '#d6dce6'; // "escondido" (mesmo tom do fundo da bolha)
// docs
const C_DOCS_BG = '#e9edf2';
const C_DOCS_PAG = '#ffffff';
const C_DOCS_TITULO = '#2b2f3b';
const C_DOCS_LINHA = '#b9c1cd';
const C_DOCS_LINHA2 = '#7d8796';
// tasks
const C_TASKS_BG = '#fffaf0';
const C_TASKS_CAIXA = '#3fae5c';
const C_TASKS_CAIXA_V = '#a8d8b3';
const C_TASKS_FEITO = '#3fae5c';
const C_TASKS_PEND = '#a8d8b3';
// alert
const C_ALERT_ON = '#f2b33d'; // âmbar (piscando)
const C_ALERT_OFF = '#8a5a12'; // tom escuro (fase apagada)
const C_ALERT_TINTA_ON = '#2b1a05'; // "!" com tinta invertida sobre o âmbar
const C_ALERT_TINTA_OFF = '#f2b33d'; // "!" âmbar sobre o escuro
// progress
const C_PROG_BG = '#0b1210';
const C_PROG_PROMPT = '#5cff7a';
const C_PROG_TEXTO = '#3c8f57';
const C_PROG_COLCHETE = '#7d8ea0';
const C_PROG_TRILHO = '#163322';
const C_PROG_PREENCH = '#3ccf63';
const C_PROG_TOPO = '#7cf09a';
const C_PROG_PONTA = '#d8ffe2';
const C_PROG_SPINNER = ['#9ff3ff', '#4fb8d6', '#2b6f86', '#173a45']; // rastro do spinner
const C_PROG_CURSOR = '#d6ffe0';
const C_PROG_PONTOS = '#7d8ea0'; // "..."
// Percurso do spinner: 8 posições no anel do 3×3 (dx, dy relativos ao canto).
const SPX = [0, 1, 2, 2, 2, 1, 0, 0];
const SPY = [0, 0, 0, 1, 2, 2, 2, 1];

// ---------------------------------------------------------------------------
// Desenhistas — um por modo; todos O(1) em `t` e sem alocação.

// `off`: tela desligada — estática, desenhada 1× (não recebe `t`).
function desenharOff(ctx: CtxMin, w: number, h: number): void {
  faixa(ctx, C_OFF, w, h, 0, h);
  faixa(ctx, C_OFF_TOPO, w, h, 0, 1);
  // Reflexo diagonal: traço largo (2 px) e fino (1 px) seguindo a mesma diagonal.
  for (let i = 0; i < 6; i++) {
    clip(ctx, C_OFF_REF_L, Math.floor(w * 0.3) + i * 2, Math.floor(h * 0.45) + i * 2, 2, 2, w, h);
    clip(ctx, C_OFF_REF_F, Math.floor(w * 0.15) + i * 2, Math.floor(h * 0.3) + i * 2, 1, 1, w, h);
  }
}

// `standby`: mesa acesa sem trabalho — 4 faixas azuis, losango de 5 px pulsando em
// 4 tons a cada 700 ms (+ seed%3 no passo), barrinha 5×1 abaixo.
function desenharStandby(ctx: CtxMin, t: number, seed: number, w: number, h: number): void {
  const quarto = Math.ceil(h / 4);
  for (let i = 0; i < 4; i++) {
    faixa(ctx, C_SB[i], w, h, i * quarto, i === 3 ? h - i * quarto : quarto);
  }
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const passo = Math.floor(t / 700 + (seed % 3));
  const cor = C_LOSANGO[passo % 4];
  // Losango 5 px em fileiras 1·3·5·3·1, centralizado.
  clip(ctx, cor, cx, cy - 2, 1, 1, w, h);
  clip(ctx, cor, cx - 1, cy - 1, 3, 1, w, h);
  clip(ctx, cor, cx - 2, cy, 5, 1, w, h);
  clip(ctx, cor, cx - 1, cy + 1, 3, 1, w, h);
  clip(ctx, cor, cx, cy + 2, 1, 1, w, h);
  // Barrinha 5×1 sob o losango.
  clip(ctx, C_SB_BARRA, cx - 2, cy + 4, 5, 1, w, h);
}

// `idle`: descanso de tela — degradê em 8 faixas; quadrado 3×3 quicando nas bordas
// (x: 1 px/140 ms, y: 1 px/190 ms; fase seed%17 e seed%11; cor muda a cada 900 ms).
function desenharIdle(ctx: CtxMin, t: number, seed: number, w: number, h: number): void {
  const faixaH = Math.ceil(h / 8);
  for (let i = 0; i < 8; i++) {
    faixa(ctx, C_IDLE_BG[i], w, h, i * faixaH, i === 7 ? h - i * faixaH : faixaH);
  }
  const sx = Math.floor(t / 140 + (seed % 17));
  const sy = Math.floor(t / 190 + (seed % 11));
  const perX = Math.max(1, w - 3);
  const perY = Math.max(1, h - 3);
  // Onda triangular: o quadrado vai e volta nas bordas sem laço que cresça com `t`.
  const tx = sx % (perX * 2);
  const ty = sy % (perY * 2);
  const x = tx < perX ? tx : perX * 2 - tx;
  const y = ty < perY ? ty : perY * 2 - ty;
  clip(ctx, C_IDLE_COR[Math.floor(t / 900) % 4], x, y, 3, 3, w, h);
}

// `code`: editor — fundo escuro, calha de 3 px com tracinhos de nº de linha, 1 linha a
// cada 2 px; 1-3 fichas por linha (largura 2-9 px, recuo 0-3), 1 em 7 linhas vazia;
// rolagem de 1 linha/420 ms (+ seed%50); cursor `#f8f8f2` piscando a 500 ms na última.
function desenharCode(ctx: CtxMin, t: number, seed: number, w: number, h: number): void {
  faixa(ctx, C_CODE_BG, w, h, 0, h);
  faixa(ctx, C_CODE_CALHA, w, h, 0, 3);
  const vis = Math.min(9, Math.floor(h / 2));
  const linha0 = Math.floor(t / 420 + (seed % 50));
  for (let k = 0; k < vis; k++) {
    const y = 1 + k * 2;
    const idx = linha0 + k;
    clip(ctx, C_CODE_NUM, 0, y + 1, 2, 1, w, h); // tracinho do nº de linha na calha
    if (idx % 7 === 0) continue; // 1 em 7 linhas fica em branco
    const hf = hash2(seed, idx);
    const nFichas = 1 + (hf % 3); // 1 a 3 fichas por linha
    for (let j = 0; j < nFichas; j++) {
      const hj = hash2(hf, j);
      const recuo = 3 + (hj % 4); // depois da calha, recuo 0-3 px
      const larg = 2 + (hj >>> 8) % 8; // largura 2-9 px
      clip(ctx, C_CODE_CORES[hj % 7], recuo, y, larg, 1, w, h);
    }
  }
  if (Math.floor(t / 500 + (seed % 2)) % 2 === 0) {
    clip(ctx, C_CODE_CURSOR, 3, 1 + (vis - 1) * 2, 1, 2, w, h); // cursor na última linha
  }
}

// `terminal`: linhas prontas (`>` + texto) e a linha atual "digitando" 1 px/260 ms.
// Janela fixa: (w−4) passos por linha + 3 da digitação → a linha atual sai em O(1).
function desenharTerminal(ctx: CtxMin, t: number, seed: number, w: number, h: number): void {
  faixa(ctx, C_TERM_BG, w, h, 0, h);
  const porJanela = w - 4 + 3;
  const s = Math.floor(t / 260 + (seed % 40));
  const vis = Math.min(9, Math.floor(h / 2));
  for (let k = 0; k < vis; k++) {
    const sk = s - (vis - 1 - k);
    if (sk < 0) break; // antes do primeiro passo a tela está só de fundo
    const y = 1 + k * 2;
    const idx = sk % porJanela;
    clip(ctx, C_TERM_PROMPT, 1, y, 1, 1, w, h); // `>`
    if (idx < w - 4) {
      const hf = hash2(seed, idx); // linha terminada: barra de texto com largura por hash
      clip(ctx, C_TERM_TEXTO, 3, y, 2 + (hf % Math.max(1, w - 6)), 1, w, h);
    } else {
      const crescido = idx - (w - 4); // linha atual: cresce 0,1,2 px nos 3 passos
      if (crescido > 0) clip(ctx, C_TERM_ATUAL, 3, y, crescido, 1, w, h);
    }
  }
  if (Math.floor(t / 450 + (seed % 2)) % 2 === 0) {
    clip(ctx, C_TERM_CURSOR, 6, 1 + (vis - 1) * 2, 1, 1, w, h); // cursor piscando
  }
}

// `browser`: barra com 3 bolinhas + campo, página rolando 1 px/900 ms (+ seed%9);
// título na cor de destaque (seed%4), parágrafos cinzas, "imagem" de 2 px.
function desenharBrowser(ctx: CtxMin, t: number, seed: number, w: number, h: number): void {
  const d = C_BROWSER_DESTAQUE[seed % 4];
  faixa(ctx, C_BROWSER_BG, w, h, 0, h);
  faixa(ctx, C_BROWSER_BARRA, w, h, 0, 3);
  for (let i = 0; i < 3; i++) clip(ctx, C_BROWSER_DOTES[i], 1 + i * 2, 1, 1, 1, w, h);
  clip(ctx, C_BROWSER_CAMPO, 8, 1, Math.max(1, w - 10), 1, w, h);
  const rola = Math.floor(t / 900 + (seed % 9));
  for (let k = 0; k < 8; k++) {
    const y = 5 + k * 4 - rola;
    const hf = hash2(seed, k);
    if (k === 0) {
      clip(ctx, d, 2, y, Math.floor(w / 2), 1, w, h); // título, na cor de destaque
    } else if (k % 3 === 0) {
      clip(ctx, C_BROWSER_IMG, 2, y, 3, 2, w, h); // "imagem" de 2 px
      clip(ctx, C_BROWSER_PAR2, 7, y, Math.max(1, (w - 9) * 0.6), 1, w, h);
    } else {
      const cor = k % 2 === 1 ? C_BROWSER_PAR1 : C_BROWSER_PAR2;
      clip(ctx, cor, 2, y, 2 + (hf % Math.max(1, w - 5)), 1, w, h);
    }
  }
}

// `search`: barra com lupa e 3 resultados; o selecionado (fundo azul-claro) troca a cada
// 700 ms (+ seed%5).
function desenharSearch(ctx: CtxMin, t: number, seed: number, w: number, h: number): void {
  faixa(ctx, C_SEARCH_BG, w, h, 0, h);
  faixa(ctx, C_SEARCH_BARRA, w, h, 0, 3);
  clip(ctx, C_SEARCH_LUPA, 1, 0, 2, 2, w, h);
  clip(ctx, C_SEARCH_LUPA, 2, 2, 1, 1, w, h);
  const sel = Math.floor(t / 700 + (seed % 5)) % 3;
  for (let k = 0; k < 3; k++) {
    const y = 5 + k * 4;
    if (k === sel) faixa(ctx, C_SEARCH_SEL, w, h, y - 1, 5); // fundo do selecionado
    const hf = hash2(seed, k + 40);
    clip(ctx, C_SEARCH_TITULO, 2, y, 3 + (hf % Math.max(1, Math.floor(w * 0.6))), 1, w, h);
    clip(ctx, C_SEARCH_LINHA, 2, y + 2, 2 + (hf % Math.max(1, Math.floor(w * 0.4))), 1, w, h);
  }
}

// `chat`: bolhas de 2 px — minhas à direita, as outras à esquerda, largura por hash;
// bolha nova a cada 1100 ms (+ seed%13, sobem na tela) e 3 pontos "digitando" a cada 250 ms.
function desenharChat(ctx: CtxMin, t: number, seed: number, w: number, h: number): void {
  faixa(ctx, C_CHAT_BG, w, h, 0, h);
  const d0 = Math.floor(t / 250);
  for (let i = 0; i < 3; i++) {
    clip(ctx, (d0 + i) % 3 === 0 ? C_CHAT_DOTO : C_CHAT_DOTO_S, 2 + i * 2, 1, 1, 1, w, h);
  }
  const vis = Math.min(8, Math.floor((h - 3) / 3));
  const passo = Math.floor(t / 1100 + (seed % 13));
  for (let k = 0; k < vis; k++) {
    const b = passo - (vis - 1 - k);
    if (b < 0) break;
    const y = 4 + k * 3;
    const larg = 3 + (hash2(seed, b) % 9);
    if (b % 2 === 0) {
      clip(ctx, C_CHAT_OUTRA, 2, y, Math.min(larg, w - 4), 2, w, h);
    } else {
      clip(ctx, C_CHAT_MINHA, Math.max(2, w - 2 - larg), y, larg, 2, w, h);
    }
  }
}

// `docs`: página clara com margem de 1 px; título escuro (50% da largura), linhas cinzas
// de largura por hash, 1 linha em 4 vazia (quebra de parágrafo); rola 1 linha/1500 ms
// (+ seed%7).
function desenharDocs(ctx: CtxMin, t: number, seed: number, w: number, h: number): void {
  faixa(ctx, C_DOCS_BG, w, h, 0, h);
  faixa(ctx, C_DOCS_PAG, w, h, 1, h - 2);
  const vis = Math.min(10, Math.floor((h - 3) / 2));
  const linha0 = Math.floor(t / 1500 + (seed % 7));
  for (let k = 0; k < vis; k++) {
    const idx = linha0 + k;
    const y = 2 + k * 2;
    if (idx % 4 === 3) continue; // 1 linha em 4 vazia (fim de parágrafo)
    const hf = hash2(seed, idx);
    if (idx % 4 === 0) {
      clip(ctx, C_DOCS_TITULO, 2, y, Math.floor(w / 2), 1, w, h); // título: 50% da largura
    } else {
      const cor = hf % 2 === 0 ? C_DOCS_LINHA : C_DOCS_LINHA2;
      clip(ctx, cor, 2, y, 2 + (hf % Math.max(1, Math.floor(w * 0.8))), 1, w, h);
    }
  }
}

// `tasks`: checklist — caixa de 1 px + barra por item; os itens ficam verdes um a um
// (1 item/900 ms, + seed%6) e, ao fechar todos, reinicia depois de 2 passos de pausa.
function desenharTasks(ctx: CtxMin, t: number, seed: number, w: number, h: number): void {
  faixa(ctx, C_TASKS_BG, w, h, 0, h);
  const n = Math.min(5, Math.max(2, Math.floor(h / 3))); // itens que cabem na tela
  const pos = Math.floor(t / 900 + (seed % 6)) % (n + 2); // +2 passos de pausa
  for (let i = 0; i < n; i++) {
    const y = 2 + i * 3;
    const feito = i < pos;
    clip(ctx, feito ? C_TASKS_CAIXA : C_TASKS_CAIXA_V, 2, y, 1, 1, w, h);
    clip(ctx, feito ? C_TASKS_FEITO : C_TASKS_PEND, 5, y,
      2 + (hash2(seed, i + 9) % Math.max(1, w - 8)), 1, w, h);
  }
}

// `alert`: precisa de você — fundo alterna âmbar/escuro a cada 380 ms com "!" de tinta
// invertida no centro. (O modo não usa semente, §2.4: "não".)
function desenharAlert(ctx: CtxMin, t: number, w: number, h: number): void {
  const lig = Math.floor(t / 380) % 2;
  faixa(ctx, lig ? C_ALERT_ON : C_ALERT_OFF, w, h, 0, h);
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const tinta = lig ? C_ALERT_TINTA_ON : C_ALERT_TINTA_OFF;
  clip(ctx, tinta, cx, cy - 3, 2, 3, w, h); // haste do "!"
  clip(ctx, tinta, cx, cy + 1, 2, 1, w, h); // ponto do "!"
}

// `progress`: esperando comando — linha de comando no topo, barra com colchetes que
// enche até 85% e segura piscando a 160 ms, spinner 3×3 com rastro de 4 cores a cada
// 110 ms, "..." e cursor. Ciclo `3400 + (seed%5)*300` ms com fase `(seed%997)*37`.
function desenharProgress(ctx: CtxMin, t: number, seed: number, w: number, h: number): void {
  faixa(ctx, C_PROG_BG, w, h, 0, h);
  clip(ctx, C_PROG_PROMPT, 1, 1, 1, 1, w, h); // `>`
  clip(ctx, C_PROG_TEXTO, 3, 1, Math.max(1, w * 0.4), 1, w, h);
  const periodo = 3400 + (seed % 5) * 300;
  const fase = (seed % 997) * 37; // ms
  const p = Math.floor((t + fase) / 110); // passo global a 110 ms
  const porCiclo = Math.round(periodo / 110);
  const pos = p % porCiclo;
  const barraY = 4;
  const larg = Math.max(4, w - 6);
  clip(ctx, C_PROG_COLCHETE, 2, barraY - 1, 1, 3, w, h); // colchete de abertura
  clip(ctx, C_PROG_COLCHETE, 2 + larg, barraY - 1, 1, 3, w, h); // de fechamento
  const x0 = 4;
  const pista = larg - 2;
  clip(ctx, C_PROG_TRILHO, x0, barraY, pista, 1, w, h);
  const fracao = pos / porCiclo;
  let ench = fracao < 0.85 ? Math.max(0, Math.floor(pista * fracao)) : Math.floor(pista * 0.85);
  if (fracao >= 0.85 && Math.floor(t / 160) % 2 === 1) ench = 0; // pausa piscando
  if (ench > 0) {
    clip(ctx, C_PROG_PREENCH, x0, barraY, ench, 1, w, h);
    clip(ctx, C_PROG_TOPO, x0, barraY - 1, ench, 1, w, h); // topo do enchimento
    clip(ctx, C_PROG_PONTA, x0 + ench - 1, barraY, 1, 1, w, h); // ponta
  }
  // Spinner: 8 posições no anel do 3×3, cada uma com a cor do rastro em ordem.
  const quad = p % 8;
  const sx = Math.max(2, w - 6);
  const sy = barraY + 4;
  for (let i = 0; i < 4; i++) {
    const q = (quad - i + 8) % 8;
    clip(ctx, C_PROG_SPINNER[i], sx + SPX[q], sy + SPY[q], 1, 1, w, h);
  }
  clip(ctx, C_PROG_PONTOS, 2, sy, 3, 1, w, h); // "..."
  if (Math.floor(t / 500 + (seed % 2)) % 2 === 0) clip(ctx, C_PROG_CURSOR, 7, sy, 1, 1, w, h);
}
