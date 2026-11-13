// Adaptado de marmottajr/habblaud@faa1a01 client/src/art/dynamic.ts (MIT)
// Balão de atividade acima da pessoa na cena 3D: um sprite com CanvasTexture PRÓPRIA por
// pessoa (texto difere por pessoa; não há textura compartilhada), redesenhada só quando o
// texto muda — nada de custo por quadro. Cortado do projeto de origem: só a renderização do sprite
// ficou; a lógica 2D de cumprimentos (world/city/social.ts) e a animação "pop" não vieram.
import * as THREE from 'three';
import type { Destino, Estado } from './vida/tipos';

// Rótulos do balão (não saem no DOM — não entram em painel/texto.ts de propósito).
export const PENSANDO = 'Pensando…';
export const TRABALHANDO = 'Trabalhando…';
export const PRECISA_DE_VOCE = '!';
export const ZZZ = 'zZz';
// Rótulos da vida social (4.5): ocioso em destino com atividade tem balão curto; o GOL troca "Assistindo".
export const ASSISTINDO = 'Assistindo';
export const GOOOL = 'GOOOL!';
export const FLIPERAMA = 'Fliperama';
export const PING_PONG = 'Ping-pong';
export const FOLHEANDO = 'Folheando um livro';
// Teto de caracteres do texto do balão (truncado com "…").
export const LIMITE_TEXTO_BALAO = 24;

/** Texto curto: inteiro se couber em 24 chars; além disso, corta em 24 e anexa "…". */
export function textoCurto(s: string): string {
  const t = s.trim();
  if (t.length <= LIMITE_TEXTO_BALAO) return t;
  return t.slice(0, LIMITE_TEXTO_BALAO).trimEnd() + '…';
}

/**
 * Texto do balão de uma pessoa:
 * - 'working' → título/atividade atual curta; vazio → "Pensando…"; no modo conteúdo → "Trabalhando…"
 * - 'waiting' → "!" (precisa de você — genérico, não expõe conteúdo, vale também no modo conteúdo)
 * - 'idle' e 'done' → balão da vida social (4.5): tv → "Assistindo" (com `gol` → "GOOOL!"),
 *   fliperama → "Fliperama", pingpong → "Ping-pong", estante → "Folheando um livro",
 *   copa → "zZz"; lounge, conversa e demais destinos → sem balão
 * - 'shell', 'offline' → sem balão (o de shell foi cortado do escopo v1)
 */
export function textoBalao(
  estado: Estado,
  titulo: string,
  destino: Destino | undefined,
  modoConteudo: boolean,
  gol?: boolean,
): string {
  switch (estado) {
    case 'working':
      return modoConteudo ? TRABALHANDO : textoCurto(titulo) || PENSANDO;
    case 'waiting':
      return PRECISA_DE_VOCE;
    case 'idle':
    case 'done': {
      // Vida social (4.5): o destino decide o balão; 'done' repete o mapa de 'idle' (pessoa concluiu e está ocupando o lugar).
      switch (destino) {
        case 'tv':
          return gol ? GOOOL : ASSISTINDO;
        case 'fliperama':
          return FLIPERAMA;
        case 'pingpong':
          return PING_PONG;
        case 'estante':
          return FOLHEANDO;
        case 'copa':
          return ZZZ;
        default:
          // lounge, conversa, mesa, andar 2 e demais destinos: sem balão.
          return '';
      }
    }
    default:
      return '';
  }
}

// Canvas de 512×128 (nítido até ~10 m de câmera; a visibilidade já corta a 40 m).
const LARG = 512, ALT = 128;
// 1 unidade de cena ≈ 0,003 de pixel de canvas: o balão fica ~1,54 × 0,38 m.
const TEX_ESCALA = 0.003;

export class Balao {
  readonly sprite: THREE.Sprite;
  /** Último texto definido (vazio = balão oculto; predio.ts usa para a visibilidade por distância). */
  texto = '';
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly textura: THREE.CanvasTexture;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = LARG;
    this.canvas.height = ALT;
    this.ctx = this.canvas.getContext('2d')!;
    this.textura = new THREE.CanvasTexture(this.canvas);
    this.textura.colorSpace = THREE.SRGBColorSpace;
    // Mesmo perfil da etiqueta da pessoa (people.ts): transparente, oclusa pela cena, sem escrita de depth.
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.textura, transparent: true, depthTest: true, depthWrite: false }));
    this.sprite.scale.set(LARG * TEX_ESCALA, ALT * TEX_ESCALA, 1);
    this.sprite.visible = false;
  }

  /** Atualiza o texto; a textura só é redesenhada e enviada à GPU quando ele muda. A
   *  visibilidade fica com o Predio (regra de distância) — aqui só a texture muda. */
  definirTexto(t: string) {
    if (t === this.texto) return;
    this.texto = t;
    this.desenhar();
  }

  private desenhar() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, LARG, ALT);
    const t = this.texto;
    if (t) {
      // Vidro escuro (mesma família da etiqueta da pessoa) com rabinho apontando a cabeça.
      ctx.font = '600 40px -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
      const w = Math.min(LARG - 8, ctx.measureText(t).width + 44);
      const x = (LARG - w) / 2;
      ctx.fillStyle = 'rgba(12,16,22,.82)';
      ctx.beginPath();
      ctx.roundRect(x, 10, w, 56, 14);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(LARG / 2 - 8, 64);
      ctx.lineTo(LARG / 2 + 8, 64);
      ctx.lineTo(LARG / 2, 84);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f2f5f8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t, LARG / 2, 38, w - 12);
    }
    this.textura.needsUpdate = true;
  }

  /** Libera a textura quando a pessoa sai da cena (chamado no Predio.remover). */
  liberar() {
    this.textura.dispose();
    (this.sprite.material as THREE.SpriteMaterial).dispose();
  }
}
