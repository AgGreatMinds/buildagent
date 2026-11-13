// Pessoas do prédio: malha modelada no Blender (pessoa-glb.ts), animada por um esqueleto criado aqui.
import * as THREE from 'three';
import { marcarCompartilhado } from './liberar';
import { montarPessoa, type Faixa } from './pessoa-glb';
import { posturaAlvos, type AlvosPostura, type NomePostura } from './vida/posturas';
import { semente } from './cor-projeto';

export type Estado = 'working' | 'waiting' | 'idle' | 'shell' | 'done' | 'offline';

// Paletas corporativas estáveis; as cores são gravadas por vértice para preservar uma única draw call.
export const SKIN_TONES = [0xf1c8a5, 0xd9a07a, 0xb97b56, 0x8d5a3c, 0x6b4129, 0xffdbc1, 0xa36c4e, 0x503326, 0x38251f];
export const CLOTHES = [
  0x29496f, 0x52758a, 0x698c9a, 0x315f57, 0x667b59, 0x8b9673,
  0x743f4e, 0xad7885, 0xc79d98, 0x59436f, 0x4b4d58, 0x82878a,
  0x82652f, 0xa28869, 0x725447, 0xb5a58e, 0xd8d4c7, 0xe9e5db,
];
export const HAIR = [0x181412, 0x34251b, 0x68472b, 0x111216, 0x8b7257, 0xa58352, 0x754332, 0xaaa7a0, 0xd3c9b1];
const TROUSERS = [0x273140, 0x36383e, 0x4d433b, 0x65615a, 0x77776d, 0x394d45, 0x98866e, 0xb4afa1];
const SHOES = [0x17191d, 0x4a3328, 0x8a8175, 0x373e48, 0x6b5142, 0xc7c2b7];
const BODY_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.82,
  metalness: 0.02,
  side: THREE.DoubleSide, // cabelo e barba são cascas de uma face só: de dois lados não ficam ocos
});
marcarCompartilhado(BODY_MATERIAL); // usado por todas as pessoas: liberarArvore (liberar.ts) não descarta
// Meia distância entre os ombros: igual à da malha (assets-src/pessoa/gerar.py, SX).
const SHOULDER_X = 0.192;
// A cabeça da malha é ampliada em torno da base do queixo: proporção estilizada, rosto legível a 10 m.
const HEAD_BASE_Y = 1.47;
const HEAD_SCALE = 1.14;

// O hash de semente mora em cor-projeto.ts (puro): o painel usa o mesmo para a cor do projeto.
export { semente };

// Mistura a semente inteira: sementes consecutivas também produzem pessoas distintas.
// `look` ('f'|'m') vem do nome dado pelo servidor; ausente = sorteio da semente (pessoa nomeada, como "Iris").
export function aparencia(seed: number, archetype = seed % 8, look?: 'f' | 'm') {
  let state = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b) >>> 0;
  const pick = (count: number) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) % count;
  };
  return {
    skin: pick(SKIN_TONES.length), hair: pick(10), hairColor: pick(HAIR.length),
    outfit: archetype === 0 ? 1 : pick(8), color: pick(CLOTHES.length),
    build: pick(3), height: 0.94 + pick(121) / 1000, feminine: ((sorteio: boolean) => (look === undefined ? sorteio : look === 'f'))(pick(2) === 0),
    beard: pick(5), glasses: pick(archetype === 2 ? 4 : 8), headset: pick(5) === 0,
    watch: pick(3) === 0, backpack: pick(9) === 0, trousers: pick(8), shoes: pick(6), pattern: pick(4),
  };
}

type BoneSet = {
  hips: THREE.Bone;
  spine: THREE.Bone;
  neck: THREE.Bone;
  head: THREE.Bone;
  leftShoulder: THREE.Bone;
  leftElbow: THREE.Bone;
  rightShoulder: THREE.Bone;
  rightElbow: THREE.Bone;
  leftHip: THREE.Bone;
  leftKnee: THREE.Bone;
  rightHip: THREE.Bone;
  rightKnee: THREE.Bone;
};


function createBones(): { bones: BoneSet; skeleton: THREE.Skeleton; list: THREE.Bone[] } {
  const namedBone = (name: string) => {
    const bone = new THREE.Bone();
    bone.name = name;
    return bone;
  };
  const hips = namedBone('hips');
  const spine = namedBone('spine');
  const neck = namedBone('neck');
  const head = namedBone('head');
  const leftShoulder = namedBone('leftShoulder');
  const leftElbow = namedBone('leftElbow');
  const rightShoulder = namedBone('rightShoulder');
  const rightElbow = namedBone('rightElbow');
  const leftHip = namedBone('leftHip');
  const leftKnee = namedBone('leftKnee');
  const rightHip = namedBone('rightHip');
  const rightKnee = namedBone('rightKnee');

  // Pés em y=0 e altura total ~1,76 m: pernas 45% da altura, tronco longo e cabeça estilizada maior.
  hips.position.y = 0.8;
  spine.position.y = 0.26; // a coluna dobra na cintura (1,06 m), como ao se inclinar para o teclado
  neck.position.y = 0.36;
  head.position.y = 0.16; // pivô da cabeça em 1,58 m
  leftShoulder.position.set(-SHOULDER_X, 0.27, 0);
  rightShoulder.position.set(SHOULDER_X, 0.27, 0);
  leftElbow.position.y = rightElbow.position.y = -0.27;
  leftHip.position.x = -0.09;
  rightHip.position.x = 0.09;
  leftKnee.position.y = rightKnee.position.y = -0.37;

  hips.add(spine, leftHip, rightHip);
  spine.add(neck, leftShoulder, rightShoulder);
  neck.add(head);
  leftShoulder.add(leftElbow);
  rightShoulder.add(rightElbow);
  leftHip.add(leftKnee);
  rightHip.add(rightKnee);

  const list = [hips, spine, neck, head, leftShoulder, leftElbow, rightShoulder, rightElbow, leftHip, leftKnee, rightHip, rightKnee];
  return {
    bones: { hips, spine, neck, head, leftShoulder, leftElbow, rightShoulder, rightElbow, leftHip, leftKnee, rightHip, rightKnee },
    skeleton: new THREE.Skeleton(list),
    list,
  };
}

// Escolhe as peças da malha e as cores de cada região a partir da aparência sorteada pela semente.
function createBody(seed: number, archetype: number, genero?: 'f' | 'm') {
  const look = aparencia(seed, archetype, genero);
  const luminance = (c: THREE.Color) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
  // Mantém os tons de pele, elevando a luz do rosto e separando-o do cabelo.
  const skin = new THREE.Color(SKIN_TONES[look.skin]).lerp(new THREE.Color(0xffe3cb), 0.16);
  const clothing = new THREE.Color(CLOTHES[look.color]);
  const hair = new THREE.Color(HAIR[look.hairColor]);
  hair.multiplyScalar(Math.min(1, luminance(skin) * 0.65 / luminance(hair)));
  const shoes = new THREE.Color(SHOES[look.shoes]);
  // Famílias de roupa: 0 camisa social, 1 e 3 blazer, 2 blusa, 4 suéter de gola alta, 5 camiseta (manga curta),
  // 6 cardigã, 7 colete. Na malha a família muda a manga e a gola; a cor vem de CLOTHES.
  const light = new THREE.Color(look.color === 2 ? 0xc0a088 : 0xd8dde2);
  const collar = look.outfit === 4 ? clothing
    : look.outfit === 5 ? clothing.clone().multiplyScalar(0.62)
    : look.outfit === 2 || look.outfit === 6 ? clothing.clone().lerp(new THREE.Color(0xffffff), 0.28)
    : light;
  const colors: Record<string, THREE.Color> = {
    pele: skin,
    blusa: clothing,
    gola: collar,
    calca: new THREE.Color(TROUSERS[look.trousers]),
    sapato: shoes,
    sola: luminance(shoes) > 0.35 ? new THREE.Color(0xeeeae2) : shoes.clone().lerp(new THREE.Color(0x8c8378), 0.45),
    cabelo: hair,
    // Sobrancelhas um tom abaixo do cabelo: o olhar continua legível mesmo com cabelo claro ou grisalho.
    sobrancelha: hair.clone().multiplyScalar(0.62),
    olho: new THREE.Color(0x221c18),
    brilho: new THREE.Color(0xffffff),
    boca: skin.clone().lerp(new THREE.Color(0x7a2e2a), 0.55).multiplyScalar(0.66),
    cracha: new THREE.Color(0xeeeae3),
    cordao: new THREE.Color(0x5f7185), // cor neutra até definirCracha pintar a do projeto
    acessorio: new THREE.Color(0x252b32),
  };
  const pieces = [`corpo_${look.feminine ? 'f' : 'm'}_${look.outfit === 5 ? 'curta' : 'longa'}`, `cabelo_${look.hair}`];
  if (!look.feminine && look.beard === 0) pieces.push('barba_1'); // barba cheia
  if (!look.feminine && look.beard === 2) pieces.push('barba_2'); // cavanhaque
  if (look.glasses < 3) pieces.push('oculos');
  if (look.headset) pieces.push('fone');
  const { geometry, faixas } = montarPessoa(pieces, (regiao) => colors[regiao] ?? skin);

  // Amplia cabeça, rosto, cabelo e acessórios juntos, na proporção do peso do osso da cabeça (o pescoço acompanha).
  const position = geometry.getAttribute('position');
  const skinIndex = geometry.getAttribute('skinIndex');
  const skinWeight = geometry.getAttribute('skinWeight');
  const HEAD = 3; // posição de 'head' na lista de ossos
  for (let i = 0; i < position.count; i++) {
    let w = 0;
    for (let c = 0; c < 4; c++) if (skinIndex.getComponent(i, c) === HEAD) w += skinWeight.getComponent(i, c);
    if (w === 0) continue;
    const k = 1 + (HEAD_SCALE - 1) * w;
    position.setXYZ(i, position.getX(i) * k, HEAD_BASE_Y + (position.getY(i) - HEAD_BASE_Y) * k, position.getZ(i) * k);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  // Cordão e faixa do crachá: as regiões que definirCracha repinta com a cor do projeto.
  return { geometry, badgeRanges: faixas.get('cordao') ?? [] as Faixa[] };
}

// Modelo puro compartilhado pela pessoa e pelos testes de orçamento, sem canvas ou WebGL.
export function modeloPessoa(seed: number, genero?: 'f' | 'm') {
  const rig = createBones();
  return { rig, ...createBody(seed, seed % 8, genero) };
}

function damp(current: number, target: number, speed: number, dt: number): number {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-speed * dt));
}

function dampAngle(current: number, target: number, speed: number, dt: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-speed * dt));
}

export class Pessoa {
  readonly grupo = new THREE.Group();
  readonly arquetipo: number;
  estado: Estado = 'idle';
  mesa = new THREE.Vector3();
  descanso = new THREE.Vector3();
  mesaOlhar = 0;
  private readonly alvo = new THREE.Vector3();
  // Controle externo (predio.ts): destino, velocidade e se fica sentada ao chegar. `manual` desliga o
  // comportamento antigo de ir sozinha à mesa/descanso por estado.
  private manual = false;
  private sentar = false;
  private vel = 1.3;
  private readonly corpo: THREE.SkinnedMesh;
  private readonly bones: BoneSet;
  private readonly badgeRanges: Faixa[];
  private readonly labelCanvas: HTMLCanvasElement;
  private readonly labelTexture: THREE.CanvasTexture;
  private readonly labelSprite: THREE.Sprite;
  private readonly fase: number;
  private contagem = 1;
  private passo = 0;
  // Postura de vida social (S6b): nome da pose da tabela 4.4 e lado do par no ping-pong.
  // `alvosPostura` é alocado uma vez e reutilizado a cada quadro (posturaAlvos escreve no lugar).
  private postura: NomePostura | null = null;
  private ladoPostura: 0 | 1 = 0;
  private readonly alvosPostura: AlvosPostura = {
    hipsY: 0, hipsZ: 0, spineX: 0, spineZ: 0, headX: 0,
    leftShoulderX: 0, rightShoulderX: 0, leftShoulderY: 0, rightShoulderY: 0,
    leftShoulderZ: 0, rightShoulderZ: 0, leftElbowX: 0, rightElbowX: 0,
    leftHipX: 0, rightHipX: 0, leftKneeX: 0, rightKneeX: 0,
  };

  constructor(readonly nome: string, readonly papel: string, seed = semente(nome), genero?: 'f' | 'm') {
    this.arquetipo = seed % 8;
    this.fase = (seed % 628) / 100;
    const body = modeloPessoa(seed, genero);
    const rig = body.rig;
    this.bones = rig.bones;
    this.badgeRanges = body.badgeRanges;
    this.corpo = new THREE.SkinnedMesh(body.geometry, BODY_MATERIAL);
    this.corpo.name = `Pessoa:${nome}`;
    this.corpo.castShadow = true;
    this.corpo.receiveShadow = true;
    this.corpo.add(rig.bones.hips);
    this.corpo.bind(rig.skeleton);
    // Amplia a faixa de altura (0,94–1,06 → ~0,90–1,10): baixos e altos se distinguem de longe.
    // Compleição (magra, média, forte): largura e profundidade do corpo inteiro; os ossos acompanham a escala.
    const look = aparencia(seed, this.arquetipo, genero);
    const altura = 1 + (look.height - 1) * 1.6;
    const largura = [0.95, 1, 1.06][look.build];
    this.corpo.scale.set(altura * largura, altura, altura * largura);

    // A etiqueta é o único objeto renderizável além do corpo e continua oclusa pela cena.
    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.width = 320;
    this.labelCanvas.height = 84;
    this.labelTexture = new THREE.CanvasTexture(this.labelCanvas);
    this.labelTexture.colorSpace = THREE.SRGBColorSpace;
    this.labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.labelTexture, transparent: true, depthTest: true, depthWrite: false }));
    this.labelSprite.scale.set(1.18, 0.31, 1);
    this.labelSprite.position.y = 2.1; // acima do cabelo mais volumoso, com a cabeça maior
    this.drawLabel();
    this.grupo.add(this.corpo, this.labelSprite);
  }

  // Redesenha a textura existente para adicionar ou remover o badge de agrupamento sem criar outro sprite.
  private drawLabel() {
    const context = this.labelCanvas.getContext('2d')!;
    context.clearRect(0, 0, this.labelCanvas.width, this.labelCanvas.height);
    context.fillStyle = 'rgba(12,16,22,.82)';
    context.beginPath();
    context.roundRect(4, 4, 312, 76, 16);
    context.fill();
    context.textAlign = 'center';
    context.fillStyle = '#f2f5f8';
    context.font = '600 27px -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
    context.fillText(this.nome.slice(0, 18), 160, 37);
    context.fillStyle = 'rgba(242,245,248,.64)';
    context.font = '18px -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
    context.fillText(this.papel.slice(0, 28), 160, 64);
    if (this.contagem > 1) {
      context.fillStyle = '#dbe8f5';
      context.beginPath();
      context.roundRect(260, 10, 48, 26, 9);
      context.fill();
      context.fillStyle = '#16212d';
      context.font = '700 16px -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
      context.fillText(`×${this.contagem}`, 284, 29);
    }
    this.labelTexture.needsUpdate = true;
  }

  definirContagem(n: number) {
    const c = Math.max(1, Math.floor(Number.isFinite(n) ? n : 1));
    if (c === this.contagem) return; // sem mudança: não repinta nem reenvia a textura (o passo chama 1×/s por pessoa)
    this.contagem = c;
    this.drawLabel();
  }

  definirCracha(corHex: number) {
    const color = new THREE.Color(corHex);
    const colors = this.corpo.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (const range of this.badgeRanges) {
      for (let i = range.start; i < range.end; i++) colors.setXYZ(i, color.r, color.g, color.b);
    }
    colors.needsUpdate = true;
  }

  // Pessoas trabalhando, esperando ou em shell vão à mesa; os demais estados usam a área comum.
  definirEstado(e: Estado) {
    this.estado = e;
    if (this.manual) return; // com rota externa, quem decide o destino é o prédio
    const naMesa = e === 'working' || e === 'waiting' || e === 'shell';
    this.sentar = naMesa;
    this.alvo.copy(naMesa ? this.mesa : this.descanso);
  }

  // Vai até (x, y, z) na velocidade `vel` (m/s); `sentar` = senta/digita ao chegar, olhando para `olhar` (rad).
  irPara(x: number, y: number, z: number, opcoes: { sentar?: boolean; olhar?: number; vel?: number } = {}) {
    this.manual = true;
    this.alvo.set(x, y, z);
    this.sentar = !!opcoes.sentar;
    this.vel = opcoes.vel ?? 1.3;
    if (opcoes.olhar !== undefined) this.mesaOlhar = opcoes.olhar;
  }

  // Teletransporta (elevador, entrada): usado só para trocar de andar dentro do elevador.
  colocar(x: number, y: number, z: number) {
    this.grupo.position.set(x, y, z);
    this.alvo.set(x, y, z);
  }

  // Postura de vida social (4.4): `null` volta ao valor de pé; `lado` só importa no ping-pong.
  // Só vale com a pessoa parada e fora da mesa (andar tem prioridade — ver `atualizar`).
  definirPostura(nome: NomePostura | null, lado: 0 | 1 = 0) {
    this.postura = nome;
    this.ladoPostura = lado;
  }

  // Chegou ao destino (parada).
  get parada(): boolean {
    const d = this.alvo.clone().sub(this.grupo.position);
    d.y = 0;
    return d.length() <= 0.05;
  }

  // Sentido da caminhada no chão (unitário) escrito em `saida`; false quando está parada.
  // Usado pelo desvio de quem se cruza (desvio.ts), sem expor o alvo.
  rumo(saida: { dx: number; dz: number }): boolean {
    const dx = this.alvo.x - this.grupo.position.x, dz = this.alvo.z - this.grupo.position.z;
    const d = Math.hypot(dx, dz);
    if (d <= 0.05) return false;
    saida.dx = dx / d;
    saida.dz = dz / d;
    return true;
  }

  atualizar(dt: number, t: number) {
    const position = this.grupo.position;
    const direction = this.alvo.clone().sub(position);
    direction.y = 0;
    const distance = direction.length();
    const walking = distance > 0.05;
    if (walking) {
      direction.normalize();
      position.addScaledVector(direction, Math.min(distance, this.vel * dt));
      this.grupo.rotation.y = dampAngle(this.grupo.rotation.y, Math.atan2(direction.x, direction.z), 10, dt);
    }

    const atDesk = !walking && this.sentar && (this.estado === 'working' || this.estado === 'waiting' || this.estado === 'shell');
    // A fase acumula distância percorrida: desacelerar encurta o passo sem deslizar.
    this.passo += walking ? Math.min(distance, this.vel * dt) * 6.2 * (1.3 / Math.max(1.3, this.vel)) : 0;
    const phase = this.passo + this.fase;
    const stride = Math.sin(phase);
    // Os braços balançam em oposição às pernas, com um leve atraso que dá peso ao movimento.
    const swing = Math.sin(phase - 0.35);
    const breathe = Math.sin(t * 1.35 + this.fase);
    const poseSpeed = walking ? 12 : 7;

    // Alvos de pose: cada estado parte de uma postura humana neutra e transiciona por amortecimento.
    let hipsY = 0.8 + (walking ? Math.abs(stride) * 0.022 : breathe * 0.004);
    let hipsZ = 0;
    let spineX = walking ? 0.06 : breathe * 0.012;
    let spineZ = walking ? stride * 0.03 : Math.sin(t * 0.42 + this.fase) * 0.018;
    let headX = walking ? -0.04 : -breathe * 0.01;
    // Repouso: braços levemente afastados do quadril, cotovelos um pouco dobrados e mãos à frente da coxa.
    let leftShoulderX = walking ? -swing * 0.5 : 0.04 + breathe * 0.025;
    let rightShoulderX = walking ? swing * 0.5 : 0.04 - breathe * 0.025;
    let leftShoulderY = 0;
    let rightShoulderY = 0;
    let leftShoulderZ = -0.075 - (walking ? Math.abs(swing) * 0.03 : 0);
    let rightShoulderZ = 0.075 + (walking ? Math.abs(swing) * 0.03 : 0);
    let leftElbowX = walking ? -0.28 - Math.max(0, swing) * 0.42 : -0.22 - breathe * 0.02;
    let rightElbowX = walking ? -0.28 - Math.max(0, -swing) * 0.42 : -0.22 + breathe * 0.02;
    let leftHipX = walking ? stride * 0.6 : 0;
    let rightHipX = walking ? -stride * 0.6 : 0;
    let leftKneeX = walking ? Math.max(0, -stride) * 0.5 : 0;
    let rightKneeX = walking ? Math.max(0, stride) * 0.5 : 0;

    if (atDesk) {
      // Sentada na frente do assento, coxas sobre a almofada, canelas a prumo e tronco inclinado ao teclado.
      hipsY = 0.57;
      hipsZ = 0.13;
      spineX = this.estado === 'waiting' ? 0.18 : 0.3;
      spineZ = 0;
      headX = -0.16 + Math.sin(t * 0.7 + this.fase) * 0.018;
      leftHipX = rightHipX = -1.32;
      leftKneeX = rightKneeX = 1.32;
      // Braços à frente e um pouco para dentro: as mãos chegam ao teclado (0,68 m à frente, 0,82 m de altura).
      leftShoulderX = rightShoulderX = this.estado === 'waiting' ? -0.74 : -0.86;
      leftShoulderY = 0.3;
      rightShoulderY = -0.3;
      leftShoulderZ = -0.04;
      rightShoulderZ = 0.04;
      // Digitação: toques pequenos e alternados; em espera, mãos paradas sobre a mesa.
      const typing = this.estado === 'waiting' ? 0 : 0.035;
      leftElbowX = -0.9 + Math.sin(t * 9 + this.fase) * typing;
      rightElbowX = -0.9 + Math.sin(t * 9 + this.fase + 1.7) * typing;
      this.grupo.rotation.y = dampAngle(this.grupo.rotation.y, this.mesaOlhar, 9, dt);
    }

    // Parada fora da mesa (conversa, lounge): vira para o `olhar` combinado, p.ex. de frente para o parceiro.
    if (!walking && !atDesk && this.manual) this.grupo.rotation.y = dampAngle(this.grupo.rotation.y, this.mesaOlhar, 8, dt);
    if (!walking && !atDesk && this.estado !== 'offline') {
      // Conversa com gesto pequeno e intermitente, sem levantar o braço inteiro.
      const gesture = Math.max(0, Math.sin(t * 0.8 + this.fase));
      rightElbowX = -0.22 - gesture * 0.8;
      rightShoulderX -= gesture * 0.12;
      rightShoulderZ = 0.075 + gesture * 0.1;
    }

    // Postura de vida social (S6b): parada, fora da mesa e com postura definida, os alvos da
    // tabela 4.4 sobrepõem os campos acima. Escreve no `alvosPostura` reutilizado (sem alocar
    // por quadro) — fliperama/ping-pong já deixam os braços na pose da tabela, sem objeto novo.
    if (!walking && !atDesk && this.postura) {
      const a = posturaAlvos(this.alvosPostura, this.postura, t, this.fase, this.ladoPostura);
      hipsY = a.hipsY;
      hipsZ = a.hipsZ;
      spineX = a.spineX;
      spineZ = a.spineZ;
      headX = a.headX;
      leftShoulderX = a.leftShoulderX;
      rightShoulderX = a.rightShoulderX;
      leftShoulderY = a.leftShoulderY;
      rightShoulderY = a.rightShoulderY;
      leftShoulderZ = a.leftShoulderZ;
      rightShoulderZ = a.rightShoulderZ;
      leftElbowX = a.leftElbowX;
      rightElbowX = a.rightElbowX;
      leftHipX = a.leftHipX;
      rightHipX = a.rightHipX;
      leftKneeX = a.leftKneeX;
      rightKneeX = a.rightKneeX;
    }
    this.bones.hips.rotation.y = damp(this.bones.hips.rotation.y, walking ? stride * 0.065 : 0, poseSpeed, dt);
    // A coluna compensa o quadril: os ombros seguem a hierarquia com leve rotação oposta.
    this.bones.spine.rotation.y = damp(this.bones.spine.rotation.y, walking ? -stride * 0.11 : 0, poseSpeed, dt);
    this.bones.head.rotation.y = damp(this.bones.head.rotation.y, Math.sin(t * 0.53 + this.fase) * (atDesk ? 0.035 : 0.075), 5, dt);
    this.bones.hips.position.y = damp(this.bones.hips.position.y, hipsY, poseSpeed, dt);
    this.bones.hips.position.z = damp(this.bones.hips.position.z, hipsZ, poseSpeed, dt);
    this.bones.spine.rotation.x = damp(this.bones.spine.rotation.x, spineX, poseSpeed, dt);
    this.bones.spine.rotation.z = damp(this.bones.spine.rotation.z, spineZ, poseSpeed, dt);
    this.bones.head.rotation.x = damp(this.bones.head.rotation.x, headX, poseSpeed, dt);
    this.bones.leftShoulder.rotation.x = damp(this.bones.leftShoulder.rotation.x, leftShoulderX, poseSpeed, dt);
    this.bones.rightShoulder.rotation.x = damp(this.bones.rightShoulder.rotation.x, rightShoulderX, poseSpeed, dt);
    this.bones.leftShoulder.rotation.y = damp(this.bones.leftShoulder.rotation.y, leftShoulderY, poseSpeed, dt);
    this.bones.rightShoulder.rotation.y = damp(this.bones.rightShoulder.rotation.y, rightShoulderY, poseSpeed, dt);
    this.bones.leftShoulder.rotation.z = damp(this.bones.leftShoulder.rotation.z, leftShoulderZ, poseSpeed, dt);
    this.bones.rightShoulder.rotation.z = damp(this.bones.rightShoulder.rotation.z, rightShoulderZ, poseSpeed, dt);
    this.bones.leftElbow.rotation.x = damp(this.bones.leftElbow.rotation.x, leftElbowX, poseSpeed, dt);
    this.bones.rightElbow.rotation.x = damp(this.bones.rightElbow.rotation.x, rightElbowX, poseSpeed, dt);
    this.bones.leftHip.rotation.x = damp(this.bones.leftHip.rotation.x, leftHipX, poseSpeed, dt);
    this.bones.rightHip.rotation.x = damp(this.bones.rightHip.rotation.x, rightHipX, poseSpeed, dt);
    this.bones.leftKnee.rotation.x = damp(this.bones.leftKnee.rotation.x, leftKneeX, poseSpeed, dt);
    this.bones.rightKnee.rotation.x = damp(this.bones.rightKnee.rotation.x, rightKneeX, poseSpeed, dt);
  }
}
