// Fachada e cobertura: lajes que avançam, brises verticais, pórtico de entrada, logo em relevo, letreiro 3D e telhado.
// Tudo estático e mesclado por material (poucas chamadas de desenho). O letreiro e a logo ganham luz à noite.
import * as THREE from 'three';
import { FontLoader, type Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { carregarLogo } from './logo';
import { lerNomeDoPredio, placaNome } from './placa';
import { emissivos } from './mobiliario';

const branco = new THREE.MeshStandardMaterial({ color: 0xeceae4, roughness: 0.55 });
const alu = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.4, metalness: 0.6 });
const concretoTopo = new THREE.MeshStandardMaterial({ color: 0x8b8f94, roughness: 0.9 });
const letreiro = new THREE.MeshStandardMaterial({ color: 0xf2f5f8, emissive: 0x9fe6ea, emissiveIntensity: 0.15, roughness: 0.3, metalness: 0.5 });
emissivos.push(letreiro);

// Caixas (x, y base, z, w, h, d) em uma só malha.
function fundir(mat: THREE.Material, caixas: number[][], castShadow = true): THREE.Mesh {
  const gs = caixas.map(([x, y, z, w, h, d]) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z));
  const m = new THREE.Mesh(mergeGeometries(gs.map((g) => g.toNonIndexed()), false)!, mat);
  gs.forEach((g) => g.dispose());
  m.castShadow = castShadow;
  m.receiveShadow = true;
  return m;
}

export interface Fachada { telhado: THREE.Group; luzLogo: THREE.PointLight }

/** Largura máxima do letreiro 3D (m): cabe entre as bordas da laje do topo. */
export const LETREIRO_LARGURA_MAX = 15;
/** Respiro entre as letras do letreiro (m): a fonte em negrito cola uma letra na outra. */
const LETREIRO_RESPIRO = 0.11;

/**
 * Letreiro em letras-caixa: cada letra é extrudada sozinha e posta com respiro; a frente usa o material
 * que acende e as laterais um grafite. Com tudo branco e colado, visto de lado o nome virava um borrão.
 * Devolve uma geometria só, com dois grupos (0 = frentes, 1 = laterais), já centrada em x.
 */
export function letrasCaixa(fonte: Font, texto: string, tamanho: number, fundo: number): THREE.BufferGeometry {
  const escala = tamanho / fonte.data.resolution;
  const partes: Array<{ pos: number[]; nor: number[] }> = [{ pos: [], nor: [] }, { pos: [], nor: [] }];
  let x = 0;
  for (const letra of texto) {
    const avanco = (fonte.data.glyphs[letra] ?? fonte.data.glyphs['?'])?.ha ?? fonte.data.resolution * 0.5;
    if (letra !== ' ') {
      const g = new TextGeometry(letra, { font: fonte, size: tamanho, depth: fundo, curveSegments: 5, bevelEnabled: false });
      g.translate(x, 0, 0);
      const pos = g.getAttribute('position').array, nor = g.getAttribute('normal').array;
      // A extrusão vem com dois grupos: 0 = tampas (frente e verso), 1 = laterais.
      for (const gr of g.groups) {
        const alvo = partes[gr.materialIndex === 0 ? 0 : 1];
        for (let i = gr.start * 3; i < (gr.start + gr.count) * 3; i++) { alvo.pos.push(pos[i]); alvo.nor.push(nor[i]); }
      }
      g.dispose();
    }
    x += avanco * escala + LETREIRO_RESPIRO;
  }
  const largura = Math.max(0, x - LETREIRO_RESPIRO);
  const saida = new THREE.BufferGeometry();
  saida.setAttribute('position', new THREE.Float32BufferAttribute([...partes[0].pos, ...partes[1].pos], 3));
  saida.setAttribute('normal', new THREE.Float32BufferAttribute([...partes[0].nor, ...partes[1].nor], 3));
  saida.addGroup(0, partes[0].pos.length / 3, 0);
  saida.addGroup(partes[0].pos.length / 3, partes[1].pos.length / 3, 1);
  saida.translate(-largura / 2, 0, 0);
  saida.userData.largura = largura;
  return saida;
}

export function montarFachada(cena: THREE.Scene, L: number, P: number, ALT: number): Fachada {
  const meiaL = L / 2, meiaP = P / 2;

  // Lajes que avançam: bordas brancas nos pisos 6 e 12, dando o desenho de "pratos" empilhados.
  const bordas: number[][] = [];
  for (const y of [ALT, ALT * 2]) {
    bordas.push([0, y - 0.45, meiaP + 0.7, L + 1.4, 0.6, 1.5]); // frente
    bordas.push([0, y - 0.45, -meiaP - 0.7, L + 1.4, 0.6, 1.5]); // fundos
    for (const s of [-1, 1]) bordas.push([s * (meiaL + 0.7), y - 0.45, 0, 1.5, 0.6, P]);
  }
  cena.add(fundir(branco, bordas));

  // Brises verticais: ritmo de aletas escuras na frente (fora do vão da entrada) e nas laterais.
  const aletas: number[][] = [];
  for (let x = -meiaL + 1; x <= meiaL - 0.9; x += 3) if (Math.abs(x) > 6.2) aletas.push([x, 0, meiaP + 0.55, 0.14, ALT * 2 - 0.2, 0.9]);
  for (let z = -meiaP + 2; z <= meiaP - 1; z += 4) for (const s of [-1, 1]) aletas.push([s * (meiaL + 0.55), 0, z, 0.9, ALT * 2 - 0.2, 0.14]);
  cena.add(fundir(alu, aletas));

  // Pórtico da entrada: dois pilares brancos e viga alta, emoldurando a porta e a logo.
  const portico: number[][] = [];
  for (const s of [-1, 1]) portico.push([s * 6, 0, meiaP + 0.9, 0.9, ALT * 2 - 0.3, 1.8]);
  portico.push([0, ALT * 2 - 1.4, meiaP + 0.9, 12.9, 1.1, 1.8]);
  cena.add(fundir(branco, portico));

  // Logo em relevo dentro do pórtico; letreiro 3D com o nome do prédio em faixa própria acima da laje do topo.
  const nome = lerNomeDoPredio();
  // Logo: escala menor (3,6 m) e centro em y=ALT+2,4 — fica inteira entre o chão e a viga do pórtico
  // (topo ~3,0 m < viga em 10,6 m), sem ser cortada pela meia-luz nem pela viga.
  // `carregarLogo` usa fetch, fora do gerenciador de carga do Three: avisar início e fim faz o `onLoad`
  // disparar e a tela ganhar um quadro quando a logo entra (rede lenta: ela chegava e não aparecia).
  THREE.DefaultLoadingManager.itemStart('local/logo:fachada');
  Promise.all([carregarLogo('/local/logo.svg', 3.6, 0.5), nome]).then(([logo, texto]) => {
    const alvo = logo ?? placaNome(texto, 9);
    alvo.position.set(0, ALT + 2.4, meiaP + 1.1);
    alvo.castShadow = true;
    cena.add(alvo);
  }).finally(() => THREE.DefaultLoadingManager.itemEnd('local/logo:fachada'));
  Promise.all([new FontLoader().loadAsync('/assets/fonts/helvetiker_bold.typeface.json'), nome]).then(([fonte, texto]) => {
    const g = letrasCaixa(fonte, texto, 1.35, 0.28);
    const k = Math.min(1, LETREIRO_LARGURA_MAX / (g.userData.largura as number)); // nome comprido: letra menor, mesma faixa
    g.scale(k, k, 1);
    const t = new THREE.Mesh(g, [letreiro, alu]);
    // Base em y=12,4: sobe da borda da laje de topo (que termina em 12,15) pra uma faixa própria,
    // sem sobrepor a viga do pórtico (10,6–11,7) nem as brises (morrem em 11,8).
    t.position.set(0, ALT * 2 + 0.4, meiaP + 0.9);
    t.castShadow = true;
    cena.add(t);
  }).catch(() => {});

  // Luz dirigida à logo à noite (a intensidade vem do main); acompanha a nova altura da logo.
  const luzLogo = new THREE.PointLight(0xfff1d6, 0, 18, 1.6);
  luzLogo.position.set(0, ALT + 2.7, meiaP + 5);
  cena.add(luzLogo);

  // Telhado: laje com platibanda, casa de máquinas e caixa-d'água. Some quando a câmera foca um andar.
  const telhado = new THREE.Group();
  const laje = fundir(branco, [[0, ALT * 3 - 0.4, -4, L + 0.6, 0.4, 24.6 + 1.8]]);
  telhado.add(laje);
  telhado.add(fundir(concretoTopo, [[0, ALT * 3, -4, L, 0.03, 24.6]], false));
  telhado.add(fundir(branco, [
    [0, ALT * 3, -meiaP - 0.1, L + 0.6, 0.55, 0.3],
    [-meiaL - 0.15, ALT * 3, -4, 0.3, 0.55, 24.6],
    [meiaL + 0.15, ALT * 3, -4, 0.3, 0.55, 24.6],
    [0, ALT * 3, 8.6, L + 0.6, 0.55, 0.3],
  ]));
  telhado.add(fundir(alu, [[-12, ALT * 3, -10, 6, 1.8, 4], [8, ALT * 3, -12, 8, 1.3, 3], [16, ALT * 3, -2, 3, 2.4, 3]]));
  cena.add(telhado);

  return { telhado, luzLogo };
}
