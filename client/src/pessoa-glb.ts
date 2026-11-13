// Malha das pessoas: lê o GLB gerado no Blender (assets-src/pessoa/gerar.py) e monta, por pessoa, UMA geometria
// com cor por vértice. O arquivo traz uma peça por nó (corpo_m_longa, cabelo_3, barba_1, oculos, fone...) e cada
// material do Blender é uma região pintável (pele, blusa, calca...). O esqueleto NÃO vem daqui: os ossos são
// criados em people.ts (createBones) com os mesmos nomes e posições; do arquivo só saem os pesos.
//
// O leitor é próprio e síncrono (cabeçalho + JSON + binário do glTF 2.0, sem extensões): a montagem da pessoa
// continua síncrona, os testes rodam em Node sem carregador e não entra dependência nova.
import * as THREE from 'three';

/** Ordem dos ossos em people.ts (createBones): os índices de pele da geometria apontam para esta lista. */
export const OSSOS = [
  'hips', 'spine', 'neck', 'head', 'leftShoulder', 'leftElbow', 'rightShoulder', 'rightElbow',
  'leftHip', 'leftKnee', 'rightHip', 'rightKnee',
] as const;

/** Trecho contínuo de vértices [start, end) de uma região, para repintar depois (ex.: cordão do crachá). */
export type Faixa = { start: number; end: number };

/** Uma primitiva do arquivo: os vértices de UMA região de UMA peça. */
type Trecho = {
  regiao: string;
  position: Float32Array;
  normal: Float32Array;
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  index: Uint32Array;
};

let pecas: Map<string, Trecho[]> | undefined;

const COMPONENTES: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/** Lê o GLB e guarda as peças. Chamar uma vez antes de criar qualquer pessoa (ver carregarPessoas). */
export function instalarPessoas(glb: ArrayBuffer): void {
  const dv = new DataView(glb);
  if (dv.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) throw new Error('pessoa.glb: não é um arquivo GLB');
  // Blocos: JSON (a descrição) e BIN (os números).
  let json: any;
  let bin: DataView | undefined;
  for (let off = 12; off + 8 <= dv.byteLength;) {
    const tamanho = dv.getUint32(off, true);
    const tipo = dv.getUint32(off + 4, true);
    if (tipo === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, off + 8, tamanho)));
    else if (tipo === 0x004e4942) bin = new DataView(glb, off + 8, tamanho);
    off += 8 + tamanho;
  }
  if (!json || !bin) throw new Error('pessoa.glb: faltou o bloco JSON ou o binário');
  const dados = bin;

  // Um acessor vira um vetor de números, respeitando tipo, passo (byteStride) e normalização.
  const ler = (i: number): { valores: number[]; n: number } => {
    const a = json.accessors[i];
    const vista = json.bufferViews[a.bufferView];
    const n = COMPONENTES[a.type];
    const [bytes, pegar, escala] = ((): [number, (o: number) => number, number] => {
      switch (a.componentType) {
        case 5121: return [1, (o) => dados.getUint8(o), 1 / 255];
        case 5123: return [2, (o) => dados.getUint16(o, true), 1 / 65535];
        case 5125: return [4, (o) => dados.getUint32(o, true), 1];
        case 5126: return [4, (o) => dados.getFloat32(o, true), 1];
        default: throw new Error(`pessoa.glb: tipo de número não suportado (${a.componentType})`);
      }
    })();
    const base = (vista.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const passo = vista.byteStride ?? n * bytes;
    const valores = new Array<number>(a.count * n);
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
      const v = pegar(base + k * passo + c * bytes);
      valores[k * n + c] = a.normalized ? v * escala : v;
    }
    return { valores, n };
  };

  const novas = new Map<string, Trecho[]>();
  for (const no of json.nodes as any[]) {
    if (no.mesh === undefined || no.skin === undefined) continue;
    // Osso do arquivo -> posição na lista de people.ts.
    const juntas: number[] = (json.skins[no.skin].joints as number[]).map((j) => OSSOS.indexOf(json.nodes[j].name));
    if (juntas.includes(-1)) throw new Error(`pessoa.glb: osso desconhecido na peça ${no.name}`);
    const trechos: Trecho[] = [];
    for (const p of json.meshes[no.mesh].primitives as any[]) {
      const pos = ler(p.attributes.POSITION).valores;
      const nor = ler(p.attributes.NORMAL).valores;
      const jun = ler(p.attributes.JOINTS_0).valores;
      const pes = ler(p.attributes.WEIGHTS_0).valores;
      const skinIndex = new Uint16Array(jun.length);
      const skinWeight = new Float32Array(pes.length);
      for (let v = 0; v < jun.length; v += 4) {
        // Pesos somam 1; influência sem peso aponta para o osso 0 (valor neutro).
        const soma = pes[v] + pes[v + 1] + pes[v + 2] + pes[v + 3] || 1;
        for (let c = 0; c < 4; c++) {
          skinWeight[v + c] = pes[v + c] / soma;
          skinIndex[v + c] = pes[v + c] > 0 ? juntas[jun[v + c]] : 0;
        }
      }
      trechos.push({
        regiao: json.materials[p.material].name,
        position: Float32Array.from(pos),
        normal: Float32Array.from(nor),
        skinIndex,
        skinWeight,
        index: Uint32Array.from(ler(p.indices).valores),
      });
    }
    novas.set(no.name, trechos);
  }
  if (!novas.size) throw new Error('pessoa.glb: nenhuma peça com esqueleto');
  pecas = novas;
}

/** Baixa e instala o GLB (navegador). A promessa é única: chamadas repetidas reaproveitam o mesmo download. */
let carga: Promise<void> | undefined;
export function carregarPessoas(url = `${import.meta.env.BASE_URL}assets/people/pessoa.glb`): Promise<void> {
  carga ??= fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`pessoa.glb: resposta ${r.status} ao baixar ${url}`);
    instalarPessoas(await r.arrayBuffer());
  });
  return carga;
}

export function pessoasProntas(): boolean {
  return pecas !== undefined;
}

/**
 * Junta as peças pedidas numa geometria só (posição, normal, cor, pele), sem grupos: uma draw call.
 * `cor(regiao)` devolve a cor de cada região; `faixas` diz onde cada região ficou, para repintar depois.
 */
export function montarPessoa(nomes: readonly string[], cor: (regiao: string) => THREE.Color): { geometry: THREE.BufferGeometry; faixas: Map<string, Faixa[]> } {
  if (!pecas) throw new Error('Pessoas: chame carregarPessoas() (ou instalarPessoas) antes de criar uma pessoa');
  const trechos = nomes.flatMap((nome) => {
    const t = pecas!.get(nome);
    if (!t) throw new Error(`Pessoas: peça desconhecida "${nome}"`);
    return t;
  });
  let vertices = 0;
  let indices = 0;
  for (const t of trechos) {
    vertices += t.position.length / 3;
    indices += t.index.length;
  }
  const position = new Float32Array(vertices * 3);
  const normal = new Float32Array(vertices * 3);
  const color = new Float32Array(vertices * 3);
  const skinIndex = new Uint16Array(vertices * 4);
  const skinWeight = new Float32Array(vertices * 4);
  const index = new Uint32Array(indices);
  const faixas = new Map<string, Faixa[]>();
  let v0 = 0;
  let i0 = 0;
  for (const t of trechos) {
    const n = t.position.length / 3;
    position.set(t.position, v0 * 3);
    normal.set(t.normal, v0 * 3);
    skinIndex.set(t.skinIndex, v0 * 4);
    skinWeight.set(t.skinWeight, v0 * 4);
    const c = cor(t.regiao);
    for (let k = 0; k < n; k++) {
      color[(v0 + k) * 3] = c.r;
      color[(v0 + k) * 3 + 1] = c.g;
      color[(v0 + k) * 3 + 2] = c.b;
    }
    for (let k = 0; k < t.index.length; k++) index[i0 + k] = t.index[k] + v0;
    faixas.set(t.regiao, [...(faixas.get(t.regiao) ?? []), { start: v0, end: v0 + n }]);
    v0 += n;
    i0 += t.index.length;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  return { geometry, faixas };
}
