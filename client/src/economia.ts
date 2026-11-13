// Aplicação 3D do orçamento (orcamento.ts decide; aqui só se aplica por quadro, sem alocar):
// - Economia: diz a cada pessoa quanto `dt` animar neste quadro (fora do frustum/longe/fora do foco
//   anima 1 a cada N quadros com o dt acumulado — a posição chega ao mesmo lugar, só com menos passos)
//   e se o balão pode aparecer. O Predio consulta pelo gancho `economia` (GanchoEconomia).
// - criarHudPerf: o mini-HUD de ?perf=1 (FPS, nível, draw calls, triângulos, texturas).
import * as THREE from 'three';
import type { EstadoOrcamento, Parametros } from './orcamento';

/** O que o Predio precisa do orçamento (predio.ts só conhece esta forma). */
export interface GanchoEconomia {
  readonly passoMs: number;
  /** dt a aplicar agora na animação desta pessoa (0 = pular este quadro; o tempo fica acumulado). */
  dtDe(obj: THREE.Object3D, dt: number): number;
  /** O balão desta pessoa pode aparecer? (`distCamera` já medida pelo Predio). */
  balao(obj: THREE.Object3D, distCamera: number): boolean;
}

export class Economia implements GanchoEconomia {
  private quadro = 0;
  private readonly acumulado = new WeakMap<THREE.Object3D, number>(); // dt guardado por pessoa pulada
  // Reaproveitados a cada quadro: nenhuma alocação no caminho quente.
  private readonly frustum = new THREE.Frustum();
  private readonly mat4 = new THREE.Matrix4();
  private readonly esfera = new THREE.Sphere(new THREE.Vector3(), 1.3); // corpo inteiro (1,8 m) + etiqueta
  private readonly pos = new THREE.Vector3();
  private camera: THREE.Camera | null = null;
  /** Pessoas dentro do campo da câmera desde o último iniciarQuadro (ritmo.ts: há vida à vista?). */
  aVista = 0;

  constructor(public p: Parametros, private readonly alvo: THREE.Vector3) {}

  get passoMs() { return this.p.passoMs; }

  /** 1× por quadro, antes do Predio: frustum da câmera (matrizes do quadro anterior bastam para LOD). */
  iniciarQuadro(camera: THREE.Camera) {
    this.camera = camera;
    this.mat4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.mat4);
    this.quadro++;
    this.aVista = 0;
  }

  // De quantos em quantos quadros esta pessoa anima: 1 = todo quadro.
  private cadaDe(obj: THREE.Object3D): number {
    if (!this.camera) return 1;
    if (!obj.visible) return this.p.pessoaForaCada; // oculta (banheiro): ninguém vê
    // Posição de agora, não a matriz do último desenho: com a tela parada ninguém desenha, e quem
    // entrava andando no campo da câmera não era notado (a tela ficava congelada).
    obj.getWorldPosition(this.pos);
    this.esfera.center.set(this.pos.x, this.pos.y + 0.9, this.pos.z);
    if (!this.frustum.intersectsSphere(this.esfera)) return this.p.pessoaForaCada;
    this.aVista++;
    if (this.camera.position.distanceTo(this.pos) > this.p.longe) return this.p.pessoaLongeCada;
    if (this.pos.distanceTo(this.alvo) > this.p.raioFoco) return this.p.pessoaLongeCada;
    return 1;
  }

  dtDe(obj: THREE.Object3D, dt: number): number {
    const cada = this.cadaDe(obj);
    const guardado = this.acumulado.get(obj) ?? 0;
    // Escalona pelo id do objeto: as pessoas puladas não animam todas no mesmo quadro.
    if (cada <= 1 || (this.quadro + obj.id) % cada === 0) {
      if (guardado) this.acumulado.delete(obj);
      return dt + guardado;
    }
    this.acumulado.set(obj, guardado + dt);
    return 0;
  }

  balao(obj: THREE.Object3D, distCamera: number): boolean {
    if (distCamera >= this.p.balaoMax) return false;
    if (this.p.raioFoco === Infinity) return true;
    obj.getWorldPosition(this.pos);
    return this.pos.distanceTo(this.alvo) <= this.p.raioFoco; // com zoom: só o balão de quem está no foco
  }
}

/**
 * Mini-HUD de medição (?perf=1). Desligado por padrão: o main só cria quando o parâmetro existe,
 * então sem ele não há elemento nem trabalho. O main chama a função a cada quadro DESENHADO; o texto
 * é atualizado 2×/s por um relógio próprio, para mostrar "0 quadros/s" quando o laço não desenha.
 */
export function criarHudPerf(renderer: THREE.WebGLRenderer): (msMedio: number, orc: EstadoOrcamento) => void {
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);margin:0;padding:6px 10px;z-index:50;'
    + 'font:11px/1.35 ui-monospace,Menlo,monospace;color:#d8ffe0;background:rgba(0,0,0,.72);border-radius:6px;pointer-events:none;white-space:pre';
  document.body.append(el);
  let total = 0; // quadros desenhados desde a abertura
  let noIntervalo = 0;
  let ms = 0;
  let estado: EstadoOrcamento | null = null;
  let maxCalls = 0; // o quadro com sombra tem mais chamadas: mostra o pior do intervalo
  let tris = 0;
  setInterval(() => {
    const m = renderer.info.memory;
    el.textContent = `frames/s ${noIntervalo * 2}  total ${total}  (${ms.toFixed(1)} ms)  level ${estado?.nivel ?? '-'}${estado?.zoom ? ' +zoom' : ''}`
      + `  dpr ${renderer.getPixelRatio()}\ncalls ${maxCalls}  tris ${tris}  tex ${m.textures}  geo ${m.geometries}`;
    noIntervalo = 0;
    maxCalls = 0;
  }, 500);
  return (msMedio, orc) => {
    total++;
    noIntervalo++;
    ms = msMedio;
    estado = orc;
    const r = renderer.info.render; // lido depois do render: inclui o passe de sombra
    if (r.calls >= maxCalls) { maxCalls = r.calls; tris = r.triangles; }
  };
}
