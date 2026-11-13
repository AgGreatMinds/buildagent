// Cidade em volta do prédio: leve de propósito (poucas chamadas de desenho, tudo por instâncias).
// Prédios altos = caixas com janelas (textura de canvas); periferia = modelos CC0 do Kenney; carros e postes por instância.
// Só os carros se mexem, e só quando o chamador pede (modo "cidade"): com a câmera no prédio, a cidade fica parada.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Pseudo-aleatório fixo: a cidade é a mesma a cada carga (e na gravação).
function aleatorio(semente: number) {
  let s = semente >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const CORES_JANELA = ['#ffd9a0', '#ffc98a', '#fff1cf', '#ffe2b8', '#cfe0ff'];
// Textura de janelas: 8 colunas × 8 andares por ladrilho; uma versão de dia (vidro) e uma emissiva (luz acesa).
function janelas(): { mapa: THREE.CanvasTexture; luz: THREE.CanvasTexture } {
  const N = 8, C = 32; // ladrilho 8×8; o repeat em predios() usa 24 m por ladrilho
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = c.height = N * C;
    return c;
  };
  const cm = mk(), cl = mk();
  const gm = cm.getContext('2d')!, gl = cl.getContext('2d')!;
  gm.fillStyle = '#5f6d7c';
  gm.fillRect(0, 0, N * C, N * C);
  gl.fillStyle = '#000';
  gl.fillRect(0, 0, N * C, N * C);
  const r = aleatorio(7);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const aceso = r() < 0.3;
      gm.fillStyle = aceso ? '#8fa6bc' : '#3a4d63';
      gm.fillRect(x * C + 4, y * C + 5, C - 8, C - 10);
      if (aceso) {
        // Luz de verdade varia: cor (quente, neutra, tela fria) e força por janela, com o montante no meio.
        // Tudo no mesmo creme, no máximo, lia como papel colado flutuando no escuro.
        gl.fillStyle = CORES_JANELA[Math.floor(r() * CORES_JANELA.length)];
        gl.globalAlpha = 0.3 + r() * 0.6;
        gl.fillRect(x * C + 4, y * C + 5, C - 8, C - 10);
        gl.globalAlpha = 1;
        gl.fillStyle = '#000';
        gl.fillRect(x * C + C / 2 - 1, y * C + 5, 2, C - 10);
      }
    }
  }
  const t = (c: HTMLCanvasElement) => {
    const tx = new THREE.CanvasTexture(c);
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.anisotropy = 4;
    return tx;
  };
  return { mapa: t(cm), luz: t(cl) };
}

// Asfalto com faixa tracejada no centro e linhas de borda.
function texturaRua(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2b2f36';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#d9d9cf';
  g.fillRect(0, 3, 256, 2);
  g.fillRect(0, 59, 256, 2);
  g.fillStyle = '#e8c547';
  for (let x = 0; x < 256; x += 64) g.fillRect(x, 31, 36, 2);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Via { x: number; z: number; larg: number; comp: number; horizontal: boolean }
// Avenida da frente, avenida dos fundos e duas ruas laterais (em metros, centro em x/z).
const VIAS: Via[] = [
  { x: 0, z: 53, larg: 14, comp: 420, horizontal: true },
  { x: 0, z: -34, larg: 12, comp: 420, horizontal: true },
  { x: -46, z: 10, larg: 10, comp: 280, horizontal: false },
  { x: 46, z: 10, larg: 10, comp: 280, horizontal: false },
  { x: -100, z: 10, larg: 10, comp: 280, horizontal: false },
  { x: 100, z: 10, larg: 10, comp: 280, horizontal: false },
];

export class Cidade {
  readonly grupo = new THREE.Group();
  private materiaisJanela: THREE.MeshStandardMaterial[] = [];
  private cabecasPoste: THREE.MeshStandardMaterial;
  private carros: { x: number; z: number; v: number; eixoX: boolean; i: number }[] = [];
  private corpos!: THREE.InstancedMesh;
  private cabines!: THREE.InstancedMesh;
  private tmp = new THREE.Object3D();

  constructor(cena: THREE.Scene) {
    cena.add(this.grupo);
    this.ruas();
    this.predios();
    this.postes();
    this.cabecasPoste = (this.grupo.getObjectByName('postes') as THREE.InstancedMesh).material as THREE.MeshStandardMaterial;
    this.veiculos();
    this.parque();
    void this.periferia();
  }

  private ruas() {
    const tex = texturaRua();
    for (const v of VIAS) {
      const t = tex.clone();
      t.needsUpdate = true;
      t.repeat.set(v.comp / 16, 1);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(v.horizontal ? v.comp : v.larg, v.horizontal ? v.larg : v.comp), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
      if (!v.horizontal) {
        // Rua vertical: gira a textura para a faixa correr no sentido do comprimento.
        t.rotation = Math.PI / 2;
        t.center.set(0.5, 0.5);
        t.repeat.set(1, v.comp / 16);
      }
      m.rotation.x = -Math.PI / 2;
      m.position.set(v.x, 0.01, v.z);
      m.receiveShadow = true;
      this.grupo.add(m);
    }
  }

  private emVia(x: number, z: number, folga: number): boolean {
    return VIAS.some((v) =>
      v.horizontal ? Math.abs(z - v.z) < v.larg / 2 + folga : Math.abs(x - v.x) < v.larg / 2 + folga,
    );
  }

  // Prédios altos do centro: 6 faixas de altura, cada uma uma InstancedMesh (6 chamadas de desenho no total).
  private predios() {
    const { mapa, luz } = janelas();
    const faixas = [18, 30, 44, 60, 80, 105];
    const lotes: Map<number, THREE.Matrix4[]> = new Map(faixas.map((_, i) => [i, []]));
    const r = aleatorio(42);
    for (let x = -196; x <= 196; x += 15) {
      for (let z = -120; z <= 160; z += 15) {
        if (this.emVia(x, z, 5)) continue;
        if (Math.abs(x) < 42 && z > -26 && z < 50) continue; // terreno do prédio e da praça
        if (Math.abs(x) < 80 && z > 50 && z < 125) continue; // parque em frente ao prédio (vista de entrada e de drone)
        const dist = Math.hypot(x, z - 10);
        if (dist > 150) continue; // periferia fica com os modelos Kenney
        const falloff = Math.max(0.15, 1 - dist / 160);
        const alvo = (14 + r() * 100) * falloff + 8;
        const i = Math.min(faixas.length - 1, faixas.findIndex((h) => h >= alvo) === -1 ? faixas.length - 1 : faixas.findIndex((h) => h >= alvo));
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(x + (r() - 0.5) * 2, 0, z + (r() - 0.5) * 2),
          new THREE.Quaternion(),
          new THREE.Vector3(0.78 + r() * 0.2, 1, 0.78 + r() * 0.2),
        );
        lotes.get(i)!.push(m);
      }
    }
    faixas.forEach((h, i) => {
      const ms = lotes.get(i)!;
      if (!ms.length) return;
      const geo = new THREE.BoxGeometry(12, h, 12);
      geo.translate(0, h / 2, 0);
      const mapaI = mapa.clone(), luzI = luz.clone();
      for (const t of [mapaI, luzI]) {
        t.needsUpdate = true;
        t.repeat.set(12 / 24, h / 24);
      }
      const lateral = new THREE.MeshStandardMaterial({ map: mapaI, emissiveMap: luzI, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.35, metalness: 0.3 });
      const topo = new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.9 });
      this.materiaisJanela.push(lateral);
      const im = new THREE.InstancedMesh(geo, [lateral, lateral, topo, topo, lateral, lateral], ms.length);
      ms.forEach((m, k) => im.setMatrixAt(k, m));
      im.castShadow = false;
      this.grupo.add(im);
    });
  }

  // Parque em frente à avenida: gramado e árvores por instância (2 chamadas de desenho).
  private parque() {
    const relva = new THREE.Mesh(new THREE.PlaneGeometry(160, 70), new THREE.MeshStandardMaterial({ color: 0x4f7a45, roughness: 1 }));
    relva.rotation.x = -Math.PI / 2;
    relva.position.set(0, 0.015, 90);
    relva.receiveShadow = true;
    this.grupo.add(relva);
    const r = aleatorio(5), N = 140;
    const tronco = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.3, 2.4, 6).translate(0, 1.2, 0), new THREE.MeshStandardMaterial({ color: 0x5a4331, roughness: 1 }), N);
    const copa = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.7, 1).translate(0, 3.8, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), N);
    const verdes = [0x2f6b3a, 0x3f8a49, 0x4c9b52, 0x2a5a33];
    for (let i = 0; i < N; i++) {
      const s = 0.8 + r() * 0.9;
      this.tmp.position.set(-76 + r() * 152, 0, 58 + r() * 60);
      this.tmp.rotation.set(0, r() * 6.28, 0);
      this.tmp.scale.set(s, s, s);
      this.tmp.updateMatrix();
      tronco.setMatrixAt(i, this.tmp.matrix);
      copa.setMatrixAt(i, this.tmp.matrix);
      copa.setColorAt(i, new THREE.Color(verdes[i % verdes.length]));
    }
    this.tmp.scale.set(1, 1, 1);
    this.grupo.add(tronco, copa);
  }

  // Postes ao longo da avenida da frente; a cabeça acende à noite.
  private postes() {
    const mats: THREE.Matrix4[] = [];
    for (let x = -190; x <= 190; x += 14) for (const z of [46.4, 59.6]) mats.push(new THREE.Matrix4().makeTranslation(x, 0, z));
    const haste = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.1, 7, 6).translate(0, 3.5, 0), new THREE.MeshStandardMaterial({ color: 0x2a2e35 }), mats.length);
    const cab = new THREE.InstancedMesh(new THREE.SphereGeometry(0.34, 10, 8).translate(0, 7.1, 0), new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffd9a0, emissiveIntensity: 0 }), mats.length);
    cab.name = 'postes';
    mats.forEach((m, i) => {
      haste.setMatrixAt(i, m);
      cab.setMatrixAt(i, m);
    });
    this.grupo.add(haste, cab);
  }

  // Carros: corpo e cabine por instância, em faixas das avenidas e de uma rua lateral.
  private veiculos() {
    const cores = [0xe8e8ea, 0x15171c, 0xb12a2a, 0x2c5da8, 0x8c9096, 0xd8b341, 0x2f7a5a];
    const defs: { x: number; z: number; v: number; eixoX: boolean }[] = [];
    const r = aleatorio(9);
    for (let i = 0; i < 9; i++) defs.push({ x: -180 + r() * 360, z: i % 2 ? 50 : 56, v: (i % 2 ? 1 : -1) * (7 + r() * 5), eixoX: true });
    for (let i = 0; i < 3; i++) defs.push({ x: -180 + r() * 360, z: i % 2 ? -37 : -31, v: (i % 2 ? 1 : -1) * (6 + r() * 4), eixoX: true });
    for (let i = 0; i < 3; i++) defs.push({ x: i % 2 ? 48 : 44, z: -30 + r() * 80, v: (i % 2 ? 1 : -1) * (6 + r() * 4), eixoX: false });
    this.carros = defs.map((d, i) => ({ ...d, i }));
    this.corpos = new THREE.InstancedMesh(new THREE.BoxGeometry(4.2, 0.9, 1.9).translate(0, 0.7, 0), new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.5 }), defs.length);
    this.cabines = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 0.7, 1.7).translate(-0.2, 1.4, 0), new THREE.MeshStandardMaterial({ color: 0x1a222c, roughness: 0.2, metalness: 0.6 }), defs.length);
    this.carros.forEach((c, i) => this.corpos.setColorAt(i, new THREE.Color(cores[i % cores.length])));
    this.grupo.add(this.corpos, this.cabines);
    this.posicionarCarros();
  }

  private posicionarCarros() {
    for (const c of this.carros) {
      this.tmp.position.set(c.x, 0, c.z);
      // Carro virado para o sentido da marcha.
      this.tmp.rotation.y = c.eixoX ? (c.v > 0 ? 0 : Math.PI) : c.v > 0 ? -Math.PI / 2 : Math.PI / 2;
      this.tmp.updateMatrix();
      this.corpos.setMatrixAt(c.i, this.tmp.matrix);
      this.cabines.setMatrixAt(c.i, this.tmp.matrix);
    }
    this.corpos.instanceMatrix.needsUpdate = true;
    this.cabines.instanceMatrix.needsUpdate = true;
  }

  // Chamado só no modo "cidade" (câmera longe do prédio).
  atualizar(dt: number) {
    for (const c of this.carros) {
      if (c.eixoX) {
        c.x += c.v * dt;
        if (c.x > 190) c.x = -190;
        if (c.x < -190) c.x = 190;
      } else {
        c.z += c.v * dt;
        if (c.z > 130) c.z = -100;
        if (c.z < -100) c.z = 130;
      }
    }
    this.posicionarCarros();
  }

  // 0 = dia, 1 = noite: acende as janelas e as cabeças dos postes.
  definirNoite(n: number) {
    for (const m of this.materiaisJanela) m.emissiveIntensity = n * 0.8;
    this.cabecasPoste.emissiveIntensity = n * 2.2;
  }

  // Periferia: prédios baixos, árvores e canteiros do Kenney (CC0), cada peça em InstancedMesh.
  private async periferia() {
    const gl = new GLTFLoader();
    const carregar = (nome: string) => gl.loadAsync(`/assets/city/${nome}.glb`).catch(() => null);
    const [a, b, c, d, arv, arv2] = await Promise.all(['building-small-a', 'building-small-b', 'building-small-c', 'building-small-d', 'grass-trees', 'grass-trees-tall'].map(carregar));
    const r = aleatorio(11);
    const predios = [a, b, c, d].filter(Boolean) as NonNullable<typeof a>[];
    const alvos = new Map<(typeof predios)[number], THREE.Matrix4[]>();
    predios.forEach((p) => alvos.set(p, []));
    for (let x = -300; x <= 300; x += 24) {
      for (let z = -200; z <= 260; z += 24) {
        if (Math.hypot(x, z - 10) < 150) continue;
        if (r() < 0.45) continue; // periferia esparsa: poucos triângulos e mais respiro
        if (this.emVia(x, z, 4)) continue;
        const p = predios[Math.floor(r() * predios.length)];
        alvos.get(p)!.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.floor(r() * 4) * (Math.PI / 2)), new THREE.Vector3(1, 1, 1)));
      }
    }
    for (const [gltf, ms] of alvos) this.instanciar(gltf.scene, ms, 11);
    // Árvores ao longo da calçada da avenida (lado da praça).
    const arvores = [arv, arv2].filter(Boolean) as NonNullable<typeof arv>[];
    arvores.forEach((t, k) => {
      const ms: THREE.Matrix4[] = [];
      for (let x = -170 + k * 7; x <= 170; x += 14) if (Math.abs(x) > 30) ms.push(new THREE.Matrix4().makeTranslation(x, 0, 44));
      this.instanciar(t.scene, ms, 6);
    });
  }

  // Transforma um modelo glTF em InstancedMesh (uma por malha), normalizando a largura para `larg` metros.
  private instanciar(raiz: THREE.Object3D, matrizes: THREE.Matrix4[], larg: number) {
    if (!matrizes.length) return;
    raiz.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(raiz);
    const tam = bb.getSize(new THREE.Vector3());
    const s = larg / Math.max(tam.x, tam.z);
    const base = new THREE.Matrix4().makeScale(s, s, s).multiply(new THREE.Matrix4().makeTranslation(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2));
    raiz.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const im = new THREE.InstancedMesh(m.geometry, m.material, matrizes.length);
      const local = base.clone().multiply(m.matrixWorld);
      matrizes.forEach((mt, i) => im.setMatrixAt(i, mt.clone().multiply(local)));
      this.grupo.add(im);
    });
  }
}
