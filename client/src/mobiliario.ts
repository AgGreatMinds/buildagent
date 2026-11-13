// Mobiliário e acabamento do interior, tudo por código (leve, sem licença de terceiros e com a paleta sob controle).
// Referência de materiais: aço e vidro, concreto polido, madeira clara e verde dentro do prédio (estilo escritório de campus).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const mat = (cor: number, rug = 0.7, met = 0) => new THREE.MeshStandardMaterial({ color: cor, roughness: rug, metalness: met });
const caixa = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y + h / 2, z);
  o.castShadow = o.receiveShadow = true;
  return o;
};

// Materiais que acendem à noite (painéis de luz do teto, abajures): o main liga e desliga pela hora.
export const emissivos: THREE.MeshStandardMaterial[] = [];
const luz = (cor = 0xfff1d6) => {
  const m = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, emissive: cor, emissiveIntensity: 0.35 });
  emissivos.push(m);
  return m;
};

// Piso de concreto polido: ruído fino em canvas, repetido por todo o andar.
export function pisoPolido(L: number, P: number): THREE.MeshStandardMaterial {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#8f8d86';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    const v = 120 + Math.random() * 50;
    g.fillStyle = `rgba(${v},${v},${v - 4},0.18)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  g.strokeStyle = 'rgba(70,70,66,0.22)';
  g.lineWidth = 1;
  g.strokeRect(0.5, 0.5, 255, 255);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(L / 4, P / 4);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.42, metalness: 0.08 });
}

// Planta em vaso: vaso cilíndrico e folhagem de esferas achatadas em três tons de verde.
// Uma malha só, com a cor por vértice (antes eram 9 malhas = 9 chamadas de desenho por planta, mais 8 na sombra).
const MAT_PLANTA = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
export function planta(x: number, y: number, z: number, escala = 1): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const pintada = (geo: THREE.BufferGeometry, cor: number) => {
    const c = new THREE.Color(cor);
    const cores = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < cores.length; i += 3) cores.set([c.r, c.g, c.b], i);
    geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
    return geo;
  };
  const partes = [pintada(new THREE.CylinderGeometry(0.32 * escala, 0.26 * escala, 0.6 * escala, 14).translate(0, 0.3 * escala, 0), 0xe9e5dc)];
  const verdes = [0x2f6b3a, 0x3f8a49, 0x24562f];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const folha = new THREE.SphereGeometry(0.28 * escala, 10, 8).scale(1, 1.35, 1);
    folha.translate(Math.cos(a) * 0.22 * escala, (0.95 + (i % 3) * 0.28) * escala, Math.sin(a) * 0.22 * escala);
    partes.push(pintada(folha, verdes[i % 3]));
  }
  const malha = new THREE.Mesh(mergeGeometries(partes, false)!, MAT_PLANTA);
  for (const p of partes) p.dispose(); // as partes já foram copiadas para a malha única
  malha.castShadow = true;
  g.add(malha);
  return g;
}

// Sofá: base, encosto, braços e almofadas.
export function sofa(x: number, y: number, z: number, rotY: number, comp = 2.4, cor = 0x3d4a58): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const m = mat(cor, 0.92);
  g.add(caixa(comp, 0.42, 0.95, m, 0, 0.12, 0));
  g.add(caixa(comp, 0.55, 0.22, m, 0, 0.5, -0.38));
  g.add(caixa(0.2, 0.3, 0.95, m, -comp / 2 + 0.1, 0.5, 0));
  g.add(caixa(0.2, 0.3, 0.95, m, comp / 2 - 0.1, 0.5, 0));
  for (const s of [-1, 1]) g.add(caixa(0.45, 0.4, 0.14, mat(0xc9a35a, 0.95), s * comp * 0.28, 0.58, -0.2));
  return g;
}

// Mesa de centro com tampo claro e pés de aço.
export function mesaCentro(x: number, y: number, z: number, w = 1.3, d = 0.7): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(caixa(w, 0.05, d, mat(0xd8c8ae, 0.5), 0, 0.4, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(caixa(0.04, 0.4, 0.04, mat(0x1b1f25, 0.4, 0.7), sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06)));
  return g;
}

// Copa: balcão em L com tampo claro, máquina de café, banquetas e pendentes acesos à noite.
export function copa(x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const corpo = mat(0x2a2f38, 0.5, 0.15), tampo = mat(0xe6e1d6, 0.35);
  g.add(caixa(6, 0.9, 0.7, corpo, 0, 0, 0));
  g.add(caixa(6.1, 0.05, 0.8, tampo, 0, 0.9, 0));
  g.add(caixa(0.7, 0.9, 3, corpo, 2.65, 0, 1.85));
  g.add(caixa(0.8, 0.05, 3.1, tampo, 2.65, 0.9, 1.85));
  g.add(caixa(0.35, 0.4, 0.35, mat(0xc7ccd2, 0.25, 0.8), -1.2, 0.95, 0)); // máquina de café
  g.add(caixa(1.4, 0.95, 0.6, mat(0xb8bec6, 0.3, 0.7), 1.3, 0, -0.05)); // geladeira
  const banco = mat(0x1b1f25, 0.5, 0.6);
  for (let i = -2; i <= 2; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 14), mat(0xcfc4b0));
    b.position.set(i * 1.0, 0.75, 1.2);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 8), banco);
    p.position.set(i * 1.0, 0.37, 1.2);
    g.add(b, p);
  }
  for (const px of [-1.8, 0, 1.8]) {
    const pend = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.3, 16, 1, true), luz(0xffdcaa));
    pend.position.set(px, 2.5, 0.2);
    pend.material.side = THREE.DoubleSide;
    const fio = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.4, 4), mat(0x15171c));
    fio.position.set(px, 3.2, 0.2);
    g.add(pend, fio);
  }
  return g;
}

// Núcleo de serviço: bloco central com os banheiros (portas e identificação), em concreto claro.
export function nucleo(x: number, y: number, z: number, altura: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(caixa(7, altura, 5, mat(0xd7d4cc, 0.8), 0, 0, 0));
  for (const [i, nome] of ['WC', 'WC'].entries()) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const gc = c.getContext('2d')!;
    gc.fillStyle = '#20252c';
    gc.fillRect(0, 0, 128, 128);
    gc.fillStyle = '#f2f5f8';
    gc.font = '600 60px -apple-system, system-ui, sans-serif';
    gc.textAlign = 'center';
    gc.textBaseline = 'middle';
    gc.fillText(nome, 64, 68);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const porta = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.1, 0.06), mat(0x9a8566, 0.55));
    porta.position.set(-1.6 + i * 3.2, 1.05, 2.52);
    const placa = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.32), new THREE.MeshBasicMaterial({ map: t }));
    placa.position.set(-1.6 + i * 3.2, 2.35, 2.56);
    g.add(porta, placa);
  }
  return g;
}

// Luminárias lineares penduradas no teto da área de trabalho (acendem à noite).
export function luminarias(x0: number, z0: number, cols: number, linhas: number, dx: number, dz: number, y: number): THREE.Group {
  const g = new THREE.Group();
  const m = luz(0xfff4e0);
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, 0.06, 0.22), m, cols * linhas);
  const cabo = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.008, 0.008, 1.0, 4), mat(0x15171c), cols * linhas * 2);
  const o = new THREE.Object3D();
  let k = 0, c = 0;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < linhas; j++) {
      o.position.set(x0 + i * dx, y, z0 + j * dz);
      o.updateMatrix();
      im.setMatrixAt(k++, o.matrix);
      for (const s of [-1, 1]) {
        o.position.set(x0 + i * dx + s * 1.3, y + 0.5, z0 + j * dz);
        o.updateMatrix();
        cabo.setMatrixAt(c++, o.matrix);
      }
    }
  }
  g.add(im, cabo);
  return g;
}

// Coluna estrutural redonda em aço claro.
export function coluna(x: number, y: number, z: number, altura: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, altura, 20), mat(0xe6e6e2, 0.4, 0.3));
  m.position.set(x, y + altura / 2, z);
  m.castShadow = true;
  return m;
}

// Tapete retangular sob uma fileira de mesas (marca a área do projeto no piso).
export function tapete(x: number, y: number, z: number, w: number, d: number, cor = 0x6f7b88): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), mat(cor, 1));
  m.position.set(x, y + 0.015, z);
  m.receiveShadow = true;
  return m;
}
