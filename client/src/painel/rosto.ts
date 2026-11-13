// Rosto pixel-art 16×16 do agente — a MESMA pessoa do prédio 3D: cores e peças
// (cabelo, barba, óculos, fones, roupa) vêm de `aparencia(seed)` em people.ts; as
// peças do editor (`AppearanceParts`) sobrepõem quando existem. Busto enquadrado
// (cabeça grande + ombros que sangram pela base), sombreado de 3 tons por região
// e contorno escuro de 1 célula — o que faz o sprite ler a 32 px (2 px por célula).
// Puro: sem DOM/WebGL/Math.random/Date.now; mesma seed (+ peças) = mesmo rosto.
import type { AppearanceParts } from '../../../shared/appearance';
import { aparencia, CLOTHES, HAIR, SKIN_TONES } from '../people';

/** Lado da grade (células). 16 × 2 px = 32 px na lista: escala inteira, pixel nítido. */
export const LADO = 16;

/** Converte 0xRRGGBB (paleta de people.ts) para "#rrggbb" (cor de texto/SVG). */
export const corHex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/**
 * Validador único de cor vinda de fora (snapshot/editor): o SVG vai para innerHTML,
 * então só passa "#rrggbb"; qualquer outra coisa (ex.: `"><script>`) cai no padrão.
 */
const COR_OK = /^#[0-9a-f]{6}$/i;
function cor(v: unknown, padrao: string): string {
  return typeof v === 'string' && COR_OK.test(v) ? v.toLowerCase() : padrao.toLowerCase();
}

/** Escurece uma cor "#rrggbb" multiplicando os canais por `f` (sombra, mecha, vinco). */
function escurecer(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  const r = c((n >> 16) & 0xff);
  const g = c((n >> 8) & 0xff);
  const b = c(n & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Mistura duas cores "#rrggbb": `fra` de `b` por cima de `a` (luz, rubor, barba por fazer). */
function misturar(a: string, b: string, fra: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const mix = (shift: number) => {
    const ra = (pa >> shift) & 0xff;
    const rb = (pb >> shift) & 0xff;
    return Math.round(ra + (rb - ra) * fra) << shift;
  };
  return `#${((mix(16) | mix(8) | mix(0)) >>> 0).toString(16).padStart(6, '0')}`;
}

/**
 * Cores do rosto: a mesma pessoa do prédio (`aparencia(seed)`), com as peças do
 * editor do personagem por cima quando existem. Tudo em "#rrggbb" minúsculo e
 * toda cor externa passa por `cor()` antes de existir aqui.
 */
export function paletaDoRosto(seed: number, partes?: AppearanceParts, genero?: 'f' | 'm') {
  const look = aparencia(seed, undefined, genero);
  const pele = cor(partes?.skin, corHex(SKIN_TONES[look.skin]));
  const cabelo = cor(partes?.hair, corHex(HAIR[look.hairColor]));
  const roupa = cor(partes?.top, corHex(CLOTHES[look.color]));
  return {
    pele,
    peleLuz: misturar(pele, '#ffffff', 0.16),
    peleSombra: escurecer(pele, 0.8),
    rubor: misturar(pele, '#e0786a', 0.38),
    cabelo,
    cabeloLuz: misturar(cabelo, '#ffffff', 0.24),
    cabeloEscuro: escurecer(cabelo, 0.62),
    // "Barba por fazer": pele tingida de cabelo (mesma regra do boneco 3D).
    peleBarba: misturar(pele, cabelo, 0.42),
    olho: cor(partes?.eyes, '#1b1512'),
    boca: escurecer(misturar(pele, '#7a2e2a', 0.55), 0.78),
    roupa,
    roupaEscura: escurecer(roupa, 0.7),
    roupaLuz: misturar(roupa, '#ffffff', 0.16),
    // Gola/gravata/cordão: a cor de destaque do editor, senão um tom claro da roupa.
    gola: cor(partes?.topAccent, misturar(roupa, '#ffffff', 0.5)),
    // Boné, gorro, laço: cor do acessório no editor, senão o laranja da identidade.
    acessorio: cor(partes?.accessoryColor, '#f4682a'),
  };
}

// Cores fixas do sprite (hardware e materiais, não vêm da marca nem do snapshot).
const ARMA = '#252b32'; // armação dos óculos (igual ao boneco 3D)
const BRILHO = '#f6f3ee'; // brilho do olho
const LENTE_ESCURA_LUZ = '#5b6875'; // brilho na lente escura
const FONES = '#242b33'; // fones (igual ao boneco 3D)
const FONES_LUZ = '#4a5562';
const CAMISA_CLARA = '#e6e1d8'; // camisa sob blazer/cardigã (igual ao boneco 3D)
const GRAVATA = '#3d2f3a';
const OURO = '#e2b34a'; // brinco
const CONTORNO = '#0e0b0a'; // contorno do sprite: tinta mais funda que o fundo do avatar

type Penteado =
  | 'lateral' | 'raspado' | 'cacheado' | 'afro' | 'rabo' | 'coque' | 'liso' | 'ondulado'
  | 'careca' | 'curto' | 'espetado' | 'moicano' | 'chanel' | 'chiquinha';

/** Índice `look.hair` (0–9) do boneco 3D → penteado do sprite (mesma leitura do addHair). */
const PENTEADO_SEED: readonly Penteado[] = [
  'lateral', 'raspado', 'cacheado', 'afro', 'rabo', 'coque', 'liso', 'ondulado', 'careca', 'curto',
];

/** Penteado escolhido no editor (HAIR_STYLES) → penteado do sprite. */
const PENTEADO_PECA: Readonly<Record<string, Penteado>> = {
  short: 'curto', buzz: 'raspado', spiky: 'espetado', side_part: 'lateral', curly: 'cacheado',
  afro: 'afro', bob: 'chanel', long: 'liso', ponytail: 'rabo', bun: 'coque',
  pigtails: 'chiquinha', mohawk: 'moicano', bald: 'careca', wavy: 'ondulado',
};

type Gola = 'camisa' | 'gravata' | 'blazer' | 'golaAlta' | 'camiseta' | 'cardiga' | 'blusa' | 'moletom' | 'polo';

/** `look.outfit` (0–7) do boneco 3D → gola do busto. */
const GOLA_SEED: readonly Gola[] = ['camisa', 'blazer', 'blusa', 'gravata', 'golaAlta', 'camiseta', 'cardiga', 'gravata'];

/** Estilo de roupa do editor (TOP_STYLES) → gola do busto. */
const GOLA_PECA: Readonly<Record<string, Gola>> = {
  tshirt: 'camiseta', hoodie: 'moletom', shirt_tie: 'gravata', sweater: 'golaAlta',
  jacket: 'blazer', blouse: 'blusa', polo: 'polo',
};

/** Lê uma tabela por chave vinda de fora sem cair em propriedades herdadas (ex.: "constructor"). */
function daTabela<T>(tabela: Readonly<Record<string, T>>, chave: unknown): T | undefined {
  return typeof chave === 'string' && Object.hasOwn(tabela, chave) ? tabela[chave] : undefined;
}

/**
 * Monta a grade 16×16 do rosto ('' = transparente). Exportada para teste e para
 * conferir a arte em ASCII. Camadas: roupa → pescoço → cabeça → rosto (olhos,
 * boca, rubor) → barba → cabelo → acessórios → contorno.
 */
export function gradeDoRosto(seed: number, partes?: AppearanceParts, genero?: 'f' | 'm'): string[][] {
  const p = paletaDoRosto(seed, partes, genero);
  const look = aparencia(seed, undefined, genero);
  const g: string[][] = Array.from({ length: LADO }, () => Array<string>(LADO).fill(''));
  const px = (x: number, y: number, c: string): void => {
    if (x >= 0 && x < LADO && y >= 0 && y < LADO) g[y][x] = c;
  };
  const faixa = (x0: number, x1: number, y: number, c: string): void => {
    for (let x = x0; x <= x1; x++) px(x, y, c);
  };
  // O rosto é simétrico em torno de x = 7,5: `par` pinta a célula e o espelho dela.
  const par = (x: number, y: number, c: string): void => {
    px(x, y, c);
    px(LADO - 1 - x, y, c);
  };
  const vazio = (x: number, y: number): boolean => !g[y]?.[x];

  // ---------------- busto: ombros + gola ----------------
  faixa(3, 12, 13, p.roupa);
  faixa(1, 14, 14, p.roupa);
  faixa(0, 15, 15, p.roupa);
  faixa(4, 6, 13, p.roupaLuz); // luz no ombro esquerdo (luz vem da esquerda)
  par(3, 15, p.roupaEscura); // vinco do braço
  faixa(12, 14, 14, p.roupaEscura); // ombro direito na sombra
  faixa(13, 15, 15, p.roupaEscura);

  // Pescoço (sombra do queixo); golas abaixo cobrem o que precisarem.
  faixa(6, 9, 12, p.peleSombra);
  const gola: Gola = daTabela(GOLA_PECA, partes?.topStyle) ?? GOLA_SEED[look.outfit] ?? 'camiseta';
  if (gola === 'camiseta') {
    // Gola redonda: pele em U e aro escuro.
    faixa(6, 9, 13, p.peleSombra);
    par(5, 13, p.roupaEscura);
    faixa(6, 9, 14, p.roupaEscura);
  } else if (gola === 'camisa' || gola === 'polo' || gola === 'gravata') {
    // Colarinho: duas pontas claras e o decote em V; gravata desce pelo meio.
    faixa(7, 8, 13, p.peleSombra);
    par(5, 13, p.gola);
    par(6, 13, p.gola);
    par(6, 14, p.gola);
    if (gola === 'gravata') {
      faixa(7, 8, 13, GRAVATA);
      faixa(7, 8, 14, GRAVATA);
      faixa(7, 8, 15, escurecer(GRAVATA, 0.8));
    } else {
      faixa(7, 8, 14, p.roupaEscura);
      if (gola === 'polo') px(7, 15, p.gola); // botão da polo
    }
  } else if (gola === 'blazer') {
    // Blazer aberto em V: camisa clara no meio, lapelas escuras.
    faixa(6, 9, 13, CAMISA_CLARA);
    faixa(7, 8, 14, CAMISA_CLARA);
    par(5, 13, p.roupaEscura);
    par(6, 14, p.roupaEscura);
    par(7, 15, p.roupaEscura);
  } else if (gola === 'golaAlta') {
    // Gola alta enrolada: cobre o pescoço, com canelado.
    faixa(5, 10, 12, p.roupa);
    faixa(5, 10, 13, p.roupaEscura);
    px(5, 12, p.roupaLuz);
    px(6, 12, p.roupaLuz);
  } else if (gola === 'cardiga') {
    // Cardigã aberto sobre blusa clara, com botões.
    faixa(6, 9, 13, CAMISA_CLARA);
    faixa(6, 9, 14, CAMISA_CLARA);
    faixa(7, 8, 15, CAMISA_CLARA);
    px(9, 14, p.roupaEscura);
    par(5, 14, p.roupaEscura);
  } else if (gola === 'moletom') {
    // Capuz caído atrás do pescoço + cordões claros.
    par(4, 12, p.roupa);
    par(5, 12, p.roupaEscura);
    faixa(6, 9, 13, p.roupaEscura);
    par(6, 14, p.gola);
    par(6, 15, p.gola);
  } else {
    // Blusa: gola redonda na cor de destaque.
    faixa(6, 9, 13, p.peleSombra);
    par(5, 13, p.gola);
    faixa(6, 9, 14, p.gola);
  }

  // ---------------- cabeça ----------------
  faixa(5, 10, 3, p.pele);
  faixa(4, 11, 4, p.pele);
  for (let y = 5; y <= 9; y++) faixa(3, 12, y, p.pele);
  faixa(4, 11, 10, p.pele);
  faixa(5, 10, 11, p.pele);
  // Sombra no lado direito e sob o queixo; luz na testa à esquerda.
  for (let y = 6; y <= 9; y++) px(12, y, p.peleSombra);
  px(11, 10, p.peleSombra);
  px(10, 11, p.peleSombra);
  px(4, 5, p.peleLuz);
  px(5, 5, p.peleLuz);
  // Orelhas.
  par(2, 7, p.pele);
  par(2, 8, p.peleSombra);
  px(13, 7, p.peleSombra);

  // ---------------- rosto ----------------
  // Olhos 2×2 escuros com brilho no canto de cima à esquerda (a luz vem da esquerda
  // nos dois olhos): é o brilho que faz o olho ler em qualquer tom de pele.
  for (const x0 of [5, 9]) {
    faixa(x0, x0 + 1, 7, p.olho);
    faixa(x0, x0 + 1, 8, p.olho);
    px(x0, 7, BRILHO);
  }
  if (look.feminine) par(4, 7, p.olho); // cílio no canto externo
  // Sobrancelhas (mais finas na persona feminina).
  par(5, 6, p.cabeloEscuro);
  if (!look.feminine) par(6, 6, p.cabeloEscuro);
  else par(4, 6, p.cabeloEscuro);
  // Rubor e boca: sorriso com os cantos para cima.
  par(4, 9, p.rubor);
  faixa(7, 8, 10, p.boca);
  par(6, 9, p.boca);

  // ---------------- barba (seed como o boneco 3D; peça do editor por cima) ----------------
  let barba: 'cheia' | 'fina' | 'bigode' | 'cavanhaque' | undefined;
  if (!look.feminine) barba = look.beard === 0 ? 'cheia' : look.beard === 1 ? 'fina' : look.beard === 2 ? 'bigode' : undefined;
  if (partes?.facialHair === 'beard') barba = 'cheia';
  else if (partes?.facialHair === 'stubble') barba = 'fina';
  else if (partes?.facialHair === 'mustache') barba = 'bigode';
  else if (partes?.facialHair === 'goatee') barba = 'cavanhaque';
  else if (partes?.facialHair === 'none') barba = undefined;
  if (barba === 'cheia' || barba === 'fina') {
    const c = barba === 'cheia' ? p.cabelo : p.peleBarba;
    par(3, 8, c);
    par(3, 9, c);
    par(4, 9, c); // cobre o rubor
    par(4, 10, c);
    par(5, 10, c);
    par(6, 10, c);
    faixa(5, 10, 11, c);
    if (barba === 'cheia') {
      faixa(6, 9, 9, p.cabeloEscuro); // bigode emendado
      faixa(7, 8, 10, p.boca);
      faixa(6, 9, 12, p.cabeloEscuro); // barba cai sobre o pescoço
      px(10, 11, p.cabeloEscuro);
    }
  } else if (barba === 'bigode') {
    faixa(6, 9, 9, p.cabeloEscuro);
  } else if (barba === 'cavanhaque') {
    faixa(6, 9, 11, p.cabelo);
    faixa(7, 8, 12, p.cabeloEscuro);
  }

  // ---------------- cabelo ----------------
  const estilo: Penteado = daTabela(PENTEADO_PECA, partes?.hairStyle) ?? PENTEADO_SEED[look.hair] ?? 'curto';
  const h = p.cabelo;
  const hl = p.cabeloLuz;
  const he = p.cabeloEscuro;
  // Calota comum: topo arredondado, franja na linha da testa e costeletas até a orelha.
  const calota = (franja = true): void => {
    faixa(5, 10, 1, h);
    faixa(3, 12, 2, h);
    faixa(2, 13, 3, h);
    if (franja) faixa(2, 13, 4, h);
    par(2, 5, h);
    par(3, 5, h);
    par(2, 6, h);
    // Luz no alto à esquerda; sombra na borda da franja e à direita.
    faixa(5, 6, 1, hl);
    faixa(4, 5, 2, hl);
    faixa(11, 13, 3, he);
    if (franja) faixa(10, 13, 4, he);
  };
  // Mechas compridas descendo pelas laterais (cobrem orelhas), até `ate`.
  const laterais = (ate: number, onda = false): void => {
    for (let y = 5; y <= ate; y++) {
      const fora = onda && y % 2 === 0 ? 1 : 2; // ondulado: borda externa vai e volta
      faixa(fora, 3, y, h);
      faixa(12, LADO - 1 - fora, y, y > 7 ? he : h);
    }
  };

  switch (estilo) {
    case 'careca':
      // Topo livre (couro com brilho), faixa nas laterais e atrás.
      faixa(5, 10, 2, p.pele);
      faixa(4, 11, 3, p.pele);
      px(6, 2, p.peleLuz);
      px(5, 3, p.peleLuz);
      par(2, 5, h);
      par(3, 5, h);
      par(2, 6, h);
      faixa(12, 13, 5, he);
      break;
    case 'raspado':
      // Cabelo rente: calota fina, cor puxada para a pele, sem volume.
      faixa(5, 10, 2, misturar(h, p.pele, 0.25));
      faixa(3, 12, 3, misturar(h, p.pele, 0.25));
      faixa(3, 12, 4, misturar(h, p.pele, 0.35));
      par(3, 5, misturar(h, p.pele, 0.35));
      faixa(5, 6, 2, misturar(hl, p.pele, 0.25));
      break;
    case 'curto':
      calota();
      faixa(6, 8, 0, h); // topete curto
      px(6, 0, hl);
      break;
    case 'lateral':
      calota();
      faixa(4, 7, 5, h); // franja varrida para a esquerda
      px(4, 5, he);
      px(8, 4, he); // risca
      faixa(4, 9, 0, h); // volume no topo
      faixa(4, 5, 0, hl);
      break;
    case 'espetado':
      calota();
      for (const x of [3, 6, 9, 12]) px(x, 0, h);
      for (const x of [4, 7, 10]) px(x, 1, h);
      faixa(3, 12, 1, h);
      px(6, 0, hl);
      px(3, 0, hl);
      break;
    case 'moicano':
      // Laterais raspadas + crista central alta.
      faixa(5, 10, 2, misturar(h, p.pele, 0.3));
      faixa(3, 12, 3, misturar(h, p.pele, 0.3));
      faixa(6, 9, 0, h);
      faixa(6, 9, 1, h);
      faixa(6, 9, 2, h);
      faixa(6, 9, 3, h);
      faixa(6, 9, 4, he);
      px(6, 0, hl);
      px(6, 1, hl);
      break;
    case 'cacheado':
      calota();
      // Topo com cachos: contorno irregular e pontos de luz/sombra alternados.
      faixa(3, 12, 1, h);
      for (const x of [4, 6, 9, 11]) px(x, 0, h);
      for (const x of [4, 8, 12]) px(x, 2, he);
      for (const x of [6, 10]) px(x, 3, he);
      px(4, 0, hl);
      px(5, 1, hl);
      par(3, 5, h);
      break;
    case 'afro':
      // Volume amplo e redondo; franja acima das sobrancelhas, orelhas cobertas.
      faixa(4, 11, 0, h);
      faixa(2, 13, 1, h);
      for (let y = 2; y <= 4; y++) faixa(1, 14, y, h);
      for (let y = 5; y <= 8; y++) { faixa(1, 2, y, h); faixa(13, 14, y, he); }
      par(3, 5, h);
      faixa(4, 6, 0, hl);
      faixa(3, 4, 1, hl);
      for (const [x, y] of [[6, 2], [10, 1], [3, 3], [9, 3], [12, 2], [13, 4]] as const) px(x, y, he);
      break;
    case 'coque':
      calota();
      // Coque alto destacado da cabeça: a linha 1 vira só o coque (as pontas viram contorno).
      px(5, 1, '');
      px(10, 1, '');
      faixa(6, 9, 0, h);
      faixa(6, 9, 1, he); // amarração
      px(6, 0, hl);
      faixa(4, 5, 2, hl);
      break;
    case 'rabo':
      calota();
      // Rabo de cavalo caindo pelo lado direito, atrás do ombro.
      faixa(13, 14, 4, h);
      for (let y = 5; y <= 11; y++) px(14, y, y > 8 ? he : h);
      px(13, 5, he);
      faixa(14, 15, 12, he);
      break;
    case 'chiquinha':
      calota();
      // Dois rabinhos presos por elástico (cor do acessório) e soltos abaixo das orelhas.
      par(1, 4, p.acessorio);
      for (let y = 5; y <= 10; y++) { faixa(0, 1, y, h); faixa(14, 15, y, he); }
      par(0, 10, '');
      px(1, 5, hl);
      break;
    case 'chanel':
      calota();
      laterais(10);
      faixa(4, 11, 5, h); // franja reta
      faixa(9, 11, 5, he);
      break;
    case 'liso':
      calota();
      laterais(12);
      faixa(4, 6, 5, h); // franja lateral
      break;
    case 'ondulado':
      calota();
      laterais(12, true);
      faixa(1, 2, 1, h);
      px(4, 5, h);
      break;
  }

  // ---------------- acessórios ----------------
  // Óculos: seed (como o 3D) ou peça; "none" tira os da seed (e os fones da seed).
  let oculos: 'redondo' | 'quadrado' | 'escuro' | undefined =
    look.glasses === 0 ? 'redondo' : look.glasses === 1 || look.glasses === 2 ? 'quadrado' : undefined;
  let fones = look.headset;
  const acessorio = partes?.accessory;
  if (acessorio === 'glasses') oculos = 'redondo';
  else if (acessorio === 'sunglasses') oculos = 'escuro';
  else if (acessorio === 'none') { oculos = undefined; fones = false; }
  if (acessorio === 'headphones') fones = true;

  if (oculos === 'escuro') {
    // Lentes escuras: faixa única na linha de cima, duas lentes embaixo (o nariz aparece no meio).
    faixa(4, 11, 7, ARMA);
    faixa(4, 6, 8, ARMA);
    faixa(9, 11, 8, ARMA);
    px(5, 7, LENTE_ESCURA_LUZ);
    px(9, 7, LENTE_ESCURA_LUZ);
    par(3, 7, ARMA);
  } else if (oculos) {
    // Aro em volta de cada olho, na cor da armação puxada para a pele: lê como óculos
    // sem virar máscara. Quadrado = barra em cima; redondo = arco embaixo. Os aros se
    // encostam no meio e fazem a ponte.
    const aro = misturar(p.pele, ARMA, 0.7);
    for (const [x0, x1] of [[4, 7], [8, 11]] as const) {
      for (const y of [7, 8]) { px(x0, y, aro); px(x1, y, aro); }
      if (oculos === 'quadrado') faixa(x0, x1, 6, aro);
      else faixa(x0 + 1, x1 - 1, 9, aro);
    }
    par(3, 7, aro); // hastes até a orelha
    if (oculos === 'quadrado') {
      // Sobrancelhas sobem acima do aro.
      par(5, 5, p.cabeloEscuro);
      par(6, 5, p.cabeloEscuro);
    }
  }

  if (fones) {
    // Arco por cima do cabelo + conchas nas orelhas.
    faixa(5, 10, 0, FONES);
    par(4, 1, FONES);
    par(3, 2, FONES);
    for (let y = 6; y <= 9; y++) { par(1, y, FONES); par(2, y, FONES); }
    par(1, 7, FONES_LUZ);
  }

  if (acessorio === 'cap') {
    // Boné de frente: copa na cor do acessório, aba escura na testa.
    faixa(5, 10, 0, p.acessorio);
    faixa(3, 12, 1, p.acessorio);
    faixa(2, 13, 2, p.acessorio);
    faixa(2, 13, 3, p.acessorio);
    faixa(1, 14, 4, escurecer(p.acessorio, 0.62)); // aba passa da cabeça
    faixa(4, 6, 1, misturar(p.acessorio, '#ffffff', 0.25));
    px(7, 0, escurecer(p.acessorio, 0.75)); // botão da copa
  } else if (acessorio === 'beanie') {
    // Gorro: pompom, corpo canelado e barra dobrada.
    faixa(7, 8, 0, misturar(p.acessorio, '#ffffff', 0.35));
    faixa(4, 11, 1, p.acessorio);
    faixa(3, 12, 2, p.acessorio);
    faixa(2, 13, 3, p.acessorio);
    for (const x of [4, 7, 10]) px(x, 2, escurecer(p.acessorio, 0.8));
    faixa(2, 13, 4, escurecer(p.acessorio, 0.72));
  } else if (acessorio === 'bow') {
    // Laço no alto à direita.
    px(10, 0, p.acessorio);
    px(12, 0, p.acessorio);
    px(11, 1, escurecer(p.acessorio, 0.7));
    px(10, 2, p.acessorio);
    px(12, 2, p.acessorio);
  } else if (acessorio === 'earrings') {
    par(2, 9, OURO);
  }

  // ---------------- contorno ----------------
  // Toda célula vazia vizinha (4 lados) de uma pintada vira contorno: o sprite
  // ganha borda de 1 célula e se separa do fundo do avatar.
  const contorno: [number, number][] = [];
  for (let y = 0; y < LADO; y++) {
    for (let x = 0; x < LADO; x++) {
      if (!vazio(x, y)) continue;
      if (!vazio(x - 1, y) || !vazio(x + 1, y) || !vazio(x, y - 1) || !vazio(x, y + 1)) contorno.push([x, y]);
    }
  }
  for (const [x, y] of contorno) g[y][x] = CONTORNO;
  return g;
}

/**
 * SVG do rosto (16×16, `crispEdges`), com células vizinhas da mesma cor fundidas
 * em um único <rect> por linha (DOM enxuto). Toda cor já é "#rrggbb" validada.
 * Tem `xmlns` para também funcionar via DOMParser (detalhe-pecas.ts).
 */
export function rostoSvg(seed: number, partes?: AppearanceParts, genero?: 'f' | 'm'): string {
  const g = gradeDoRosto(seed, partes, genero);
  const rets: string[] = [];
  for (let y = 0; y < LADO; y++) {
    let x = 0;
    while (x < LADO) {
      const c = g[y][x];
      if (!c) { x++; continue; }
      let fim = x;
      while (fim + 1 < LADO && g[y][fim + 1] === c) fim++;
      rets.push(`<rect x="${x}" y="${y}" width="${fim - x + 1}" height="1" fill="${c}"/>`);
      x = fim + 1;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LADO} ${LADO}" shape-rendering="crispEdges" aria-hidden="true">${rets.join('')}</svg>`;
}

/** Selo curto da conta: sigla de no máximo 3 letras em maiúsculas (chip redondo da lista). */
export function siglaCont(rotulo: string): string {
  const limpo = rotulo.trim().toUpperCase();
  return limpo ? limpo.slice(0, 3) : '—';
}

/** Riscar no meio: corta a parte do miolo e deixa "a…b" (ex.: caminho do projeto). Puro. */
export function riscarMeio(t: string, teto = 28): string {
  if (t.length <= teto) return t;
  const a = Math.ceil((teto - 1) / 2);
  const b = Math.floor((teto - 1) / 2);
  return `${t.slice(0, a)}…${t.slice(-b)}`;
}
