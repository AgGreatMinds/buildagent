// Orçamento de desempenho (puro, sem WebGL nem relógio global): decide o NÍVEL de qualidade e os
// parâmetros de cada nível a partir do que o laço mede (ms por quadro, zoom, aba visível).
// Três níveis: 'cheio' (idêntico ao comportamento de antes deste módulo), 'economico' e 'minimo'.
// Histerese em dois eixos para não oscilar: limiares diferentes para piorar e melhorar, e tempo
// mínimo no nível (melhorar espera bem mais que piorar). O tempo entra sempre por argumento.

export type Nivel = 'cheio' | 'economico' | 'minimo';
export const NIVEIS: readonly Nivel[] = ['cheio', 'economico', 'minimo'];

// ---------- Limiares (um lugar só) ----------
export const LIMITES = {
  msPiorar: 30, // média acima de 30 ms (< ~33 fps) desce um nível
  msMelhorar: 20, // média abaixo de 20 ms (> 50 fps) sobe um nível; acima do teto de 60 Hz (16,7 ms)
  esperaPiorar: 2000, // ms mínimos no nível antes de descer
  esperaMelhorar: 10000, // ms mínimos no nível antes de subir (subir custa: evita o vai-e-volta)
  aquecimento: 3000, // ms no início sem decidir nada (compilação de shader e carga de modelos)
  zoomEntra: 14, // câmera→alvo abaixo disto = zoom (o duplo clique no boneco deixa ~9,2 m)
  zoomSai: 18, // e só sai do zoom acima disto
  nucleosFracos: 2, // hardwareConcurrency ≤ 2 já começa no econômico
} as const;

export interface EstadoOrcamento {
  nivel: Nivel;
  zoom: boolean; // câmera perto do alvo (pessoa/mesa/tela): o resto da cena gasta menos
  desde: number; // instante (ms) da última troca de nível; base do tempo mínimo no nível
  pausado: boolean; // aba oculta: o laço para e o nível fica congelado
}

export interface Entrada {
  agora: number; // ms monotônico (relógio do laço)
  distAlvo: number; // m da câmera ao alvo dos controles (o "zoom")
  visivel: boolean; // !document.hidden
  msQuadro: number; // média móvel de ms por quadro (mediaMovel)
}

/** O que cada nível libera. Em 'cheio' sem zoom, os valores são exatamente os de antes. */
export interface Parametros {
  pixelRatioMax: number; // teto do devicePixelRatio (setPixelRatio só quando o nível muda)
  telasTeto: number; // máx. de redesenhos de tela por quadro
  telasMult: number; // multiplicador do intervalo de redesenho de todas as telas
  telasMultFora: number; // multiplicador extra para tela fora do foco (só com zoom; 1 sem)
  raioFoco: number; // m em volta do alvo que contam como "foco" (Infinity sem zoom)
  balaoMax: number; // distância câmera→pessoa máxima do balão
  longe: number; // câmera→pessoa acima disto conta como "longe" (Infinity = ninguém é longe)
  pessoaForaCada: number; // pessoa fora do frustum (ou oculta) anima 1 a cada N quadros
  pessoaLongeCada: number; // pessoa visível mas longe/fora do foco anima 1 a cada N quadros
  passoMs: number; // intervalo do passo social (Predio.passo)
  corteMs: number; // intervalo do cortarArvore
  sombraCada: number; // recalcula o mapa de sombras a cada N quadros
  cidadeAnima: boolean; // carros da cidade andam (com a câmera longe)
}

// Tabela por nível; raioFoco e telasMultFora dependem só do zoom (parametros).
const BASE: Record<Nivel, Omit<Parametros, 'telasMultFora' | 'raioFoco'>> = {
  // Fora do frustum ninguém vê a pessoa: animar a 1/4 da taxa não muda nada na tela.
  cheio: { pixelRatioMax: 1.5, telasTeto: 8, telasMult: 1, balaoMax: 40, longe: Infinity, pessoaForaCada: 4, pessoaLongeCada: 1, passoMs: 1000, corteMs: 250, sombraCada: 3, cidadeAnima: true },
  economico: { pixelRatioMax: 1.25, telasTeto: 4, telasMult: 2, balaoMax: 30, longe: 50, pessoaForaCada: 6, pessoaLongeCada: 2, passoMs: 1000, corteMs: 500, sombraCada: 6, cidadeAnima: true },
  minimo: { pixelRatioMax: 1, telasTeto: 2, telasMult: 4, balaoMax: 20, longe: 35, pessoaForaCada: 8, pessoaLongeCada: 4, passoMs: 2000, corteMs: 1000, sombraCada: 15, cidadeAnima: false },
};
// Com zoom: o que está a mais de RAIO_FOCO do alvo fica em segundo plano.
const RAIO_FOCO = 15;
const ZOOM_TELAS_FORA = 4; // telas fora do foco redesenham 4× mais devagar
const ZOOM_PESSOA_LONGE = 3; // pessoas fora do foco animam no máximo a 1/3 da taxa

/** Estado de partida: máquina fraca (poucos núcleos) já começa no econômico; resto, cheio. */
export function estadoInicial(agora: number, nucleos?: number): EstadoOrcamento {
  const fraca = nucleos !== undefined && nucleos > 0 && nucleos <= LIMITES.nucleosFracos;
  return { nivel: fraca ? 'economico' : 'cheio', zoom: false, desde: agora + LIMITES.aquecimento, pausado: false };
}

/**
 * Próximo estado. Devolve o MESMO objeto quando nada muda (o laço compara por identidade).
 * - aba oculta: só marca `pausado` (nível e zoom congelados);
 * - ao voltar: tira a pausa e reinicia o tempo no nível (o 1º quadro de volta não decide nada);
 * - zoom com histerese de distância; nível com histerese de ms e de tempo mínimo.
 */
export function avaliar(anterior: EstadoOrcamento, e: Entrada): EstadoOrcamento {
  if (!e.visivel) return anterior.pausado ? anterior : { ...anterior, pausado: true };
  if (anterior.pausado) return { ...anterior, pausado: false, desde: e.agora };

  const zoom = anterior.zoom ? e.distAlvo < LIMITES.zoomSai : e.distAlvo < LIMITES.zoomEntra;
  const i = NIVEIS.indexOf(anterior.nivel);
  const passou = e.agora - anterior.desde;
  let nivel = anterior.nivel;
  if (e.msQuadro > LIMITES.msPiorar && i < NIVEIS.length - 1 && passou >= LIMITES.esperaPiorar) nivel = NIVEIS[i + 1];
  else if (e.msQuadro < LIMITES.msMelhorar && i > 0 && passou >= LIMITES.esperaMelhorar) nivel = NIVEIS[i - 1];

  if (nivel === anterior.nivel && zoom === anterior.zoom) return anterior;
  return { nivel, zoom, desde: nivel === anterior.nivel ? anterior.desde : e.agora, pausado: false };
}

/** Parâmetros do nível; `zoom` põe o resto em segundo plano; `reduzido` (prefers-reduced-motion) para os carros. */
export function parametros(nivel: Nivel, zoom: boolean, reduzido: boolean): Parametros {
  const b = BASE[nivel];
  return {
    ...b,
    raioFoco: zoom ? RAIO_FOCO : Infinity,
    telasMultFora: zoom ? ZOOM_TELAS_FORA : 1,
    pessoaLongeCada: zoom ? Math.max(b.pessoaLongeCada, ZOOM_PESSOA_LONGE) : b.pessoaLongeCada,
    cidadeAnima: b.cidadeAnima && !reduzido,
  };
}

/**
 * Amostra de "quanto custa um quadro" para a média. O laço não desenha mais a cada chamada (ritmo.ts), então
 * o intervalo entre quadros deixou de medir a máquina: a 30 quadros/s ele vale 33 ms mesmo sobrando folga.
 * - quadro em ritmo livre (este e o anterior desenhados sem espera): vale o intervalo, que inclui a GPU;
 *   intervalo acima de INTERVALO_MAX_MS não vale: é o navegador segurando o laço (janela coberta, painel em
 *   segundo plano), não a máquina — antes isso derrubava o nível para o mínimo sem motivo;
 * - quadro com espera (30/s, 10/s, retomada): só vale o tempo de desenho medido, e só quando ele sozinho já
 *   passa do limite de piorar — tempo de CPU baixo não prova que a placa de vídeo está folgada.
 * `undefined` = este quadro não diz nada sobre a máquina (a média não muda).
 */
export const INTERVALO_MAX_MS = 250;
export function amostraDeQuadro(q: { intervaloMs: number; desenhoMs: number; livre: boolean }): number | undefined {
  if (q.livre && q.intervaloMs <= INTERVALO_MAX_MS) return q.intervaloMs;
  return q.desenhoMs > LIMITES.msPiorar ? Math.min(q.desenhoMs, INTERVALO_MAX_MS) : undefined;
}

/** Média móvel exponencial de ms por quadro (~20 quadros de memória). Amostra inválida não mexe. */
export function mediaMovel(media: number, amostraMs: number, alfa = 0.05): number {
  if (!Number.isFinite(amostraMs) || amostraMs < 0) return media;
  return media + (amostraMs - media) * alfa;
}
