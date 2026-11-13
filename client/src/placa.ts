// Placa com o nome da fileira (projeto) e, na falta de logo, o letreiro do prédio.
// A regra de composição é pura (testável sem canvas): o nome aparece INTEIRO sempre que cabe — primeiro
// numa linha, reduzindo a letra; depois em duas linhas, quebrando num separador; só nome com mais de
// MAX_CARACTERES é cortado (com reticências). Antes, a placa cortava qualquer nome largo ("PROJETO-FINANCE…").
import * as THREE from 'three';

/** Acima disto o nome é cortado (com "…"). */
export const MAX_CARACTERES = 28;
/** Tela da placa: 1024×256 px; a margem lateral deixa 940 px úteis. */
export const LARGURA_PX = 1024;
export const ALTURA_PX = 256;
const UTIL_PX = 940;
/** Tamanhos de letra (px na tela da placa), do maior para o menor. */
const FONTE_MAX = 96;
const FONTE_MIN_1 = 64; // menor letra em uma linha; abaixo disso a quebra em duas lê melhor
const FONTE_MAX_2 = 84;
const FONTE_MIN_2 = 48; // menor letra legível da vista do andar

export interface Composicao {
  linhas: string[]; // 1 ou 2
  fonte: number; // px
  cortado: boolean;
}

/** Largura do texto em px para um tamanho de letra (no navegador: canvas.measureText). */
export type Medir = (texto: string, fontePx: number) => number;

/** Pontos onde o nome pode quebrar: depois de espaço, hífen, sublinhado, ponto ou barra, e antes de maiúscula colada (camelCase). */
export function pontosDeQuebra(nome: string): number[] {
  const pontos: number[] = [];
  for (let i = 1; i < nome.length; i++) {
    const antes = nome[i - 1], aqui = nome[i];
    if (' -_./'.includes(antes) && !' -_./'.includes(aqui)) pontos.push(i);
    else if (/[a-zà-ÿ0-9]/.test(antes) && /[A-ZÀ-Ý]/.test(aqui)) pontos.push(i);
  }
  return pontos;
}

/** Nome do prédio quando o usuário não escolheu um (letreiro da fachada e placa do pórtico). */
export const NOME_DO_PREDIO = 'BUILDAGENT';
/** O letreiro 3D tem largura fixa na fachada: acima disto o nome é cortado. */
export const MAX_LETREIRO = 20;

/**
 * Nome do letreiro a partir do que o usuário pôs em `/local/predio.json`: só texto, sem acento nem símbolo que
 * a fonte 3D não desenha (viraria "?"), espaços limpos, no máximo MAX_LETREIRO. Vazio ou inválido → padrão.
 */
export function nomeDoLetreiro(bruto: unknown): string {
  if (typeof bruto !== 'string') return NOME_DO_PREDIO;
  const limpo = bruto.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim();
  return limpo.slice(0, MAX_LETREIRO).trim() || NOME_DO_PREDIO;
}

// Nome do prédio: quem instala põe o seu em `client/public/local/predio.json` ({ "nome": "..." }), ao lado da
// logo (`local/logo.svg`). A pasta `local/` fica fora do repositório; sem o arquivo, vale o nome padrão.
// Lido uma vez só e compartilhado (letreiro da fachada, placa do pórtico e da recepção).
let nomeLido: Promise<string> | undefined;
export function lerNomeDoPredio(): Promise<string> {
  nomeLido ??= fetch('/local/predio.json')
    .then(async (r) => (r.ok ? nomeDoLetreiro((await r.json())?.nome) : NOME_DO_PREDIO))
    .catch(() => NOME_DO_PREDIO); // arquivo ausente ou JSON inválido
  return nomeLido;
}

/** Corta o nome em MAX_CARACTERES (com "…" no lugar do último). Nome vazio vira um traço. */
export function limitar(nome: string): { texto: string; cortado: boolean } {
  const limpo = nome.replace(/\s+/g, ' ').trim();
  if (!limpo) return { texto: '—', cortado: false };
  const letras = [...limpo]; // por caractere, não por unidade UTF-16 (não parte emoji nem acento composto)
  if (letras.length <= MAX_CARACTERES) return { texto: limpo, cortado: false };
  return { texto: letras.slice(0, MAX_CARACTERES - 1).join('').trimEnd() + '…', cortado: true };
}

/** Decide linhas e tamanho de letra. `medir` vem do canvas (ou de um medidor fixo nos testes). */
export function comporPlaca(nome: string, medir: Medir, util = UTIL_PX): Composicao {
  const { texto, cortado } = limitar(nome);
  // 1) Uma linha, reduzindo a letra.
  for (let f = FONTE_MAX; f >= FONTE_MIN_1; f -= 4) {
    if (medir(texto, f) <= util) return { linhas: [texto], fonte: f, cortado };
  }
  // 2) Duas linhas: a quebra que deixa as duas metades mais parecidas, na maior letra que couber.
  const quebras = pontosDeQuebra(texto)
    .map((i) => [texto.slice(0, i).trim(), texto.slice(i).trim()] as const)
    .filter(([a, b]) => a && b)
    .sort((x, y) => Math.abs(x[0].length - x[1].length) - Math.abs(y[0].length - y[1].length));
  for (let f = FONTE_MAX_2; f >= FONTE_MIN_2; f -= 4) {
    for (const [a, b] of quebras) {
      if (medir(a, f) <= util && medir(b, f) <= util) return { linhas: [a, b], fonte: f, cortado };
    }
  }
  // 3) Sem separador (ou metade larga demais): uma linha na menor letra que couber.
  for (let f = FONTE_MIN_1 - 4; f >= FONTE_MIN_2; f -= 4) {
    if (medir(texto, f) <= util) return { linhas: [texto], fonte: f, cortado };
  }
  // 4) Último recurso (letra muito larga): corta até caber na menor letra.
  let t = [...texto.replace(/…$/, '')];
  while (t.length > 4 && medir(t.join('') + '…', FONTE_MIN_2) > util) t = t.slice(0, -1);
  return { linhas: [t.join('').trimEnd() + '…'], fonte: FONTE_MIN_2, cortado: true };
}

const FONTE_CSS = (px: number) => `600 ${px}px -apple-system, system-ui, 'Segoe UI', sans-serif`;
const FUNDO = 0x10151c;

// Zoom: a placa suspensa fica no caminho da câmera. A menos de PLACA_SOME m ela some; até PLACA_CHEIA m
// vai ficando transparente — sem isso, aproximar numa fileira enchia a tela com o verso escuro da placa.
export const PLACA_SOME = 2.4;
export const PLACA_CHEIA = 5;
export function opacidadeDaPlaca(distancia: number): number {
  if (!(distancia > PLACA_SOME)) return 0; // NaN e negativos caem aqui
  if (distancia >= PLACA_CHEIA) return 1;
  const k = (distancia - PLACA_SOME) / (PLACA_CHEIA - PLACA_SOME);
  return k * k * (3 - 2 * k); // entrada e saída suaves
}

/**
 * Malha da placa: caixa fina com o nome na frente e no verso. Duas chamadas de desenho (bordas + faces
 * com o nome); antes eram seis, uma por face da caixa. Geometria, textura e materiais são desta placa
 * (quem troca a placa descarta os da antiga).
 */
export function placaNome(nome: string, largura = 3.2): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = LARGURA_PX;
  c.height = ALTURA_PX;
  const g = c.getContext('2d')!;
  g.fillStyle = '#10151c';
  g.fillRect(0, 0, LARGURA_PX, ALTURA_PX);
  g.fillStyle = '#eef2f6';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const comp = comporPlaca(nome, (t, px) => {
    g.font = FONTE_CSS(px);
    return g.measureText(t).width;
  });
  g.font = FONTE_CSS(comp.fonte);
  const passo = comp.fonte * 1.12; // entrelinha
  const y0 = ALTURA_PX / 2 + 4 - ((comp.linhas.length - 1) * passo) / 2;
  comp.linhas.forEach((linha, i) => g.fillText(linha, LARGURA_PX / 2, y0 + i * passo));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4; // a placa é vista de lado na maior parte do tempo
  const geo = new THREE.BoxGeometry(largura, largura / 4, 0.08);
  // A caixa vem com 6 grupos (um por face): juntando em 2, viram 2 chamadas de desenho.
  geo.clearGroups();
  geo.addGroup(0, 24, 0); // ±X e ±Y: bordas
  geo.addGroup(24, 12, 1); // ±Z: frente e verso, com o nome
  return new THREE.Mesh(geo, [
    new THREE.MeshStandardMaterial({ color: FUNDO }),
    // O nome tem luz própria (painel retroiluminado): só com a luz do ambiente, a placa mais longe da
    // luminária ficava cinza-escuro sobre preto à noite. O fundo escuro quase não emite; a letra sim.
    new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.85, roughness: 0.6 }),
  ]);
}
