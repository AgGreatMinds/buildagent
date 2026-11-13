// Telas vivas no 3D.
// Cada tela é um CanvasTexture + MeshBasicMaterial num plano próprio (atlas foi descartado no
// plano: com ≤ 27 telas, +27 draw calls é mais barato que reescrever UV no Montador).
// O redesenho fica escalonado por distância câmera→tela (intervaloDaTela), limitado ao que o
// frustum mostra, com teto de 8 redesenhos por quadro. Zero alocação por quadro além do
// frustum: Sphere/Vector3/Matrix4 são reciclados na instância Telas.

import * as THREE from 'three';
import { desenharTela } from './desenho';
import type { ModoTela } from './modo';
import { PLANO_CORTE } from '../corte';

// ---------------------------------------------------------------------------
// Bloco puro: intervalo de redesenho por distância câmera→tela (§3, regra 3).
// <15 m → 100 ms · 15–35 m → 200 · 35–80 m → 500 · >80 m → congela (Infinity).
// Com `reduzido` (prefers-reduced-motion) os trechos curtos viram 500; >80 continua parado.
// Limites 15/35/80 caem no trecho superior (distancia < 15 é o 1º, etc.).

export function intervaloDaTela(distancia: number, reduzido: boolean): number {
  if (distancia > 80) return Infinity;
  if (reduzido) return 500;
  if (distancia < 15) return 100;
  if (distancia < 35) return 200;
  return 500;
}

// ---------------------------------------------------------------------------
// TelaViva: a peça 3D de uma tela (plano + textura + material) e o estado de
// desenho (modo, próximo instante autorizado). Nascida por Telas.criar.

export class TelaViva {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  readonly textura: THREE.CanvasTexture;
  readonly material: THREE.MeshBasicMaterial;
  readonly semente: number;

  // Estado de redesenho: `proximo` é o instante (agora em ms) a partir do qual a
  // tela pode redesenhar de novo; Infinity = congelada (modo off ou tela muito longe).
  proximo: number;
  // Com reduced motion, todo desenho passa t=0 (alert âmbar fixo, §3 regra 6).
  readonly reduzem: boolean;

  private ctx: CanvasRenderingContext2D;
  private w: number;
  private h: number;
  private modo: ModoTela = 'off';
  private pai: THREE.Object3D;
  // Avisa o dono (Telas) para tirar esta tela da lista de redesenho ao descartar.
  aoDescartar: (() => void) | null = null;

  constructor(o: {
    pai: THREE.Object3D;
    pos: THREE.Vector3;
    rotY: number;
    larg: number;
    alt: number;
    px: number;
    py: number;
    semente: number;
    reduzido: boolean;
  }) {
    this.pai = o.pai;
    this.w = o.px;
    this.h = o.py;
    this.semente = o.semente;
    this.reduzem = o.reduzido;

    // Canvas do tamanho lógico (sem escalar no desenho, §2.3); a textura amplia
    // com NearestFilter para manter o pixel nítido de perto e mipmaps de longe.
    const canvas = document.createElement('canvas');
    canvas.width = o.px;
    canvas.height = o.py;
    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

    this.textura = new THREE.CanvasTexture(canvas);
    // O que §3 exige: cor sRGB, nearest na aproximação, mipmaps lineares para
    // evitar cintilar de longe.
    this.textura.colorSpace = THREE.SRGBColorSpace;
    this.textura.magFilter = THREE.NearestFilter;
    this.textura.minFilter = THREE.LinearMipmapLinearFilter;
    this.textura.generateMipmaps = true;

    // polygonOffset -2/-2: o plano nasce à frente da caixa `tela` do montador e o
    // deslocamento impede z-fighting (risco do plano, §8).
    this.material = new THREE.MeshBasicMaterial({
      map: this.textura,
      toneMapped: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    const plano = new THREE.Mesh(new THREE.PlaneGeometry(o.larg, o.alt), this.material);
    plano.position.copy(o.pos);
    plano.rotation.y = o.rotY;
    plano.renderOrder = 1; // desenhado depois dos móveis, reforçando a sobreposição
    this.pai.add(plano);
    this.mesh = plano;
    this.proximo = 0; // o 1º redesenho vem do próximo atualizar, pela distância real
  }

  // Troca o modo (§3, regra 4): `off` desenha 1× com t=0 e congela
  // (proximo = Infinity); nos demais, libera o desenho no próximo quadro.
  definirModo(modo: ModoTela, agora: number): void {
    if (modo === this.modo) return;
    this.modo = modo;
    if (modo === 'off') {
      desenharTela(this.ctx, 'off', 0, this.semente, this.w, this.h);
      this.textura.needsUpdate = true;
      this.proximo = Infinity;
    } else {
      this.proximo = 0; // o atualizar desenha e agenda o intervalo pela distância
    }
  }

  // Redesenha agora e agenda o próximo instante pelo intervalo de distância.
  // `distancia` é câmera→tela; com reduced motion o desenho usa t=0 sempre.
  // `mult` vem do orçamento de desempenho (orcamento.ts): 1 = intervalo normal.
  redesenhar(agora: number, distancia: number, mult = 1): void {
    desenharTela(this.ctx, this.modo, this.reduzem ? 0 : agora, this.semente, this.w, this.h);
    this.textura.needsUpdate = true;
    this.proximo = agora + intervaloDaTela(distancia, this.reduzem) * mult;
  }

  // Descarta tudo (fileira desmontada, §3, regra 7).
  dispose(): void {
    this.textura.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
    this.pai.remove(this.mesh);
    this.aoDescartar?.();
  }
}

// ---------------------------------------------------------------------------
// Telas: dono das TelasVivas — cria, lê a preferência de movimento reduzido 1×
// no nascimento e faz o orçamento de redesenho por quadro em `atualizar`.

export class Telas {
  readonly reduzido: boolean;
  private telas: TelaViva[] = [];

  // Reaproveitamento por quadro: o frustum é a única leitura nova; matriz, esfera
  // (raio 0,6 m, §3, regra 2) e vetor são reciclados aqui.
  private frustum = new THREE.Frustum();
  private mat4 = new THREE.Matrix4();
  private esfera = new THREE.Sphere(new THREE.Vector3(), 0.6);
  private centro = new THREE.Vector3();

  constructor() {
    // prefers-reduced-motion lida 1× na criação; sem matchMedia (ambiente sem
    // DOM) cai em `false` — o plano pede try/catch exatamente para isso.
    try {
      this.reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      this.reduzido = false;
    }
  }

  // Monta uma tela viva sob `pai` e já desenha o 1º quadro (t=0, modo `off`
  // herdado do nascimento); o agendamento do próximo vem do atualizar.
  criar(o: {
    pai: THREE.Object3D;
    pos: THREE.Vector3;
    rotY: number;
    larg: number;
    alt: number;
    px: number;
    py: number;
    semente: number;
  }): TelaViva {
    const tela = new TelaViva({ ...o, reduzido: this.reduzido });
    this.telas.push(tela);
    tela.redesenhar(0, 10); // 1º quadro (modo off) já na textura
    tela.proximo = Infinity; // off não redesenha: só definirModo acorda a tela
    tela.aoDescartar = () => { this.telas = this.telas.filter((x) => x !== tela); };
    return tela;
  }

  /** Telas ligadas dentro do campo da câmera no último atualizar (ritmo.ts: há vida à vista?). */
  vivasAVista = 0;

  // Orçamento do quadro (§3, regras 1–5): frustum 1×; só redesenha tela
  // visível, de andar não cortado (pos.y ≤ PLANO_CORTE.constant), com a esfera
  // de 0,6 m no centro dela dentro do frustum e `agora >= proximo`; máx. 8.
  // `orc` (opcional) é o orçamento de desempenho: teto por quadro, multiplicador de intervalo e,
  // com zoom, um multiplicador extra para as telas a mais de `raio` do `foco`. Sem ele = regra de sempre.
  atualizar(agora: number, camera: THREE.Camera, orc?: OrcamentoTelas): void {
    this.mat4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.mat4);
    const teto = orc?.teto ?? 8;

    let feitos = 0;
    this.vivasAVista = 0;
    for (const tela of this.telas) {
      if (tela.proximo === Infinity) continue; // desligada ou congelada: não redesenha nem conta como viva
      if (!tela.mesh.visible) continue; // cortado por andar (cortarArvore) ou oculto
      tela.mesh.getWorldPosition(this.centro);
      if (this.centro.y > PLANO_CORTE.constant) continue; // andar acima do corte
      this.esfera.center.copy(this.centro);
      if (!this.frustum.intersectsSphere(this.esfera)) continue; // fora da câmera
      this.vivasAVista++;
      if (feitos >= teto) continue; // teto: o resto fica para o quadro seguinte (segue só contando)
      if (agora < tela.proximo) continue; // ainda no intervalo de redesenho
      const dist = camera.position.distanceTo(this.centro);
      let mult = orc?.mult ?? 1;
      if (orc && this.centro.distanceTo(orc.foco) > orc.raio) mult *= orc.multFora; // fora do foco do zoom
      tela.redesenhar(agora, dist, mult); // desenha e agenda o próximo por intervaloDaTela
      feitos++;
    }
  }
}

/** Orçamento das telas por quadro (o main mantém um objeto só e muda os campos quando o nível muda). */
export interface OrcamentoTelas {
  teto: number; // redesenhos por quadro
  mult: number; // multiplicador do intervalo de todas
  foco: THREE.Vector3; // alvo da câmera
  raio: number; // Infinity = sem zoom (ninguém fica "fora do foco")
  multFora: number; // multiplicador extra fora do foco
}
