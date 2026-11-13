// Seleção de pessoa no 3D: clique num boneco → destaca (anel no chão, Mesh próprio — people.ts
// não é tocado), emite o id do agente e a câmera foca em vista de cima inclinada, SEM mexer no
// foco de andar (só `mover` do main, nunca defFoco). Duplo clique → a câmera segue o boneco via
// atualizar(dt); qualquer arraste do usuário (OrbitControls "start") cancela o seguimento.
// Raycaster roda APENAS no evento de clique — nunca por quadro.
// As regras de chave/vivos moram em vida/identidade; aqui só espelha `chave → agenteIds[0]`
// (agenteIds sai ordenado do consolidar) sem duplicar a regra — isso é papel do main.ts.
// Lógica pura (maisPerto, foiClique, vistaFocada) testada em selecao.test.ts sem WebGL.
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface Pt2 { x: number; y: number }
export interface Pt3 { x: number; y: number; z: number }

// Limiar de arraste (px em tela): acima disso foi orbita/pan, não clique.
const LIMITE_ARRASTE = 6;
// Distância máxima (m) entre o ponto do clique e o centro de um boneco para contar como escolha.
const LIMITE_ESCOLHA = 1.6;
// "Centro" do boneco na altura do meio do corpo: clique na cabeça não perde para o vizinho.
const CENTRO_Y = 0.9;
// Vista de cima inclinada (constantes num lugar só): alvo acima do boneco, câmera a altura/distância fixas.
const ALVO_ACIMA = 1.5; // m acima dos pés (peito/cabeça)
const DIST_HORIZ = 6;   // distância horizontal câmera → alvo
const ALTURA_CAM = 7;   // altura da câmera acima do alvo
// O anel fica a 0,12 m do piso: acima do topo da praça (0,1 m) e das lajes sem flutuar visível.
const ANEL_ACIMA_DO_PISO = 0.12;

/**
 * Boneco mais perto de `origem` por distância 3D; empate de distância → menor `id`.
 * `null` se ninguém estiver dentro de `limite` (m) — clique no vazio não seleciona.
 */
export function maisPerto(origem: Pt3, lista: Array<{ id: string; pos: Pt3 }>, limite: number = LIMITE_ESCOLHA) {
  if (!lista.length) return null;
  const ordenado = lista
    .map((c) => ({ ...c, d: Math.hypot(c.pos.x - origem.x, c.pos.y - origem.y, c.pos.z - origem.z) }))
    .sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const primeiro = ordenado[0];
  return primeiro.d <= limite ? { id: primeiro.id, pos: primeiro.pos } : null;
}

/** Clique (e não arraste de órbita): o ponteiro andou menos que o limiar entre down e up. */
export function foiClique(inicio: Pt2, fim: Pt2, limiar: number = LIMITE_ARRASTE): boolean {
  return Math.hypot(fim.x - inicio.x, fim.y - inicio.y) <= limiar;
}

/**
 * Vista de cima inclinada: alvo 1,5 m acima dos pés do boneco; câmera a ALTURA_CAM acima do alvo,
 * a DIST_HORIZ de distância, conservando a direção horizontal atual (`direcao` = câmera − boneco).
 * Direção nula/zero → padrão +Z (lado da fachada). Não toca no foco de andar: o main aplica
 * apenas via `mover` (transição suave) e nunca chama defFoco.
 */
export function vistaFocada(base: Pt3, direcao: Pt3 | null): { pos: Pt3; alvo: Pt3 } {
  const alvo: Pt3 = { x: base.x, y: base.y + ALVO_ACIMA, z: base.z };
  const dx = direcao?.x ?? 0;
  const dz = direcao?.z ?? 0;
  const h = Math.hypot(dx, dz);
  const u = h > 1e-6 ? { x: dx / h, z: dz / h } : { x: 0, z: 1 };
  return { pos: { x: alvo.x + u.x * DIST_HORIZ, y: alvo.y + ALTURA_CAM, z: alvo.z + u.z * DIST_HORIZ }, alvo };
}

export interface SelecaoOpcoes {
  cena: THREE.Scene;
  camera: THREE.Camera;
  el: HTMLElement; // canvas do renderer (eventos de clique)
  controles: OrbitControls; // "start" (o usuário agarrou) cancela o seguimento
  /** Pessoas vivas: `grupo.userData.chave` é marcado pelo main a cada snapshot. */
  pessoas: () => Array<{ chave: string; grupo: THREE.Group }>;
  /** Transição suave de câmera/alvo do main (não mexe no foco de andar). */
  mover: (pos: [number, number, number], alvo: [number, number, number]) => void;
  /** Cancela a transição em andamento (o seguimento não pode brigar com o lerp dela). */
  pararTransicao: () => void;
  /** Chave → primeiro agente ativo ('' quando não há, ex.: modo demo). */
  resolverAgente: (chave: string) => string;
  /** Emite o agente do boneco clicado — main liga à lista (e à gaveta de detalhe quando existir). */
  aoSelecionarAgente: (id: string) => void;
}

export interface Selecao {
  /** Chamado a cada quadro: reposiciona o anel e executa o seguimento do duplo clique. */
  atualizar(dt: number): void;
  liberar(): void;
}

export function criarSelecao(o: SelecaoOpcoes): Selecao {
  const ray = new THREE.Raycaster();
  const tmp = new THREE.Vector3();
  const offset = new THREE.Vector3(); // direção câmera→alvo congelada no duplo clique
  // Anel no chão sob o boneco: Mesh próprio (people.ts continua intacto).
  const anel = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.68, 40),
    new THREE.MeshBasicMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
  );
  anel.rotation.x = -Math.PI / 2;
  anel.position.y = ANEL_ACIMA_DO_PISO;
  anel.visible = false;
  o.cena.add(anel);

  let chave: string | null = null;
  let segue = false;
  const pessoaDe = (c: string) => o.pessoas().find((p) => p.chave === c);

  function desmarcar() {
    chave = null;
    segue = false;
    anel.visible = false;
  }

  // Escolha: marca o anel no piso sob os pés, foca a câmera (transição) e emite o agente (agenteIds[0] ordenado).
  function selecionar(c: string, pes: Pt3) {
    chave = c;
    segue = false; // clique simples = focar; só duplo clique segue
    anel.position.set(pes.x, pes.y + ANEL_ACIMA_DO_PISO, pes.z);
    anel.visible = true;
    const v = vistaFocada(pes, {
      x: o.camera.position.x - pes.x, y: 0, z: o.camera.position.z - pes.z,
    });
    o.mover([v.pos.x, v.pos.y, v.pos.z], [v.alvo.x, v.alvo.y, v.alvo.z]);
    const id = o.resolverAgente(c);
    if (id) o.aoSelecionarAgente(id);
  }

  // Clique no canvas: raycast SOMENTE aqui (nunca por quadro). O hit cai sobre a malha do
  // boneco (aproximação: SkinnedMesh intersecta pela malha base — o limite/tie absorve o erro);
  // a escolha final é por distância ao ponto, com desempate por id.
  function clicar(e: PointerEvent) {
    const vivos = o.pessoas().filter((p) => p.grupo.visible);
    const r = new THREE.Vector2(
      (((e.clientX - o.el.getBoundingClientRect().left) / o.el.clientWidth) * 2 - 1),
      (-((e.clientY - o.el.getBoundingClientRect().top) / o.el.clientHeight) * 2 + 1),
    );
    ray.setFromCamera(r, o.camera);
    const pontos = ray.intersectObjects(vivos.map((p) => p.grupo), true);
    if (!pontos.length) { desmarcar(); return; }
    const hit = pontos[0].point;
    const candidatos = vivos.map((p) => ({
      id: p.chave,
      pos: { x: p.grupo.position.x, y: p.grupo.position.y + CENTRO_Y, z: p.grupo.position.z },
    }));
    const mais = maisPerto({ x: hit.x, y: hit.y, z: hit.z }, candidatos);
    if (!mais) { desmarcar(); return; }
    // Mais.perto devolve o centro (pés + CENTRO_Y); o anel fica no piso sob os pés.
    const pes = { x: mais.pos.x, y: mais.pos.y - CENTRO_Y, z: mais.pos.z };
    selecionar(mais.id, pes);
  }

  // Duplo clique: segue o boneco escolhido — congela a direção atual da câmera e, por quadro,
  // a câmera/alvo amortecem em direção ao boneco (atualizar). O usuário agarrar cancela.
  function dobrar() {
    if (!chave) return;
    const p = pessoaDe(chave);
    if (!p) { desmarcar(); return; }
    o.pararTransicao();
    const g = p.grupo.position;
    const alvoY = g.y + ALVO_ACIMA;
    offset.set(o.camera.position.x - g.x, o.camera.position.y - alvoY, o.camera.position.z - g.z);
    // Não deixa a câmera colada no boneco: distância horizontal mínima de 4 m.
    const horiz = Math.hypot(offset.x, offset.z);
    if (horiz < 4) { const f = 4 / (horiz || 1); offset.x *= f; offset.z *= f; }
    segue = true;
  }

  let x0 = 0, y0 = 0;
  const aoBaixar = (e: PointerEvent) => { x0 = e.clientX; y0 = e.clientY; };
  const aoSoltar = (e: PointerEvent) => {
    if (e.button !== 0) return;
    if (!foiClique({ x: x0, y: y0 }, { x: e.clientX, y: e.clientY })) return; // arraste → orbita, não clique
    clicar(e);
  };
  const aoDobro = () => dobrar();
  const aoAgarrar = () => { segue = false; }; // o usuário retomou a câmera
  o.el.addEventListener('pointerdown', aoBaixar);
  o.el.addEventListener('pointerup', aoSoltar);
  o.el.addEventListener('dblclick', aoDobro);
  o.controles.addEventListener('start', aoAgarrar);

  function atualizar(dt: number) {
    if (!chave) return;
    const p = pessoaDe(chave);
    if (!p) { desmarcar(); return; } // boneco saiu do prédio: anel e seguimento some
    const g = p.grupo.position;
    anel.position.set(g.x, g.y + ANEL_ACIMA_DO_PISO, g.z); // o boneco anda → o anel acompanha no mesmo piso
    if (segue) {
      // Amortecimento independente de framerate; alvo na altura do peito do boneco.
      const k = 1 - Math.exp(-3.5 * dt);
      tmp.set(g.x + offset.x, g.y + ALVO_ACIMA + offset.y, g.z + offset.z);
      o.camera.position.lerp(tmp, k);
      tmp.set(g.x, g.y + ALVO_ACIMA, g.z);
      o.controles.target.lerp(tmp, k);
    }
  }

  function liberar() {
    o.el.removeEventListener('pointerdown', aoBaixar);
    o.el.removeEventListener('pointerup', aoSoltar);
    o.el.removeEventListener('dblclick', aoDobro);
    o.controles.removeEventListener('start', aoAgarrar);
    o.cena.remove(anel);
    anel.geometry.dispose();
    (anel.material as THREE.Material).dispose();
  }

  return { atualizar, liberar };
}
