// Logo 3D: lê um SVG local (arquivo do próprio usuário, fora do repositório público), extruda em relevo e pinta com o
// gradiente do relevo por vértice. Sem arquivo, o chamador usa a placa com o nome (fallback).
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';

const GRADIENTE = ['#69c1c4', '#66a1d6', '#5d549e'].map((c) => new THREE.Color(c));

// Cor do gradiente do relevo em t (0..1), em três paradas.
function corGradiente(t: number): THREE.Color {
  const x = Math.min(1, Math.max(0, t)) * 2;
  const i = Math.min(1, Math.floor(x));
  return GRADIENTE[i].clone().lerp(GRADIENTE[i + 1], x - i);
}

// Sanitização mínima: só aceita SVG sem script, sem referência externa e sem eventos (o desenho vem só de <path>).
export function svgSeguro(texto: string): boolean {
  return /<svg[\s>]/i.test(texto) && !/<script|javascript:|\son\w+\s*=|<foreignObject|<image|href\s*=\s*["']https?:/i.test(texto);
}

export async function carregarLogo(url: string, altura: number, profundidade = 0.25): Promise<THREE.Mesh | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const texto = await r.text();
    if (!svgSeguro(texto)) return null;
    // O SVG pinta com `fill="url(#gradiente)"`, que o SVGLoader não resolve (avisa no console
    // "url access…" e "Unknown color model"). A cor do path não é usada — o relevo é pintado
    // por vértice com GRADIENTE, abaixo —, então troca a referência pela 1ª parada da marca.
    const dados = new SVGLoader().parse(texto.replace(/url\(#[^)]*\)/g, `#${GRADIENTE[0].getHexString()}`));
    const geoms: THREE.BufferGeometry[] = [];
    for (const path of dados.paths) {
      for (const shape of SVGLoader.createShapes(path)) {
        geoms.push(new THREE.ExtrudeGeometry(shape, { depth: 40, bevelEnabled: false, curveSegments: 3 }));
      }
    }
    if (!geoms.length) return null;
    // Junta as peças em uma só geometria.
    const total = geoms.reduce((n, g) => n + g.getAttribute('position').count, 0);
    const pos = new Float32Array(total * 3);
    const idx: number[] = [];
    let off = 0;
    for (const g of geoms) {
      const p = g.getAttribute('position');
      pos.set(p.array as Float32Array, off * 3);
      const gi = g.getIndex();
      if (gi) for (let i = 0; i < gi.count; i++) idx.push(gi.getX(i) + off);
      else for (let i = 0; i < p.count; i++) idx.push(off + i);
      off += p.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    // SVG tem o eixo Y para baixo: espelha, centra e escala para a altura pedida (em metros).
    const esc = altura / (bb.max.y - bb.min.y);
    geo.translate(-(bb.max.x + bb.min.x) / 2, -(bb.max.y + bb.min.y) / 2, -20);
    geo.scale(esc, -esc, profundidade / 40);
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    const b2 = geo.boundingBox!;
    const cores = new Float32Array(total * 3);
    const arr = geo.getAttribute('position');
    for (let i = 0; i < arr.count; i++) {
      const c = corGradiente((arr.getX(i) - b2.min.x) / (b2.max.x - b2.min.x));
      cores.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.4, side: THREE.DoubleSide });
    return new THREE.Mesh(geo, mat);
  } catch {
    return null;
  }
}
