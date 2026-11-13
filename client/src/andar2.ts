// Andar 2 (y = 12): social e decorativo — sala de guerra, salas de vidro, jardim, biblioteca, galeria, lounge e terraço.
// Nada aqui é dado de agente: as TVs são decorativas e levam o carimbo EXEMPLO.
import * as THREE from 'three';
import {
  Montador, MAT, aleatorio, cadeira, sofa, poltrona, mesaCentro, estante, floreira, pilar, planta, arvore, portaElevador, banqueta,
} from './interior';

// Gráfico de exemplo para as TVs: dado fictício e carimbo bem visível (nunca confundir com status real).
function tvExemplo(titulo: string, w: number, h: number, semente: number): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 768;
  c.height = Math.round(768 * (h / w));
  const g = c.getContext('2d')!;
  g.fillStyle = '#0b121c';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#f2f5f8';
  g.font = '600 34px -apple-system, system-ui, sans-serif';
  g.fillText(titulo, 32, 56);
  const r = aleatorio(semente);
  const base = c.height - 56, topo = 110, n = 10, bw = (c.width - 96) / n;
  for (let i = 0; i < n; i++) {
    const v = 0.25 + r() * 0.6;
    const hh = (base - topo) * v;
    const gr = g.createLinearGradient(0, base - hh, 0, base);
    gr.addColorStop(0, '#69c1c4');
    gr.addColorStop(1, '#5d549e');
    g.fillStyle = gr;
    g.fillRect(48 + i * bw + 6, base - hh, bw - 12, hh);
  }
  g.strokeStyle = '#f4b400';
  g.lineWidth = 4;
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const y = base - (base - topo) * (0.3 + 0.55 * (i / n) + (r() - 0.5) * 0.2);
    i ? g.lineTo(48 + i * bw + bw / 2, y) : g.moveTo(48 + i * bw + bw / 2, y);
  }
  g.stroke();
  // Carimbo: não deixa a TV passar por dado real.
  g.fillStyle = 'rgba(232,69,60,0.95)';
  g.fillRect(c.width - 214, 20, 188, 50);
  g.fillStyle = '#fff';
  g.font = '700 30px -apple-system, system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('EXEMPLO', c.width - 120, 56);
  g.textAlign = 'left';
  g.fillStyle = 'rgba(242,245,248,.45)';
  g.font = '22px -apple-system, system-ui, sans-serif';
  g.fillText('dados fictícios · decoração', 32, c.height - 18);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
}

// Quadro abstrato no gradiente da marca (sem texto).
function quadro(w: number, h: number, semente: number): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = Math.round(256 * (h / w));
  const g = c.getContext('2d')!;
  const r = aleatorio(semente);
  const gr = g.createLinearGradient(0, 0, c.width, c.height);
  gr.addColorStop(0, ['#69c1c4', '#66a1d6', '#5d549e'][semente % 3]);
  gr.addColorStop(1, ['#5d549e', '#69c1c4', '#66a1d6'][semente % 3]);
  g.fillStyle = gr;
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 5; i++) {
    g.fillStyle = `rgba(255,255,255,${0.08 + r() * 0.18})`;
    g.beginPath();
    g.arc(r() * c.width, r() * c.height, 20 + r() * 80, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
}

// Sala de vidro: parede de fundo com vão de porta de 1 m e paredes laterais; a frente é o vidro do prédio.
function salaVidro(m: Montador, cx: number, cz: number, w: number, d: number, y: number) {
  const h = 2.6, z0 = cz - d / 2;
  const trecho = (xa: number, xb: number) => {
    m.caixa('vidro', xb - xa, h, 0.03, (xa + xb) / 2, y, z0);
    m.caixa('aco', xb - xa, 0.05, 0.06, (xa + xb) / 2, y + h, z0);
    m.caixa('branco', xb - xa, 0.9 * 0.5, 0.04, (xa + xb) / 2, y + 1.1, z0); // faixa jateada
  };
  trecho(cx - w / 2, cx - 0.5);
  trecho(cx + 0.5, cx + w / 2);
  for (const s of [-1, 1]) {
    m.caixa('vidro', 0.03, h, d, cx + (s * w) / 2, y, cz);
    m.caixa('aco', 0.06, 0.05, d, cx + (s * w) / 2, y + h, cz);
    m.caixa('aco', 0.06, h, 0.06, cx + (s * w) / 2, y, z0);
  }
}

function banco(m: Montador, x: number, y: number, z: number, comp: number, rotY = 0) {
  m.local(x, y, z, rotY);
  m.caixa('carvalho', comp, 0.06, 0.45, 0, 0.42, 0);
  for (const s of [-1, 1]) m.caixa('aco', 0.05, 0.42, 0.4, s * (comp / 2 - 0.1), 0, 0);
  m.fim();
}

export interface Andar2 { grupo: THREE.Group; assentosGuerra: THREE.Vector3[]; luz: THREE.PointLight[] }

export function montarAndar2(L: number, P: number, y: number): Andar2 {
  const grupo = new THREE.Group();
  const m = new Montador();
  const meiaL = L / 2, meiaP = P / 2;

  // Núcleo (continuação), pilares e portas de elevador.
  m.caixa('branco', 16, 5.7, 6, 0, y, -13);
  for (const x of [-3, 0, 3]) portaElevador(m, x, y, -9.97);
  for (const z of [-14.8, -13, -11.2]) m.caixa('carvalho', 0.05, 2.1, 0.95, 8.03, y, z);
  for (const x of [-16, -8, 8, 16]) for (const z of [0, 8]) pilar(m, x, y, z, 5.65);

  // Vidro do andar 2: a fachada recua para z = 8 (o resto vira terraço).
  m.caixa('vidro', L, 6, 0.03, 0, y, 8);
  m.caixa('vidro', L, 6, 0.03, 0, y, -meiaP);
  for (const s of [-1, 1]) m.caixa('vidro', 0.03, 6, 24, s * meiaL, y, -4);
  for (let x = -meiaL; x <= meiaL + 0.1; x += 4) {
    m.caixa('aco', 0.12, 6, 0.12, x, y, 8);
    m.caixa('aco', 0.12, 6, 0.12, x, y, -meiaP);
  }
  for (let z = -meiaP; z <= 8.1; z += 4) for (const s of [-1, 1]) m.caixa('aco', 0.12, 6, 0.12, s * meiaL, y, z);

  // ---- Salas de vidro na faixa z 0,4…7,6 ----
  const salas: [number, number][] = [[-20, 7.2], [-12, 7.2], [0, 15.2], [12, 7.2], [20, 7.2]];
  for (const [cx, w] of salas) salaVidro(m, cx, 4, w, 7.2, y);

  // Descanso (−20, 4): 3 poltronas claras, tapete e luz baixa.
  m.caixa('tinta', 5, 0.03, 4.4, -20, y, 4, 0, 0xcfc4ae);
  for (const [dx, dz, r] of [[-1.7, 0.4, 0.4], [0, 1.2, 0], [1.7, 0.4, -0.4]] as const) poltrona(m, -20 + dx, y, 4 + dz, Math.PI + r, 0xe6e1d6);
  mesaCentro(m, -20, y, 3.4, 0.9, 0.9, 0.35);
  planta(m, -22.8, y, 1.3, 1.2);

  // R1 (−12, 4) e R2 (12, 4): mesa 3,0 × 1,2 com 6 cadeiras.
  for (const cx of [-12, 12]) {
    m.caixa('carvalho', 3, 0.06, 1.2, cx, y + 0.72, 4);
    for (const s of [-1, 1]) m.caixa('aco', 0.06, 0.72, 0.9, cx + s * 1.2, y, 4);
    for (let i = 0; i < 3; i++) for (const lado of [-1, 1]) cadeira(m, cx - 1 + i, y, 4 + lado * 1.0, lado, 0x3d4a58);
    m.sombra(cx, y, 4, 4.6, 3.4);
  }
  // R3 (20, 4): mesa redonda Ø 1,4 com 4 cadeiras.
  m.cil('carvalho', 0.7, 0.7, 0.05, 20, y + 0.72, 4, undefined, 28);
  m.cil('aco', 0.05, 0.05, 0.72, 20, y, 4, undefined, 8);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    m.local(20 + Math.cos(a) * 1.2, y, 4 + Math.sin(a) * 1.2, -a + Math.PI / 2);
    cadeira(m, 0, 0, 0, 1, 0x3d4a58);
    m.fim();
  }

  // ---- Sala de guerra (0, 4): mesa de 7 m, 12 cadeiras, telão e quadro branco ----
  m.caixa('carvalho', 7, 0.07, 1.6, 0, y + 0.72, 4);
  for (const s of [-1, 1]) m.caixa('aco', 0.08, 0.72, 1.2, s * 2.8, y, 4);
  m.caixa('luz', 5.5, 0.015, 0.05, 0, y + 0.8, 4); // filete de luz sobre a mesa
  const assentosGuerra: THREE.Vector3[] = [];
  for (let i = 0; i < 6; i++) {
    const x = -3.3 + i * 1.32;
    cadeira(m, x, y, 2.75, -1, 0x2b2e33);
    cadeira(m, x, y, 5.25, 1, 0x2b2e33);
    assentosGuerra.push(new THREE.Vector3(x, y, 2.75), new THREE.Vector3(x, y, 5.25));
  }
  m.sombra(0, y, 4, 8.4, 4.2);
  m.caixa('carvalho', 0.12, 3.2, 6.8, -7.58, y, 4); // parede de ripado do telão
  m.caixa('branco', 0.05, 1.2, 2.4, 7.5, y + 1.0, 4); // quadro branco
  m.caixa('grafite', 0.07, 0.06, 2.5, 7.5, y + 0.95, 4);

  // ---- Jardim interno (−16, −5) ----
  m.caixa('carvalho', 6, 0.5, 2.4, -16, y, -5);
  m.caixa('tinta', 5.8, 0.02, 2.2, -16, y + 0.5, -5, 0, 0x3a3128);
  for (const dx of [-2, 0, 2]) arvore(m, -16 + dx, y + 0.5, -5, 0.75);
  banco(m, -16, y, -7.6, 2.4);
  banco(m, -16, y, -2.4, 2.4, Math.PI);

  // ---- Biblioteca (16, −5) ----
  for (let i = 0; i < 4; i++) estante(m, 11.2 + i * 2.6, y, -7.7, 0);
  poltrona(m, 14, y, -3.6, Math.PI, 0xe6e1d6);
  poltrona(m, 18.5, y, -3.6, Math.PI, 0xe6e1d6);
  mesaCentro(m, 16.25, y, -3.9, 0.8, 0.8, 0.4);
  m.caixa('tinta', 6, 0.03, 3, 16.2, y, -4.8, 0, 0xc8bfae);
  planta(m, 22.5, y, -2.6, 1.3);

  // ---- Galeria (−16, −13): parede solta com 6 quadros, bancos e maquete ----
  m.caixa('branco', 14, 3.2, 0.12, -16, y, -13);
  banco(m, -20, y, -11.4, 2.2);
  banco(m, -13, y, -11.4, 2.2);
  m.caixa('pedra', 1.4, 0.9, 1.0, -16.5, y, -11.4); // pedestal da maquete
  m.caixa('vidro', 1.3, 0.35, 0.9, -16.5, y + 0.9, -11.4);
  m.caixa('branco', 0.5, 0.28, 0.4, -16.7, y + 0.9, -11.4);
  m.caixa('branco', 0.35, 0.34, 0.3, -16.2, y + 0.9, -11.4);

  // ---- Lounge executivo (17, −13) ----
  m.caixa('tinta', 8, 0.03, 4, 16.5, y, -13.2, 0, 0xcfc4ae);
  sofa(m, 14, y, -15.1, 0, 3, 0xe6e1d6, 0xc9a35a);
  sofa(m, 18.4, y, -15.1, 0, 3, 0xe6e1d6, 0x69c1c4);
  poltrona(m, 13.3, y, -12, Math.PI, 0xd9d2c5);
  poltrona(m, 15.1, y, -12, Math.PI, 0xd9d2c5);
  poltrona(m, 18, y, -12, Math.PI, 0xd9d2c5);
  poltrona(m, 19.8, y, -12, Math.PI, 0xd9d2c5);
  mesaCentro(m, 16, y, -13.4, 1.4, 0.8, 0.4);
  m.caixa('grafite', 4, 1.05, 0.6, 21.5, y, -10.6);
  m.caixa('pedra', 4.1, 0.05, 0.7, 21.5, y + 1.05, -10.6);
  m.caixa('inox', 0.35, 0.4, 0.35, 22.5, y + 1.1, -10.6);
  for (const x of [20.5, 21.5, 22.5]) banqueta(m, x, y, -9.8);
  planta(m, 11.2, y, -15.3, 1.3);
  planta(m, 23, y, -14.4, 1.3);

  // ---- Terraço (z 8…16): deck, guarda-corpo de vidro, floreiras, pergolado e poltronas externas ----
  m.caixa('carvalho', L, 0.05, 8, 0, y, 12);
  m.caixa('vidro', L, 1.1, 0.03, 0, y, 15.95);
  m.caixa('inox', L, 0.05, 0.07, 0, y + 1.1, 15.95);
  for (const s of [-1, 1]) {
    m.caixa('vidro', 0.03, 1.1, 8, s * (meiaL - 0.05), y, 12);
    m.caixa('inox', 0.07, 0.05, 8, s * (meiaL - 0.05), y + 1.1, 12);
  }
  for (let k = 0; k < 8; k++) floreira(m, -21 + k * 6, y, 15.4, 4, 0.6, 0x3a3128);
  // Pergolado de ripas (40 ripas a cada 0,4 m) sobre quatro pilaretes de inox.
  for (const [px, pz] of [[-8, 9.5], [8, 9.5], [-8, 15.3], [8, 15.3]]) m.caixa('inox', 0.12, 3.2, 0.12, px, y, pz);
  for (let i = 0; i < 40; i++) m.caixa('carvalho', 0.06, 0.2, 6, -7.8 + i * 0.4, y + 3.2, 12.4);
  for (const z of [9.5, 15.3]) m.caixa('inox', 16.2, 0.1, 0.12, 0, y + 3.15, z);
  for (const cx of [-18, -12, 12, 18]) {
    poltrona(m, cx - 0.95, y, 12.6, Math.PI / 2, 0xe6e1d6);
    poltrona(m, cx + 0.95, y, 12.6, -Math.PI / 2, 0xe6e1d6);
    mesaCentro(m, cx, y, 12.6, 0.7, 0.7, 0.38);
  }
  for (const [x, z] of [[-22.5, 10.5], [22.5, 10.5], [-22.5, 14.2]]) arvore(m, x, y, z, 0.9);
  for (let k = 0; k < 6; k++) m.cil('luz', 0.07, 0.07, 0.4, -20 + k * 8, y, 14.3);

  // Pendentes lineares do andar 2.
  const pend = (x: number, z: number, comp: number) => {
    m.caixa('luz', comp, 0.05, 0.14, x, y + 4.6, z);
    for (const s of [-1, 1]) m.caixa('aco', 0.012, 1.0, 0.012, x + s * (comp / 2 - 0.2), y + 4.65, z);
  };
  for (const x of [-12, 0, 12]) pend(x, 4, 3);
  pend(-20, 4, 2.4);
  pend(20, 4, 2.4);
  for (const [x, z] of [[-16, -5], [16, -5], [-16, -13], [16, -13]]) pend(x, z, 3);

  grupo.add(m.construir());

  // ---- Telas decorativas (EXEMPLO): telão da sala de guerra e três TVs ----
  const telao = tvExemplo('Operação (exemplo)', 4.0, 2.25, 11);
  telao.position.set(-7.5, y + 1.95, 4);
  telao.rotation.y = Math.PI / 2;
  const tv1 = tvExemplo('Pipeline (exemplo)', 1.6, 0.9, 21);
  tv1.position.set(-12, y + 1.7, 0.43);
  const tv2 = tvExemplo('Receita (exemplo)', 1.6, 0.9, 31);
  tv2.position.set(12, y + 1.7, 0.43);
  const tv3 = tvExemplo('Metas (exemplo)', 1.6, 0.9, 41);
  tv3.position.set(20, y + 1.7, 0.43);
  grupo.add(telao, tv1, tv2, tv3);

  // Quadros da galeria (6) na parede solta, voltados para o lado dos bancos.
  for (let i = 0; i < 6; i++) {
    const q = quadro(1.6, 1.1, 3 + i);
    q.position.set(-22.4 + i * 2.55, y + 1.65, -12.92);
    grupo.add(q);
  }
  // "Tela do andar": painel de ripado, sem tela.
  const painel = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.0, 0.05), MAT.carvalho);
  painel.position.set(-6.2, y + 2.4, -9.97);
  grupo.add(painel);

  // Duas luzes pontuais: salas e lounge. Sem sombra.
  const luz = [new THREE.PointLight(0xfff0dc, 70, 26, 1.5), new THREE.PointLight(0xfff0dc, 60, 26, 1.5)];
  luz[0].position.set(0, y + 4.5, 3);
  luz[1].position.set(-4, y + 4.5, -9);
  grupo.add(...luz);

  return { grupo, assentosGuerra, luz };
}
