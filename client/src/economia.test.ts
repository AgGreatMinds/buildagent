// Testes da aplicação 3D do orçamento (sem WebGL): pessoa fora da vista anima com menos passos
// mas sem perder tempo; balão some fora do foco do zoom; descarte respeita material compartilhado.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Economia } from './economia';
import { parametros } from './orcamento';
import { liberarArvore, marcarCompartilhado } from './liberar';

// Câmera em (0,5,20) olhando a origem; alvo dos controles na origem.
function cena(zoom = false) {
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1200);
  camera.position.set(0, 5, 20);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const alvo = new THREE.Vector3(0, 0, 0);
  const eco = new Economia(parametros('cheio', zoom, false), alvo);
  const pessoa = (x: number, y: number, z: number) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.updateMatrixWorld();
    return g;
  };
  return { camera, eco, pessoa };
}

describe('Economia.dtDe', () => {
  it("'cheio' sem zoom: pessoa na vista anima todo quadro com o dt do quadro", () => {
    const { camera, eco, pessoa } = cena();
    const p = pessoa(0, 0, 0);
    for (let i = 0; i < 10; i++) {
      eco.iniciarQuadro(camera);
      expect(eco.dtDe(p, 0.016)).toBe(0.016);
    }
  });
  it('fora do frustum: anima 1 a cada N quadros e o tempo total é preservado', () => {
    const { camera, eco, pessoa } = cena();
    const p = pessoa(0, 0, 200); // atrás da câmera
    let total = 0, chamadas = 0;
    const N = parametros('cheio', false, false).pessoaForaCada;
    for (let i = 0; i < N * 10; i++) {
      eco.iniciarQuadro(camera);
      const d = eco.dtDe(p, 0.01);
      if (d > 0) { chamadas++; total += d; }
    }
    expect(chamadas).toBe(10);
    expect(total).toBeCloseTo(0.01 * N * 10, 9); // nada do tempo some: a posição chega ao mesmo lugar
  });
  it('oculta (banheiro) conta como fora da vista', () => {
    const { camera, eco, pessoa } = cena();
    const p = pessoa(0, 0, 0);
    p.visible = false;
    let chamadas = 0;
    for (let i = 0; i < 8; i++) { eco.iniciarQuadro(camera); if (eco.dtDe(p, 0.01) > 0) chamadas++; }
    expect(chamadas).toBe(2);
  });
  it('com zoom: na vista mas longe do alvo anima a menos da taxa', () => {
    const { camera, eco, pessoa } = cena(true);
    const perto = pessoa(1, 0, 1), longe = pessoa(-25, 0, -25);
    let nPerto = 0, nLonge = 0;
    for (let i = 0; i < 12; i++) {
      eco.iniciarQuadro(camera);
      if (eco.dtDe(perto, 0.01) > 0) nPerto++;
      if (eco.dtDe(longe, 0.01) > 0) nLonge++;
    }
    expect(nPerto).toBe(12);
    expect(nLonge).toBe(12 / parametros('cheio', true, false).pessoaLongeCada);
  });
});

describe('Economia.balao', () => {
  it('sem zoom só a distância da câmera manda; com zoom, também o foco', () => {
    const sem = cena(false), com = cena(true);
    const longeDoAlvo = sem.pessoa(-25, 0, -25);
    expect(sem.eco.balao(longeDoAlvo, 30)).toBe(true);
    expect(sem.eco.balao(longeDoAlvo, 40)).toBe(false); // mesmo limite de 40 m de antes
    expect(com.eco.balao(longeDoAlvo, 30)).toBe(false);
    expect(com.eco.balao(com.pessoa(1, 0, 1), 10)).toBe(true);
  });
});

describe('liberarArvore', () => {
  it('descarta geometria, material próprio e textura; poupa material compartilhado', () => {
    const comum = new THREE.MeshStandardMaterial();
    marcarCompartilhado(comum);
    const tex = new THREE.Texture();
    const proprio = new THREE.MeshStandardMaterial({ map: tex });
    const geo = new THREE.BoxGeometry();
    const raiz = new THREE.Group();
    raiz.add(new THREE.Mesh(geo, [comum, proprio]));
    const descartados: string[] = [];
    comum.addEventListener('dispose', () => descartados.push('comum'));
    proprio.addEventListener('dispose', () => descartados.push('proprio'));
    tex.addEventListener('dispose', () => descartados.push('tex'));
    geo.addEventListener('dispose', () => descartados.push('geo'));
    liberarArvore(raiz);
    expect(descartados.sort()).toEqual(['geo', 'proprio', 'tex']);
  });
});
