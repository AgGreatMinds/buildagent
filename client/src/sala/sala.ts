// Props 3D da sala de descanso no andar 1, leste.
// Monta as peças da tabela 4.3 com o Montador e as funções de interior.ts (sem editá-lo),
// mais a bolinha do ping-pong e as 2 raquetes. As telas vivas da TV e dos 2 fliperamas
// (nascem `off` — os modos entram na S9) sobem via `telas.criar` com `pai` = grupo da sala.
// Coordenadas vêm de `ITENS`/`LUGARES` de ./layout (fonte única) — nada de número novo aqui.
// Sem aleatoriedade nem relógio global: todo o tempo entra por argumento em `atualizar(agora, t)` (critério C5).

import * as THREE from 'three';
import { MAT, Montador, estante, mesaCentro, planta, poltrona, sofa } from '../interior';
import { ITENS, LUGARES, type ItemSala } from './layout';
import type { Telas, TelaViva } from '../telas/telas';

export interface SalaMontada {
  tv: TelaViva;
  fliperamas: [TelaViva, TelaViva];
  bolinha: THREE.Mesh;
  raquetes: [THREE.Object3D, THREE.Object3D];
  atualizar(agora: number, t: number): void;
}

// Material vermelho do disco das raquetes (não existe em MAT; criado 1× no módulo).
const MAT_RAQUETA = new THREE.MeshStandardMaterial({ color: 0xc23b34, roughness: 0.6 });

// Atalho da tabela 4.3 pelo id — as coordenadas nunca são reescritas aqui.
function item(id: string): ItemSala {
  return ITENS.find((v) => v.id === id)!;
}

// Interpolação linear simples (usada só na bolinha, §4.5).
function lerp(a: number, b: number, s: number): number {
  return a + (b - a) * s;
}

export function montarSala(cena: THREE.Scene, Y1: number, telas: Telas): SalaMontada {
  const m = new Montador();

  // ---- Console grafite + caixa da TV em (12,4; −1,95) ----
  const tv = item('console-tv');
  m.caixa('grafite', 2.2, 0.5, 0.5, tv.x, Y1, tv.z); // console: base no piso, topo em Y1+0,5
  // Caixa da TV montada no console: face frontal em z = tv.z (−1,95), a tela viva sobe a 1,5 mm à frente (−1,945, spec).
  m.caixa('grafite', 2.0, 1.125, 0.05, tv.x, Y1 + 0.5, tv.z - 0.025);

  // ---- Sofá 3,0 m virado à TV (rotY π) e poltrona com o olhar do LUGARES ----
  const sof = item('sofa');
  sofa(m, sof.x, Y1, sof.z, Math.PI, 3.0, 0x8a5a3b);
  const pol = item('poltrona');
  const olharPoltrona = LUGARES.find((l) => l.destino === 'tv' && l.x === pol.x)!.olhar;
  poltrona(m, pol.x, Y1, pol.z, olharPoltrona, 0xe6e1d6);

  // ---- Mesa de centro + tapete (no piso) ----
  const mes = item('mesa');
  mesaCentro(m, mes.x, Y1, mes.z, 1.2, 0.7);
  const tap = item('tapete');
  m.caixa('tinta', 3.6, 0.03, 3.4, tap.x, Y1, tap.z, 0, 0xcdbf9f);

  // ---- 2 fliperamas (corpo escuro grafite/aco; a tela viva sobe só depois do grupo existir) ----
  for (const f of [item('fliperama-a'), item('fliperama-b')]) {
    m.caixa('aco', 0.8, 0.12, 0.9, f.x, Y1, f.z); // base
    m.caixa('grafite', 0.72, 1.45, 0.78, f.x, Y1 + 0.12, f.z); // corpo: face frontal em z + 0,39
    m.caixa('aco', 0.55, 0.05, 0.18, f.x, Y1 + 0.95, f.z + 0.34); // painel de botões
  }

  // ---- Mesa de ping-pong 2,74×1,525, h 0,76: tampo azul (tinta 0x1f4d7a), 4 pés de aço, rede ----
  const pp = item('pingpong');
  m.caixa('tinta', 2.74, 0.05, 1.525, pp.x, Y1 + 0.71, pp.z, 0, 0x1f4d7a); // tampo: topo em Y1+0,76
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      m.caixa('aco', 0.06, 0.71, 0.06, pp.x + sx * (2.74 / 2 - 0.12), Y1, pp.z + sz * (1.525 / 2 - 0.12));
  m.caixa('aco', 0.02, 0.14, 1.4, pp.x, Y1 + 0.76, pp.z); // rede central

  // ---- Estante na parede leste (rotY −π/2) e planta ----
  const es = item('estante');
  estante(m, es.x, Y1, es.z, -Math.PI / 2);
  const pl = item('planta');
  planta(m, pl.x, Y1, pl.z);

  const grupo = m.construir();
  cena.add(grupo);

  // ---- Telas vivas (nascem `off`; os modos serão ligados na S9) ----
  // TV 2,0×1,125 m, plano a 1,5 mm da face frontal da caixa (z = −1,945, §4.3), px 96×54, semente 0.
  const telaTv = telas.criar({
    pai: grupo,
    pos: new THREE.Vector3(tv.x, Y1 + 0.5 + 1.125 / 2, -1.945),
    rotY: 0,
    larg: 2.0,
    alt: 1.125,
    px: 96,
    py: 54,
    semente: 0,
  });
  // Fliperamas 0,50×0,375 m à frente do corpo (z + 0,39 + 1,5 mm), px 24×28, semente = índice (0 corrida, 1 luta).
  const fliperamas: [TelaViva, TelaViva] = [
    telas.criar({
      pai: grupo,
      pos: new THREE.Vector3(item('fliperama-a').x, Y1 + 0.9, item('fliperama-a').z + 0.395),
      rotY: 0,
      larg: 0.5,
      alt: 0.375,
      px: 24,
      py: 28,
      semente: 0,
    }),
    telas.criar({
      pai: grupo,
      pos: new THREE.Vector3(item('fliperama-b').x, Y1 + 0.9, item('fliperama-b').z + 0.395),
      rotY: 0,
      larg: 0.5,
      alt: 0.375,
      px: 24,
      py: 28,
      semente: 1,
    }),
  ];

  // ---- Bolinha do ping-pong: esfera r 0,035 branca, nascida invisível (a S9 liga `visible`
  // quando as duas pessoas estão paradas nos 2 lugares). Ponto inicial = início do trecho 0 (§4.5). ----
  const bolinha = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 1), MAT.branco);
  bolinha.position.set(19.95, Y1 + 0.96, 0.9);
  bolinha.visible = false;
  grupo.add(bolinha);

  // ---- Raquetes: disco 0,16 m vermelho + cabo de aço, apoiadas sobre o tampo, um em cada lado ----
  function raquete(x: number): THREE.Object3D {
    const g = new THREE.Group();
    const disco = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 18), MAT_RAQUETA);
    disco.position.y = 0.01;
    const cabo = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 10), MAT.aco);
    cabo.position.y = 0.06;
    g.add(disco, cabo);
    g.position.set(x, Y1 + 0.76, 0.9);
    return g;
  }
  const raquetes: [THREE.Object3D, THREE.Object3D] = [raquete(pp.x - 0.45), raquete(pp.x + 0.45)];
  for (const r of raquetes) grupo.add(r);

  // ---- Movimento da bolinha (§4.5): u = frac(t/1,1)*2; trecho = floor(u) (0 = oeste→leste,
  // 1 = leste→oeste, invertido); s = frac(u); arco parabólico 0,32 m sobre a rede.
  // Só atualiza quando `bolinha.visible` (a S9 liga a visibilidade). `agora` (epoch ms) já
  // entra por argumento — hoje fica reservado para o GOL/modos da S9; sem relógio global. ----
  function atualizar(_agora: number, t: number): void {
    if (!bolinha.visible) return;
    const u = ((t / 1.1) % 1) * 2;
    const trecho = Math.floor(u);
    const s = u - trecho;
    const x = trecho === 0 ? lerp(19.95, 22.65, s) : lerp(22.65, 19.95, s);
    const y = Y1 + 0.96 + 0.32 * 4 * s * (1 - s);
    bolinha.position.set(x, y, 0.9);
  }

  return { tv: telaTv, fliperamas, bolinha, raquetes, atualizar };
}
