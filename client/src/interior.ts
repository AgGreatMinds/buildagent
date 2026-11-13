// Interior do prédio: lobby no térreo e operação no andar 1.
// Tudo por código e mesclado por material: cada material vira UMA chamada de desenho, então o interior inteiro custa pouco.
// Convenção: metros; x −24…24, z −16…16; +z = fachada/praça. Térreo y=0, andar 1 y=6.
import { MESAS_POR_LADO, type PosFileira } from './mesas';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { emissivos } from './mobiliario';
import { carregarLogo } from './logo';
import { lerNomeDoPredio, placaNome } from './placa';
import { marcarCompartilhado } from './liberar';

// ---------- Materiais compartilhados ----------
const std = (c: number, r = 0.6, m = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...extra });
const emissivo = (cor: number) => {
  const m = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, emissive: cor, emissiveIntensity: 0.35 });
  emissivos.push(m);
  return m;
};

function texturaSombra(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.42)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export const MAT = {
  carvalho: std(0xc8a27a, 0.55),
  aco: std(0x1b1f25, 0.4, 0.7),
  inox: std(0xa7adb2, 0.3, 0.85),
  branco: std(0xe9e7e2, 0.8),
  grafite: std(0x2b2e33, 0.5, 0.15),
  pedra: std(0xd9d2c5, 0.45),
  tecido: std(0xffffff, 0.95, 0, { vertexColors: true }),
  folha: std(0xffffff, 0.9, 0, { vertexColors: true, flatShading: true }),
  tinta: std(0xffffff, 0.9, 0, { vertexColors: true }),
  tela: new THREE.MeshStandardMaterial({ color: 0x0c1118, emissive: 0x3a7bd5, emissiveIntensity: 0.55 }),
  luz: emissivo(0xfff1d6),
  luzMarca: emissivo(0x69c1c4),
  vidro: new THREE.MeshPhysicalMaterial({ color: 0xbfd8e2, transparent: true, opacity: 0.2, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }),
  sombra: new THREE.MeshBasicMaterial({ map: texturaSombra(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
};
type Mat = keyof typeof MAT;
marcarCompartilhado(...Object.values(MAT)); // todas as fileiras e móveis usam estes: liberarArvore não descarta


// ---------- Texturas de piso e forro ----------
export function texturaPedra(L: number, P: number): THREE.MeshStandardMaterial {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  const tons = ['#b9b0a0', '#b3aa9a', '#bdb4a4', '#b6ad9d'];
  for (let i = 0; i < 4; i++) {
    g.fillStyle = tons[i];
    g.fillRect((i % 2) * 256, Math.floor(i / 2) * 128, 256, 128);
  }
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(110,98,80,${Math.random() * 0.07})`;
    g.fillRect(Math.random() * 512, Math.random() * 256, 2, 1);
  }
  g.strokeStyle = 'rgba(90,80,64,0.45)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 510, 254);
  g.beginPath();
  g.moveTo(256, 0); g.lineTo(256, 256);
  g.moveTo(0, 128); g.lineTo(512, 128);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(L / 2.4, P / 1.2);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.38, metalness: 0.04 });
}

export function texturaRipado(L: number, P: number): THREE.MeshStandardMaterial {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3a2e22';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = i % 2 ? '#b8915f' : '#c19a68';
    g.fillRect(i * 32 + 3, 0, 26, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(L / 0.5, P / 0.5);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: 0x6a5236, emissiveIntensity: 0.9 });
}

// ---------- Montador: junta primitivas por material em geometrias únicas ----------
export class Montador {
  private lotes = new Map<Mat, THREE.BufferGeometry[]>();
  private M = new THREE.Matrix4();
  private pilha: THREE.Matrix4[] = [];

  // Entra em um sistema de coordenadas local (posição + giro em Y); `fim()` volta ao anterior.
  local(x: number, y: number, z: number, rotY = 0) {
    this.pilha.push(this.M.clone());
    this.M.multiply(new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z));
    return this;
  }
  fim() {
    this.M = this.pilha.pop()!;
  }

  private juntar(mat: Mat, g: THREE.BufferGeometry, x: number, y: number, z: number, rotY: number, cor?: number | THREE.Color) {
    const geo = g.index ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    const n = geo.attributes.position.count;
    const c = new THREE.Color(cor ?? 0xffffff);
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    geo.rotateY(rotY);
    geo.translate(x, y, z);
    geo.applyMatrix4(this.M);
    if (!this.lotes.has(mat)) this.lotes.set(mat, []);
    this.lotes.get(mat)!.push(geo);
  }

  // Caixa com a base em y.
  caixa(mat: Mat, w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0, cor?: number | THREE.Color) {
    this.juntar(mat, new THREE.BoxGeometry(w, h, d), x, y + h / 2, z, rotY, cor);
  }
  cil(mat: Mat, rt: number, rb: number, h: number, x: number, y: number, z: number, cor?: number | THREE.Color, seg = 14) {
    this.juntar(mat, new THREE.CylinderGeometry(rt, rb, h, seg), x, y + h / 2, z, 0, cor);
  }
  esf(mat: Mat, r: number, x: number, yc: number, z: number, cor?: number | THREE.Color, sy = 1) {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.scale(1, sy, 1);
    this.juntar(mat, g, x, yc, z, 0, cor);
  }
  toro(mat: Mat, R: number, r: number, x: number, y: number, z: number) {
    const g = new THREE.TorusGeometry(R, r, 8, 28);
    g.rotateX(Math.PI / 2);
    this.juntar(mat, g, x, y, z, 0);
  }
  // Mancha de sombra de contato no piso (w × d).
  sombra(x: number, y: number, z: number, w: number, d: number) {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    this.juntar('sombra', g, x, y + 0.012, z, 0);
  }

  construir(): THREE.Group {
    const grupo = new THREE.Group();
    for (const [mat, lista] of this.lotes) {
      const mesh = new THREE.Mesh(mergeGeometries(lista, false)!, MAT[mat]);
      mesh.receiveShadow = mat !== 'sombra' && mat !== 'vidro';
      mesh.renderOrder = mat === 'sombra' ? 1 : 0;
      grupo.add(mesh);
      lista.forEach((g) => g.dispose());
    }
    return grupo;
  }
}

export function aleatorio(semente: number) {
  let s = semente >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// ---------- Peças ----------
export function cadeira(m: Montador, x: number, y: number, z: number, lado: number, cor = 0xbfc3c7) {
  m.local(x, y, z, 0);
  m.cil('aco', 0.25, 0.25, 0.04, 0, 0.06, 0, undefined, 5); // base em estrela (simplificada)
  m.cil('aco', 0.03, 0.03, 0.34, 0, 0.1, 0);
  m.caixa('tecido', 0.5, 0.08, 0.48, 0, 0.44, 0, 0, cor);
  m.caixa('tecido', 0.46, 0.5, 0.07, 0, 0.56, lado * 0.23, 0, cor);
  m.sombra(0, 0, 0, 0.9, 0.9);
  m.fim();
}

export function mesaTrabalho(m: Montador, x: number, y: number, z: number, lado: number) {
  m.local(x, y, z, 0);
  m.caixa('carvalho', 1.7, 0.05, 0.8, 0, 0.72, 0);
  for (const s of [-1, 1]) m.caixa('branco', 0.04, 0.72, 0.7, s * 0.78, 0, 0);
  m.caixa('branco', 1.5, 0.3, 0.02, 0, 0.4, -lado * 0.3); // painel frontal
  // Monitor (costas grafite + tela acesa voltada ao assento) e teclado.
  m.caixa('grafite', 0.2, 0.02, 0.15, 0, 0.77, lado * 0.1);
  m.caixa('grafite', 0.04, 0.2, 0.04, 0, 0.78, lado * 0.1);
  m.caixa('grafite', 0.62, 0.38, 0.03, 0, 0.98, lado * 0.1);
  m.caixa('tela', 0.58, 0.34, 0.006, 0, 1.0, lado * 0.1 + lado * 0.02);
  m.caixa('grafite', 0.42, 0.015, 0.14, 0, 0.775, lado * 0.27);
  m.sombra(0, 0, 0, 2.2, 1.3);
  m.fim();
}

export function planta(m: Montador, x: number, y: number, z: number, esc = 1) {
  m.local(x, y, z, 0);
  m.cil('branco', 0.3 * esc, 0.24 * esc, 0.55 * esc, 0, 0, 0);
  const verdes = [0x2f6b3a, 0x3f8a49, 0x24562f];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    m.esf('folha', 0.3 * esc, Math.cos(a) * 0.2 * esc, (0.95 + (i % 3) * 0.26) * esc, Math.sin(a) * 0.2 * esc, verdes[i % 3], 1.3);
  }
  m.sombra(0, 0, 0, 1.0 * esc, 1.0 * esc);
  m.fim();
}

export function arvore(m: Montador, x: number, y: number, z: number, esc = 1) {
  m.local(x, y, z, 0);
  m.cil('pedra', 0.55 * esc, 0.5 * esc, 0.7 * esc, 0, 0, 0, undefined, 18);
  m.cil('carvalho', 0.07 * esc, 0.1 * esc, 2.4 * esc, 0, 0.6 * esc, 0, 0x5a4331, 8);
  const v = [0x2f6b3a, 0x3f8a49, 0x4c9b52];
  [[0, 3.3, 0, 1.05], [0.5, 2.7, 0.2, 0.8], [-0.4, 3.0, -0.3, 0.8]].forEach(([dx, dy, dz, r], i) => m.esf('folha', r * esc, dx * esc, dy * esc, dz * esc, v[i % 3], 1.0));
  m.sombra(0, 0, 0, 2.4 * esc, 2.4 * esc);
  m.fim();
}

export function sofa(m: Montador, x: number, y: number, z: number, rotY: number, comp: number, cor: number, almofada = 0x69c1c4) {
  m.local(x, y, z, rotY);
  m.caixa('aco', comp, 0.12, 0.85, 0, 0, 0);
  m.caixa('tecido', comp, 0.34, 0.9, 0, 0.12, 0.02, 0, cor);
  m.caixa('tecido', comp, 0.5, 0.22, 0, 0.3, -0.36, 0, cor);
  for (const s of [-1, 1]) m.caixa('tecido', 0.2, 0.28, 0.9, s * (comp / 2 - 0.1), 0.34, 0.02, 0, cor);
  for (const s of [-1, 1]) m.caixa('tecido', 0.42, 0.38, 0.12, s * comp * 0.3, 0.46, -0.2, s * 0.15, almofada);
  m.sombra(0, 0, 0.1, comp + 0.8, 1.7);
  m.fim();
}

export function poltrona(m: Montador, x: number, y: number, z: number, rotY: number, cor: number) {
  m.local(x, y, z, rotY);
  m.caixa('aco', 0.78, 0.12, 0.78, 0, 0, 0);
  m.caixa('tecido', 0.78, 0.3, 0.78, 0, 0.12, 0, 0, cor);
  m.caixa('tecido', 0.78, 0.46, 0.18, 0, 0.3, -0.3, 0, cor);
  for (const s of [-1, 1]) m.caixa('tecido', 0.14, 0.24, 0.78, s * 0.32, 0.34, 0, 0, cor);
  m.sombra(0, 0, 0, 1.4, 1.4);
  m.fim();
}

export function mesaCentro(m: Montador, x: number, y: number, z: number, w = 1.3, d = 0.7, h = 0.4) {
  m.local(x, y, z, 0);
  m.caixa('carvalho', w, 0.05, d, 0, h, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.caixa('aco', 0.04, h, 0.04, sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06));
  m.fim();
}

export function banqueta(m: Montador, x: number, y: number, z: number) {
  m.cil('carvalho', 0.19, 0.19, 0.05, x, y + 0.72, z);
  m.cil('aco', 0.025, 0.025, 0.72, x, y, z, undefined, 8);
  m.cil('aco', 0.17, 0.17, 0.02, x, y, z, undefined, 10);
}

export function mesaRedonda(m: Montador, x: number, y: number, z: number, diam: number, h = 0.72) {
  m.cil('carvalho', diam / 2, diam / 2, 0.04, x, y + h, z, undefined, 24);
  m.cil('aco', 0.04, 0.04, h, x, y, z, undefined, 8);
  m.cil('aco', diam * 0.3, diam * 0.3, 0.02, x, y, z, undefined, 16);
  m.sombra(x, y, z, diam * 1.5, diam * 1.5);
}

export function cadeiraBistro(m: Montador, x: number, y: number, z: number, rotY: number) {
  m.local(x, y, z, rotY);
  m.caixa('aco', 0.04, 0.45, 0.04, -0.17, 0, -0.17);
  m.caixa('aco', 0.04, 0.45, 0.04, 0.17, 0, -0.17);
  m.caixa('aco', 0.04, 0.45, 0.04, -0.17, 0, 0.17);
  m.caixa('aco', 0.04, 0.45, 0.04, 0.17, 0, 0.17);
  m.caixa('carvalho', 0.42, 0.04, 0.42, 0, 0.45, 0);
  m.caixa('carvalho', 0.4, 0.3, 0.03, 0, 0.55, -0.2);
  m.fim();
}

export function estante(m: Montador, x: number, y: number, z: number, rotY: number) {
  const r = aleatorio(Math.round(Math.abs(x * 13 + z * 7 + y)));
  m.local(x, y, z, rotY);
  m.caixa('branco', 2.4, 1.8, 0.04, 0, 0, -0.18);
  for (const s of [-1, 1]) m.caixa('branco', 0.04, 1.8, 0.4, s * 1.18, 0, 0);
  const livros = [0x5d549e, 0x66a1d6, 0x69c1c4, 0xd9d2c5, 0xe8453c, 0x2b2e33, 0xf4b400];
  for (let n = 0; n < 4; n++) {
    m.caixa('branco', 2.4, 0.03, 0.4, 0, n * 0.55 + 0.02, 0);
    let px = -1.1;
    while (px < 1.05) {
      const w = 0.04 + r() * 0.05, h = 0.26 + r() * 0.2;
      m.caixa('tinta', w, h, 0.26, px + w / 2, n * 0.55 + 0.05, -0.02, 0, livros[Math.floor(r() * livros.length)]);
      px += w + 0.01 + (r() < 0.12 ? 0.25 : 0);
    }
  }
  m.fim();
}

export function floreira(m: Montador, x: number, y: number, z: number, w: number, d: number, cor: number, rotY = 0) {
  m.local(x, y, z, rotY);
  m.caixa('carvalho', w, 0.62, d, 0, 0, 0);
  m.caixa('tinta', w - 0.1, 0.02, d - 0.1, 0, 0.62, 0, 0, cor);
  const n = Math.max(2, Math.round(w / 0.55));
  for (let i = 0; i < n; i++) m.esf('folha', 0.26, -w / 2 + (i + 0.5) * (w / n), 0.82, 0, i % 2 ? 0x3f8a49 : 0x2f6b3a, 1.2);
  m.fim();
}

export function pilar(m: Montador, x: number, y: number, z: number, h: number) {
  m.cil('branco', 0.28, 0.28, h, x, y, z, undefined, 20);
}

function cabine(m: Montador, x: number, y: number, z: number) {
  m.local(x, y, z, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.caixa('aco', 0.05, 2.3, 0.05, sx * 0.58, 0, sz * 0.58);
  m.caixa('aco', 1.2, 0.06, 1.2, 0, 2.3, 0);
  m.caixa('tinta', 1.1, 1.4, 0.04, 0, 0.5, -0.55, 0, 0x66a1d6); // feltro azul
  m.caixa('carvalho', 0.9, 0.05, 0.4, 0, 0.5, -0.32);
  m.caixa('luz', 0.7, 0.03, 0.1, 0, 2.27, 0);
  m.fim();
}

// ---------- Pedaços de composição ----------
// Painel de canvas (tela de status / quadro): texto estático, sem dado inventado.
export function painel(titulo: string, subtitulo: string, w: number, h: number): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = Math.round(640 * (h / w));
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, c.width, c.height);
  gr.addColorStop(0, '#0d1620');
  gr.addColorStop(1, '#1b2740');
  g.fillStyle = gr;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#69c1c4';
  g.fillRect(24, 24, 6, c.height - 48);
  g.fillStyle = '#f2f5f8';
  g.font = '700 52px -apple-system, system-ui, sans-serif';
  g.fillText(titulo, 48, c.height / 2 - 6);
  g.fillStyle = 'rgba(242,245,248,.6)';
  g.font = '28px -apple-system, system-ui, sans-serif';
  g.fillText(subtitulo, 48, c.height / 2 + 44);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
  return mesh;
}

export interface Relogio { grupo: THREE.Group; hora: THREE.Object3D; minuto: THREE.Object3D }
function relogio(x: number, y: number, z: number): Relogio {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.05, 32), std(0xf5f3ef, 0.6));
  face.rotation.x = Math.PI / 2;
  const aro = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.03, 8, 32), MAT.aco);
  const ponteiro = (comp: number, esp: number) => {
    const p = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(esp, comp, 0.012), MAT.aco);
    b.position.y = comp / 2 - 0.03;
    p.add(b);
    p.position.z = 0.04;
    return p;
  };
  const hora = ponteiro(0.32, 0.035), minuto = ponteiro(0.48, 0.022);
  g.add(face, aro, hora, minuto);
  return { grupo: g, hora, minuto };
}
export function atualizarRelogio(r: Relogio, d = new Date()) {
  const m = d.getMinutes() + d.getSeconds() / 60;
  r.minuto.rotation.z = -(m / 60) * Math.PI * 2;
  r.hora.rotation.z = -(((d.getHours() % 12) + m / 60) / 12) * Math.PI * 2;
}

export function portaElevador(m: Montador, x: number, y: number, z: number) {
  m.caixa('grafite', 2.4, 3.2, 0.06, x, y, z - 0.01);
  m.caixa('inox', 1.04, 3.0, 0.05, x - 0.53, y, z + 0.02);
  m.caixa('inox', 1.04, 3.0, 0.05, x + 0.53, y, z + 0.02);
  m.caixa('luzMarca', 0.5, 0.1, 0.03, x, y + 3.35, z + 0.01);
}

// ---------- Prédio: partes que não mudam ----------
export interface Interior { relogios: Relogio[]; fim: () => void }

export function montarEstatico(cena: THREE.Scene, L: number, P: number, Y1: number): { relogios: Relogio[] } {
  const m = new Montador();
  const t = 0.0; // térreo
  const meiaP = P / 2;

  // Pilares (grade de 8 m, vão central livre) nos dois andares.
  for (const base of [t, Y1]) for (const x of [-16, -8, 8, 16]) for (const z of [0, 8]) pilar(m, x, base, z, 5.65);

  // Núcleo vertical único: elevadores na face sul, banheiros a leste, escada a oeste.
  m.caixa('branco', 16, 11.7, 6, 0, 0, -13);
  for (const base of [t, Y1]) {
    for (const x of [-3, 0, 3]) portaElevador(m, x, base, -9.97);
    // Banheiros na face leste (x = 8), escada na face oeste (x = −8).
    for (const z of [-14.8, -13, -11.2]) m.caixa('carvalho', 0.05, 2.1, 0.95, 8.03, base, z);
    m.caixa('grafite', 0.05, 2.2, 1.1, -8.03, base, -13);
  }

  // Entrada: caixilho de inox, marquise e capacho.
  for (const x of [-4.8, -2.4, 2.4, 4.8]) m.caixa('inox', 0.08, 3.2, 0.1, x, 0, meiaP);
  m.caixa('inox', 9.7, 0.2, 0.12, 0, 3.2, meiaP);
  for (const x of [-2.4, 2.4]) for (const s of [-1, 1]) m.caixa('inox', 0.03, 1.1, 0.04, x + s * 0.12, 1.0, meiaP + 0.07);
  m.caixa('aco', 10, 0.15, 3.5, 0, 3.4, meiaP + 1.75);
  m.caixa('grafite', 8, 0.03, 2.5, 0, 0.1, meiaP - 1.25);

  // ---- Térreo: balcão curvo de recepção (arco convexo para a porta), faixa de luz ciano ----
  const cx = -8, cz = -2.8, R = 7;
  const seg = 9, span = (68 / 180) * Math.PI;
  for (let i = 0; i < seg; i++) {
    const a = -span / 2 + ((i + 0.5) / seg) * span;
    const px = cx + R * Math.sin(a), pz = cz + R * Math.cos(a);
    const comp = (R * span) / seg + 0.05;
    m.caixa('pedra', comp, 1.1, 1.0, px, 0, pz, a);
    m.caixa('pedra', comp, 0.05, 1.25, px, 1.1, pz, a);
    m.caixa('luzMarca', comp, 0.03, 0.02, cx + (R + 0.52) * Math.sin(a), 0.12, cz + (R + 0.52) * Math.cos(a), a);
  }
  // Parede de logo em ripado envolvendo o pilar (−8, 0).
  m.caixa('carvalho', 10, 5.2, 0.6, -8, 0, 0);
  m.caixa('luzMarca', 8, 0.04, 0.03, -8, 0.06, 0.32);

  // Espera: tapete, dois sofás frente a frente, poltronas e mesa de centro.
  m.caixa('tinta', 5.2, 0.03, 4.4, -19.5, 0, 11, 0, 0xcdbf9f);
  sofa(m, -19.5, 0, 9.4, 0, 3, 0x8a5a3b, 0xe6e1d6);
  sofa(m, -19.5, 0, 12.6, Math.PI, 3, 0x8a5a3b, 0xe6e1d6);
  poltrona(m, -22.4, 0, 11, Math.PI / 2, 0x8a5a3b);
  poltrona(m, -16.6, 0, 11, -Math.PI / 2, 0x8a5a3b);
  mesaCentro(m, -19.5, 0, 11, 1.2, 0.7);

  // Catracas: 4 pedestais, 3 passagens (a do meio é o eixo livre).
  for (const x of [-3, -1, 1, 3]) {
    m.caixa('inox', 0.2, 1.0, 1.2, x, 0, -4);
    m.caixa('vidro', 0.02, 0.9, 0.8, x + (x < 0 ? 0.11 : -0.11), 0.1, -4);
  }

  // Café do lobby: balcão grafite com tampo de pedra, banquetas, mesas bistrô e banco em volta do pilar.
  m.caixa('grafite', 0.9, 1.05, 7, 21.8, 0, 10.5);
  m.caixa('pedra', 1.1, 0.05, 7.2, 21.6, 1.05, 10.5);
  m.caixa('grafite', 0.5, 2.0, 7, 23.7, 0, 10.5);
  for (const dz of [-1.2, 0, 1.2]) m.caixa('luz', 0.02, 0.02, 0.8, 23.4, 1.5 + (dz === 0 ? 0.3 : 0), 10.5 + dz * 2);
  for (let i = 0; i < 4; i++) banqueta(m, 20.55, 0, 8.4 + i * 1.3);
  for (const [x, z] of [[15, 12.2], [17.6, 12.2], [15, 14.4], [17.6, 14.4]]) {
    mesaRedonda(m, x, 0, z, 0.7, 0.72);
    cadeiraBistro(m, x - 0.5, 0, z, Math.PI / 2);
    cadeiraBistro(m, x + 0.5, 0, z, -Math.PI / 2);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    m.caixa('carvalho', 0.62, 0.46, 0.5, 16 + Math.cos(a) * 0.95, 0, 8 + Math.sin(a) * 0.95, -a);
  }
  // Pendentes: anel sobre o balcão e três globos sobre o café.
  m.toro('luz', 1.5, 0.05, -8, 4.6, 1.6);
  for (const dz of [-2, 0, 2]) {
    m.cil('aco', 0.008, 0.008, 1.8, 20.6, 4.1, 10.5 + dz, undefined, 4);
    m.esf('luz', 0.2, 20.6, 3.9, 10.5 + dz);
  }

  // Árvores e plantas do térreo.
  for (const [x, z] of [[5, 14], [-5, 14], [-22.5, 14.8], [22.5, -7], [-22.5, -7], [22.6, 14.5]]) arvore(m, x, 0, z, 1);
  for (const [x, z] of [[18, -12], [-18, -12], [12, 15], [20, 6]]) planta(m, x, 0, z, 1.5);

  // ---- Andar 1 ----
  const y = Y1;
  // Faixa oeste: sala de foco de vidro (−21, −12.5), estantes e verde.
  m.caixa('vidro', 5, 2.4, 0.03, -21, y, -9.5);
  m.caixa('vidro', 0.03, 2.4, 6, -18.5, y, -12.5);
  m.caixa('aco', 5, 0.05, 0.06, -21, y + 2.4, -9.5);
  m.caixa('aco', 0.06, 0.05, 6, -18.5, y + 2.4, -12.5);
  m.caixa('aco', 0.06, 2.4, 0.06, -18.5, y, -9.5);
  m.caixa('tinta', 3.6, 0.03, 3.4, -21, y, -12.8, 0, 0x8c96a3);
  mesaTrabalho(m, -22, y, -14.5, 1);
  cadeira(m, -22, y, -13.6, 1, 0x5d549e);
  planta(m, -19.3, y, -15.2, 1.2);
  for (const z of [-6, -1, 4, 9]) estante(m, -23.4, y, z, Math.PI / 2);
  for (const z of [-3.5, 1.5, 6.5]) planta(m, -23.1, y, z, 1.1);
  arvore(m, -22.5, y, 14.5, 1);

  // Lounge (15, −10): sofás roxos da marca, poltronas, mesa de centro, tapete e árvores.
  m.caixa('tinta', 9, 0.03, 6, 15, y, -10, 0, 0x4a5e54);
  sofa(m, 15, y, -12.4, 0, 3.2, 0x5d549e);
  sofa(m, 11.4, y, -9.6, Math.PI / 2, 2.2, 0x5d549e, 0x66a1d6);
  sofa(m, 18.6, y, -9.6, -Math.PI / 2, 2.2, 0x5d549e, 0x66a1d6);
  poltrona(m, 13.4, y, -7.8, Math.PI, 0xe6e1d6);
  poltrona(m, 16.6, y, -7.8, Math.PI, 0xe6e1d6);
  mesaCentro(m, 15, y, -9.8);
  arvore(m, 20.5, y, -13.4, 0.9);
  arvore(m, 10, y, -13.6, 0.9);

  // Cabines telefônicas e divisória verde.
  cabine(m, 21.6, y, -15.1);
  cabine(m, 23, y, -15.1);
  for (const x of [18, 20, 22]) floreira(m, x, y, -3, 1.6, 0.5, 0x66a1d6);

  // Bancada de pé e mesa colaborativa alta.
  m.caixa('carvalho', 5, 0.05, 0.8, 12, y + 1.0, 4);
  for (const s of [-1, 1]) m.caixa('aco', 0.05, 1.0, 0.7, 12 + s * 2.3, y, 4);
  planta(m, 9.1, y, 4, 1.0);
  planta(m, 14.9, y, 4, 1.0);
  m.caixa('carvalho', 2.4, 0.05, 1.0, 20, y + 1.0, 4);
  for (const s of [-1, 1]) m.caixa('aco', 0.05, 1.0, 0.8, 20 + s * 1.1, y, 4);
  for (const dx of [-0.8, 0.8]) for (const dz of [-0.95, 0.95]) banqueta(m, 20 + dx, y, 4 + dz);
  m.sombra(12, y, 4, 5.6, 1.6);
  m.sombra(20, y, 4, 3, 1.8);

  // Copa (17, 11.5): balcão com geladeira e máquina de café, banquetas, bar de janela, mesa redonda.
  m.caixa('grafite', 6, 0.95, 0.7, 17, y, 9.4);
  m.caixa('pedra', 6.1, 0.05, 0.8, 17, y + 0.95, 9.4);
  m.caixa('inox', 1.4, 2.0, 0.65, 13.4, y, 9.4);
  m.caixa('inox', 0.35, 0.4, 0.35, 18.6, y + 1.0, 9.4);
  for (let i = -2; i <= 2; i++) banqueta(m, 17 + i * 1.0, y, 10.6);
  m.caixa('carvalho', 11, 0.05, 0.5, 17, y + 1.0, 15.2);
  for (const x of [11.7, 17, 22.3]) m.caixa('aco', 0.05, 1.0, 0.45, x, y, 15.2);
  for (let i = 0; i < 6; i++) banqueta(m, 12.5 + i * 1.8, y, 14.5);
  mesaRedonda(m, 13, y, 12.3, 0.9, 0.72);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    cadeiraBistro(m, 13 + Math.cos(a) * 0.75, y, 12.3 + Math.sin(a) * 0.75, -a + Math.PI / 2);
  }
  arvore(m, 22.6, y, 12, 0.9);
  m.sombra(17, y, 9.7, 6.6, 1.8);

  // Impressora e armário junto ao núcleo.
  m.caixa('branco', 1.4, 1.0, 0.5, 6.2, y, -10.4);
  m.caixa('grafite', 0.8, 0.12, 0.4, 6.2, y + 1.0, -10.4);

  // Luminárias lineares penduradas (corrigidas: y é a altura de cada piso, não o z).
  const luzLinear = (x: number, yy: number, z: number, comp: number) => {
    m.caixa('luz', comp, 0.05, 0.14, x, yy, z);
    for (const s of [-1, 1]) m.caixa('aco', 0.012, 1.0, 0.012, x + s * (comp / 2 - 0.2), yy + 0.05, z);
  };
  for (const x of [-2, 6, 14, 22]) for (const z of [-6, 2, 10]) {
    if (x === 14 && z === 10) continue; // copa tem os seus pendentes
    luzLinear(x, Y1 + 4.6, z, 3);
  }
  for (const x of [-3, 0, 3]) luzLinear(x, 3.9, 5, 3.2); // faixas do lobby sobre o eixo de entrada

  cena.add(m.construir());

  // ---- Peças soltas (texturas e ponteiros) ----
  const relogios: Relogio[] = [];
  for (const base of [Y1]) {
    const r = relogio(0, base + 4.3, -9.94);
    cena.add(r.grupo);
    relogios.push(r);
  }
  const presenca = painel('PRESENÇA', 'quem está no prédio agora', 3.2, 2.0);
  presenca.position.set(-6.2, 2.4, -9.96);
  const status = painel('ANDAR 1 · OPERAÇÃO', 'agentes por projeto', 3.2, 2.0);
  status.position.set(-6.2, Y1 + 2.4, -9.96);
  cena.add(presenca, status);

  // Logo na parede de ripado do lobby.
  THREE.DefaultLoadingManager.itemStart('local/logo:lobby'); // mesmo aviso da fachada: um quadro quando a logo entra
  Promise.all([carregarLogo('/local/logo.svg', 3), lerNomeDoPredio()]).then(([logo, nome]) => {
    const alvo = logo ?? placaNome(nome, 4); // sem logo: placa com o nome do prédio
    alvo.position.set(-8, 3.3, 0.34);
    cena.add(alvo);
  }).finally(() => THREE.DefaultLoadingManager.itemEnd('local/logo:lobby'));

  return { relogios };
}

// ---------- Fileiras de projeto (dinâmicas) ----------
export interface Assento { pos: THREE.Vector3; olhar: number }
// Posição do plano de cada monitor (mesma ordem de `assentos`), para as telas vivas se encaixarem à frente da caixa `tela`.
export interface MonitorPos { pos: THREE.Vector3; rotY: number }
export interface FileiraPronta { grupo: THREE.Group; assentos: Assento[]; monitores: MonitorPos[]; placa: THREE.Object3D }

// Uma fileira = 3 mesas de cada lado, tapete e floreira na cor do projeto, 2 luminárias e a placa suspensa.
// `cor` vem do registro de cor-projeto.ts (corDaChave pela chave da fileira): a mesma do trilho da lista e do crachá.
export function montarFileira(pos: PosFileira, nome: string, cor: number, Y1: number): FileiraPronta {
  const m = new Montador();
  const { z0, x0 } = pos; // planta em mesas.ts (colunas × linhas)
  const tapeteCor = new THREE.Color(0xd9d2c5).lerp(new THREE.Color(cor), 0.35);
  const assentos: Assento[] = [];
  const monitores: MonitorPos[] = [];
  const n = MESAS_POR_LADO;
  m.caixa('tinta', n * 2.1 + 1.0, 0.03, 3.6, x0 + (n - 1) * 1.05, Y1, z0, 0, tapeteCor);
  for (const lado of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * 2.1, z = z0 + lado * 0.5;
      mesaTrabalho(m, x, Y1 + 0.03, z, lado);
      cadeira(m, x, Y1 + 0.03, z + lado * 0.95, lado);
      assentos.push({ pos: new THREE.Vector3(x, Y1, z + lado * 0.95), olhar: lado > 0 ? Math.PI : 0 });
      // Caixa `tela` fica em y 1,0 sobre a mesa (Y1+0,03) e z = lado*0,12; a face tem 3 mm: o plano vai 1,5 mm à frente dela.
      monitores.push({ pos: new THREE.Vector3(x, Y1 + 1.03, z + lado * 0.1245), rotY: lado > 0 ? 0 : Math.PI });
    }
    // Luminária da fileira com filete na cor do projeto.
    m.caixa('luz', n * 2.1 - 0.3, 0.05, 0.12, x0 + (n - 1) * 1.05, Y1 + 2.7, z0 + lado * 0.55);
    m.caixa('tinta', n * 2.1 - 0.3, 0.015, 0.05, x0 + (n - 1) * 1.05, Y1 + 2.76, z0 + lado * 0.55, 0, cor);
    for (const s of [-1, 1]) m.caixa('aco', 0.01, 3.2, 0.01, x0 + (n - 1) * 1.05 + s * ((n * 2.1 - 0.3) / 2 - 0.2), Y1 + 2.75, z0 + lado * 0.55);
  }
  floreira(m, x0 - 1.4, Y1, z0, 0.5, 3.4, cor, Math.PI / 2);

  const grupo = m.construir();
  const placa = placaNome(nome, 4.2);
  placa.position.set(x0 + 2.1, Y1 + 3.4, z0);
  grupo.add(placa);
  return { grupo, assentos, monitores, placa };
}
