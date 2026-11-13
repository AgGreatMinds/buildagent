// Protótipo do prédio: fachada de vidro com a logo, térreo com recepção, andar 1 com fileiras de projeto e pessoas.
// Planta em metros: prédio 48 (X) × 32 (Z); fachada voltada para +Z; térreo em y=0, andar 1 em y=6.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { carregarLogo } from './logo';
import { carregarPessoas, pessoasProntas } from './pessoa-glb';
import { conectar, DEMO, agenteDoSnapshot } from './dados';
import { Predio } from './predio';
import { Telas } from './telas/telas';
import type { AgenteEntrada } from './vida/tipos';
import { montarLista } from './painel/lista';
import { montarFeed } from './painel/feed';
import { montarAjuda } from './painel/ajuda';
import { montarDetalhe } from './painel/detalhe';
import { getApelido } from './painel/salas'; // apelido local da sala (só localStorage)
import { FILEIRA_APP, chaveDaFileira, reservarCores } from './cor-projeto'; // fileira de app e registro de cor: a lista usa a mesma regra e o mesmo registro
import { texto as textoPainel } from './painel/texto';
import { montarPainel } from './painel';
import { montarReplay } from './painel/replay';
import './painel/identidade.css'; // identidade visual por cima do painel.css // barra superior; os toggles ligam lista, atividade e ajuda
import { Mundo, horaAtual } from './mundo';
import { Cidade } from './cidade';
import * as M from './mobiliario';
import { montarEstatico, texturaPedra, texturaRipado, atualizarRelogio } from './interior';
import { montarFachada } from './fachada';
import { montarAndar2 } from './andar2';
import { montarSala } from './sala/sala';
import { criarCamera, deslocamentoDaVista, type Foco as FocoCam } from './camera';
import { PLANO_CORTE, cortarArvore } from './corte';
import { criarSelecao } from './selecao';
import { consolidar, novaMemoria } from './vida/identidade';
import { amostraDeQuadro, avaliar, estadoInicial, mediaMovel, parametros } from './orcamento';
import { decidir, intervaloDeDesenho, passosDeSimulacao, RITMO } from './ritmo';
import { Economia, criarHudPerf } from './economia';
import type { OrcamentoTelas } from './telas/telas';

const L = 48, P = 32, ALT = 6, Y1 = ALT;
const hud = document.getElementById('estado')!;
// Há novidade para desenhar (dado novo, janela redimensionada...): o laço lê e zera (bloco "Ritmo de redesenho").
let sujo = true;
function pedirQuadro() { sujo = true; }

const renderer = new THREE.WebGLRenderer({ antialias: true });
// Pixel ratio: vem do orçamento (bloco "Orçamento de desempenho" abaixo; cheio = 1,5).
renderer.setSize(innerWidth, innerHeight);
renderer.localClippingEnabled = true; // plano de corte por material (corte.ts)
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // sombras recalculadas a cada 3 quadros no laço (pessoas andam devagar); era um passe extra de cena toda por quadro
let quadro = 0;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1200);
const controles = new OrbitControls(camera, renderer.domElement);
controles.enableDamping = true;
controles.maxPolarAngle = Math.PI * 0.49;
controles.zoomToCursor = true; // a roda aproxima do que está sob o mouse (uma mesa, uma pessoa), não do centro do andar
controles.minDistance = 2.5; // não atravessa o piso nem entra na pessoa
controles.maxDistance = 520; // não se perde além da cidade

// ---------- Luz e céu pela hora local (?hora=22 força a hora) ----------
const mundo = new Mundo(scene);
mundo.aplicar(horaAtual());
const cidade = new Cidade(scene);
cidade.definirNoite(mundo.noite);
for (const m of M.emissivos) m.emissiveIntensity = 0.35 + mundo.noite * 2.2;

// ---------- Terreno e praça (a cidade, as ruas e o trânsito vêm de cidade.ts) ----------
const chao = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0x59606a, roughness: 1 }));
chao.rotation.x = -Math.PI / 2;
chao.position.y = -0.02;
chao.receiveShadow = true;
scene.add(chao);
const praca = new THREE.Mesh(new THREE.BoxGeometry(L + 20, 0.12, 30), new THREE.MeshStandardMaterial({ color: 0xc9c6bf, roughness: 0.85 }));
praca.position.set(0, 0.04, P / 2 + 15);
praca.receiveShadow = true;
scene.add(praca);
// Canteiros e árvores na praça: duas fileiras de vasos grandes e árvores baixas nos cantos.
for (const x of [-20, -12, 12, 20]) scene.add(M.planta(x, 0.1, P / 2 + 6, 2.2));
for (const x of [-26, 26]) scene.add(M.planta(x, 0.1, P / 2 + 22, 3.4));

// Tudo que existe até aqui (céu, cidade, chão, praça) nunca é cortado; o prédio vem depois.
const SEM_CORTE = new Set<THREE.Object3D>(scene.children);

// ---------- Estrutura: lajes, vidro e colunas ----------
const concreto = new THREE.MeshStandardMaterial({ color: 0xd8d6d0, roughness: 0.7 });
const pisoMat = M.pisoPolido(L, P);
const aco = new THREE.MeshStandardMaterial({ color: 0x1b1f25, roughness: 0.4, metalness: 0.7 });
// Vidro com reflexo do céu (ambiente gerado do domo) — dá a aparência de fachada espelhada sem custo por quadro.
const vidro = new THREE.MeshStandardMaterial({
  color: 0xa8cfe0, transparent: true, opacity: 0.22, roughness: 0.06, metalness: 0.75, side: THREE.DoubleSide, depthWrite: false,
});
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const ceuCena = new THREE.Scene();
  ceuCena.add(mundo.cupula.clone());
  scene.environment = pmrem.fromScene(ceuCena, 0, 1, 2200).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();
}
const pedraMat = texturaPedra(L, P);
const forroMat = texturaRipado(L, P);
function laje(y: number, esp = 0.35, topo: THREE.Material = pisoMat, fundo: THREE.Material = concreto): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(L, esp, P), [concreto, concreto, topo, fundo, concreto, concreto]);
  m.position.set(0, y - esp / 2, 0);
  m.receiveShadow = m.castShadow = true;
  scene.add(m);
  return m;
}
laje(0.02, 0.2, pedraMat); // piso do térreo (pedra)
laje(Y1, 0.35, pisoMat, forroMat); // andar 1 (forro ripado visto do térreo)
laje(Y1 + ALT, 0.35, pisoMat, forroMat); // piso do andar 2 (e forro do andar 1)

// Montantes de aço das quatro fachadas: uma malha só por instâncias (eram 46 malhas = 46 chamadas de desenho).
const montantes: THREE.Matrix4[] = [];
function parede(w: number, x: number, z: number, rotY: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, ALT * 2), vidro);
  m.position.set(x, ALT, z);
  m.rotation.y = rotY;
  scene.add(m);
  // Montantes de aço a cada 4 m.
  for (let i = 0; i <= w / 4; i++) {
    const dx = -w / 2 + i * 4;
    montantes.push(new THREE.Matrix4().makeTranslation(x + Math.cos(rotY) * dx, ALT, z - Math.sin(rotY) * dx));
  }
}
parede(L, 0, P / 2, 0); // fachada
parede(L, 0, -P / 2, 0); // fundos
parede(P, -L / 2, 0, Math.PI / 2);
parede(P, L / 2, 0, Math.PI / 2);
{
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, ALT * 2, 0.12), aco, montantes.length);
  montantes.forEach((mm, i) => im.setMatrixAt(i, mm));
  scene.add(im);
}

// ---------- Fachada, telhado e andar 2 ----------
const { luzLogo } = montarFachada(scene, L, P, ALT);
const andar2 = montarAndar2(L, P, Y1 + ALT);
scene.add(andar2.grupo);

// Andar em foco: 'todos' mostra o prédio inteiro; 0, 1 e 2 cortam o que está acima (camera.ts). O zoom não corta nada.
type Foco = FocoCam;
let foco: Foco = 'todos';
function definirFoco(f: Foco) { foco = f; }

// Corte progressivo + botões de andar (camera.ts); o plano é o mesmo de todos os materiais do prédio.
const camApi = criarCamera({
  camera, controles, corte: PLANO_CORTE,
  defFoco: definirFoco, lerFoco: () => foco, mover, vistaGeral: () => VISTAS['1'],
  yAndar1: Y1, yAndar2: Y1 + ALT,
});

// ---------- Interior: lobby, núcleo, andar 1 ----------
const { relogios } = montarEstatico(scene, L, P, Y1);
for (const m of M.emissivos) m.emissiveIntensity = 0.35 + mundo.noite * 2.2;
luzLogo.intensity = mundo.noite * 140;
{
  const l = new THREE.PointLight(0xffd9a8, 60, 26, 1.6);
  l.position.set(-4, 4.5, 4);
  scene.add(l);
  for (const [x, z] of [[-12, 1], [14, -2]]) {
    const la = new THREE.PointLight(0xfff0dc, 75, 36, 1.5);
    la.position.set(x, Y1 + 4.6, z);
    scene.add(la);
  }
}

const raiz = new THREE.Group();
scene.add(raiz);

// Vida do prédio (predio.ts): identidade + decisões sociais + bonecos. Fileiras de mesa nascem por projeto.
const salas = new Map<string, string>(); // roomId → nome do projeto
// Salas abertas por um app de agentes (hoje só o OpenBot): cada agente tem a própria pasta, mas todos sentam
// juntos numa fileira com o nome do app, em vez de uma fileira de seis mesas para cada um.
const lancadores = new Map<string, string>(); // roomId → 'openbot'
const NOME_DO_APP: Record<string, string> = { openbot: 'OpenBot' };
const telas = new Telas(); // monitores vivos das mesas
// Sala de descanso (S8b/§4.3): props do andar 1 + telas vivas da TV e dos fliperamas
// (nascem `off`); o resultado vai ao Predio, que liga os modos/GOL da S9.
const sala = montarSala(scene, Y1, telas);
const predio = new Predio({
  cena: scene, raiz, Y1, ALT, telas, sala,
  assentosGuerra: andar2.assentosGuerra,
  nomeDaSala: (id) => (id.startsWith(FILEIRA_APP) ? NOME_DO_APP[id.slice(FILEIRA_APP.length)] : undefined) ?? getApelido(id) ?? salas.get(id) ?? id.split('/').pop() ?? id, // apelido local à frente
  fileiraDaSala: (id) => (lancadores.has(id) ? FILEIRA_APP + lancadores.get(id) : id),
  camera, // balão: some a mais de 40 m da câmera
});

// Snapshot real → agentes da vida. Sem sessão aberta: demo (pessoas fictícias, claramente marcadas no HUD).
function agentesDoSnapshot(s: any): AgenteEntrada[] {
  for (const r of s?.rooms ?? []) {
    salas.set(r.id, r.name);
    if (r.launcher === 'openbot') lancadores.set(r.id, r.launcher);
    else lancadores.delete(r.id);
  }
  // Cores de projeto: reserva as chaves de fileira das salas presentes (em ordem alfabética, no
  // registro de cor-projeto.ts) antes da lista e do prédio pintarem — sem repetição enquanto
  // houver cor livre, e o mesmo conjunto de projetos dá as mesmas cores a cada recarga.
  reservarCores((s?.rooms ?? []).map((r: any) => chaveDaFileira(r.id, lancadores.get(r.id))));
  // O mapeamento por agente vive em dados.ts (agenteDoSnapshot): só activity.kind/at e a contagem de shells.
  return (s?.agents ?? []).map((a: any) => agenteDoSnapshot(a));
}
function agentesDoDemo(): AgenteEntrada[] {
  const t0 = Date.now() - 6 * 60_000;
  return DEMO.flatMap((pj) => pj.pessoas.map((d): AgenteEntrada => {
    salas.set(pj.id, pj.nome);
    // Atividade fictícia declarada no DEMO (demo no HUD); shells ausente no demo → undefined.
    return { id: d.id, kind: 'sub', roomId: pj.id, name: d.nome, role: d.nome, sessionId: pj.id, account: 'demo', status: d.estado, startedAt: t0, lastEventAt: t0, statusSince: t0, atividade: d.atividade, shells: undefined };
  }));
}


// Painel de lista de agentes: recolhível à esquerda; escolher um agente leva a câmera ao andar 1
// (irPara é declarada mais abaixo, mas o callback só roda depois) e abre a gaveta de detalhes.
const painelDetalhe = montarDetalhe();
const painelLista = montarLista({
  aoSelecionar: (id) => { painelDetalhe.abre(id); irPara('6'); },
  // Apelido/ordem de sala mudaram (só localStorage): repinta a placa das fileiras 3D
  // com o nome efetivo (repintarNomes é barato — troca só a placa, não a fileira).
  aoMudarSala: () => { predio.repintarNomes(); pedirQuadro(); },
});
// Atividade: feed inferior de mudanças entre snapshots; ajuda "?".
const painelFeed = montarFeed({ apelidoDe: (id) => getApelido(id) });
const ajuda = montarAjuda();
const btnAjuda = document.createElement('button');
btnAjuda.className = 'painel-botoes-ajuda';
btnAjuda.textContent = '?';
btnAjuda.title = textoPainel.ajuda.dicaBotao;
btnAjuda.addEventListener('click', () => ajuda.abre());
document.body.append(btnAjuda);
// Replay: enquanto toca, os snapshots ao vivo ficam guardados e o prédio mostra o quadro do passado.
let emReplay = false;
let ultimoVivo: any = null;
function aplicarSnapshot(s: any, historico = false) {
  if (!pessoasProntas()) return; // replay aberto antes de a malha das pessoas chegar
  pedirQuadro(); // dado novo: a tela precisa de um quadro
  predio.definirAgentes(agentesDoSnapshot(s));
  espelhar(s);
  painelLista.atualizar(s, historico ? s.serverTime : undefined);
  painelDetalhe.atualizar(s);
  painel.atualizar(s);
  if (!historico) painelFeed.atualizar(s); // o feed compara snapshots seguidos: no replay inundaria de eventos falsos
}
const replay = montarReplay({
  aoQuadro: (q) => { emReplay = true; aplicarSnapshot(q, true); },
  aoSair: () => { emReplay = false; if (ultimoVivo) aplicarSnapshot(ultimoVivo); },
});
const painel = montarPainel({
  aoAlternarReplay: () => replay.alternar(),
  aoAlternarLista: () => painelLista.alternar(),
  aoAlternarAtividade: () => painelFeed.alternar(),
  aoAlternarAjuda: () => ajuda.abre(),
});

// As pessoas dependem da malha (pessoa.glb): os dados só começam a chegar depois que ela foi baixada.
carregarPessoas().then(() => conectar(
  () => {},
  (t) => (hud.textContent = t),
  (s) => {
    if (emReplay) return;
    pedirQuadro();
    predio.definirAgentes(s ? agentesDoSnapshot(s) : agentesDoDemo(), s !== null);
    espelhar(s); // null = modo demo: espelha os agentes fictícios (mesma regra de chave)
  },
  (s) => {
    ultimoVivo = s;
    if (emReplay) return;
    aplicarSnapshot(s);
  },
)).catch((e) => {
  console.error(e);
  hud.textContent = 'Não foi possível carregar as pessoas (assets/people/pessoa.glb).';
});

// ---------- Câmeras ----------
const VISTAS: Record<string, { pos: [number, number, number]; alvo: [number, number, number] }> = {
  '1': { pos: [38, 22, 78], alvo: [0, 6, 0] },
  '2': { pos: [8, 4, 52], alvo: [0, 8, 16] }, // entrada: letreiro inteiro abaixo da barra do topo
  '5': { pos: [3, 4.2, 15.5], alvo: [-3, 1.4, -4] }, // térreo: recepção, marca e elevadores, sem pilar na frente
  '3': { pos: [-5, Y1 + 14, 23], alvo: [-14, Y1, -2] }, // andar 1: fileiras em diagonal — de frente, a coluna do meio tapava duas placas
  '6': { pos: [14, Y1 + 10, 10], alvo: [12, Y1, -8] }, // andar 1, lado do descanso: sem pilar no meio da vista
  '7': { pos: [20, Y1 + ALT + 9, 30], alvo: [0, Y1 + ALT + 1, 0] }, // cobertura vista de fora, por cima do terraço
  '8': { pos: [14, Y1 + ALT + 12, 8], alvo: [-2, Y1 + ALT + 0.5, -6] }, // andar 2 por dentro: reunião e elevadores, sem o pergolado na frente
  '4': { pos: [160, 110, 190], alvo: [0, 10, 20] },
};
// Drone: tecla "d" liga/desliga uma órbita lenta em volta do prédio (a cidade só anima com a câmera longe).
// Tecla "d" liga o drone; ↑/↓ sobem e descem de andar (o botão ativo acompanha).
let drone = false;
addEventListener('keydown', (e) => {
  if (e.key === 'd') drone = !drone;
  if (e.key === 'ArrowUp') camApi.mudarAndar(1);
  if (e.key === 'ArrowDown') camApi.mudarAndar(-1);
});
let transicao: { de: THREE.Vector3; para: THREE.Vector3; deA: THREE.Vector3; paraA: THREE.Vector3; t: number } | null = null;
// Move câmera/alvo na transição suave, sem tocar no foco (a "vista de cima" preserva o andar escolhido).
function mover(pos: [number, number, number], alvo: [number, number, number]) {
  transicao = { de: camera.position.clone(), para: new THREE.Vector3(...pos), deA: controles.target.clone(), paraA: new THREE.Vector3(...alvo), t: 0 };
}
// As vistas de cima (planta) olham os andares de topo: '3' e '6' = andar 1 · '7' e '8' = cobertura (andar 2 de topo).
const FOCO_DA_VISTA: Record<string, Foco> = { '1': 'todos', '2': 'todos', '3': 1, '4': 'todos', '5': 'todos', '6': 1, '7': 2, '8': 2 };
function irPara(k: string) {
  const v = VISTAS[k];
  if (!v) return;
  const f = FOCO_DA_VISTA[k] ?? 'todos';
  camApi.definirFoco(f); // define o foco e atualiza o botão ativo
  mover(v.pos, v.alvo);
}
addEventListener('keydown', (e) => irPara(e.key));
camera.position.set(...VISTAS['1'].pos);
controles.target.set(...VISTAS['1'].alvo);

// ---------- Seleção no 3D (selecao.ts): clique/duplo clique no boneco ----------
// Espelho do consolidar interno do predio (mesma regra de chave, memória própria): resolve
// chave → agenteIds[0] (ordenado) e marca os bonecos; nada duplica a regra de vida/identidade.
const espelho = novaMemoria();
function espelhar(s: any) {
  const pessoas = consolidar(s ? agentesDoSnapshot(s) : agentesDoDemo(), Date.now(), espelho);
  for (const v of predio.pessoasVivas) {
    v.p.grupo.userData.chave = v.chave;
    v.p.grupo.userData.ids = pessoas.find((p) => p.chave === v.chave)?.agenteIds ?? [];
  }
}
const selecao = criarSelecao({
  cena: scene, camera, el: renderer.domElement, controles,
  pessoas: () => predio.pessoasVivas.map((v) => ({ chave: v.p.grupo.userData.chave ?? '', grupo: v.p.grupo })),
  mover,
  pararTransicao: () => { transicao = null; },
  resolverAgente: (c) => predio.pessoasVivas.find((v) => v.p.grupo.userData.chave === c)?.p.grupo.userData.ids[0] ?? '',
  aoSelecionarAgente: (id) => painelLista.definirSelecionado(id), // a gaveta de detalhe ligará aqui quando existir (c4)
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  aplicarVista(); // refaz o deslocamento com a largura nova (e atualiza a projeção)
  renderer.setSize(innerWidth, innerHeight);
  pedirQuadro();
});

// ---------- Vista centrada na área livre (camera.ts, deslocamentoDaVista) ----------
// Duas sondas invisíveis medem, pelo próprio CSS dos painéis, quanto a lista (esquerda) e o detalhe (direita)
// cobrem do canvas; quando uma muda de largura, a vista desliza até o novo centro. Nenhum painel precisa avisar.
const sondaEsq = document.createElement('div');
const sondaDir = document.createElement('div');
sondaEsq.style.cssText = 'position:fixed;top:0;left:0;height:0;visibility:hidden;pointer-events:none;width:var(--lista-w,0px)';
sondaDir.className = 'sonda-detalhe'; // largura no CSS (identidade.css): var(--det-w) só com o detalhe aberto
document.body.append(sondaEsq, sondaDir);
let vistaAlvo = 0; // deslocamento desejado (px)
let vistaAtual = 0; // deslocamento aplicado (px)
function aplicarVista() {
  if (Math.abs(vistaAtual) < 0.5) camera.clearViewOffset();
  else camera.setViewOffset(innerWidth, innerHeight, vistaAtual, 0, innerWidth, innerHeight);
  camera.updateProjectionMatrix();
}
function medirVista() {
  vistaAlvo = deslocamentoDaVista(innerWidth, sondaEsq.offsetWidth, sondaDir.offsetWidth);
  pedirQuadro();
}
const observadorVista = new ResizeObserver(medirVista);
observadorVista.observe(sondaEsq);
observadorVista.observe(sondaDir);
addEventListener('resize', medirVista);
medirVista();
vistaAtual = vistaAlvo; // ao abrir, já nasce no lugar (sem deslizar)
aplicarVista();

// ---------- Orçamento de desempenho (orcamento.ts decide, economia.ts aplica) ----------
// Mede a média de ms por quadro, escolhe o nível (cheio/econômico/mínimo, com histerese) e, com a
// câmera em zoom, põe o resto em segundo plano. Em 'cheio' sem zoom tudo roda como antes.
let orc = estadoInicial(performance.now(), navigator.hardwareConcurrency);
let par = parametros(orc.nivel, orc.zoom, telas.reduzido);
renderer.setPixelRatio(Math.min(devicePixelRatio, par.pixelRatioMax)); // cheio = 1,5: 2× custava ~78% mais pixels por quadro sem ganho visível
let msMedio = 1000 / 60;
const economia = new Economia(par, controles.target);
predio.economia = economia;
// Um objeto só para as telas (sem alocar por quadro); os campos mudam junto com o nível.
const orcTelas: OrcamentoTelas = { teto: par.telasTeto, mult: par.telasMult, foco: controles.target, raio: par.raioFoco, multFora: par.telasMultFora };
// ?perf=1 liga o mini-HUD de medição; sem o parâmetro não existe (custo zero).
const hudPerf = new URLSearchParams(location.search).get('perf') === '1' ? criarHudPerf(renderer) : null;

// ---------- Ritmo de redesenho (ritmo.ts decide; aqui só se mede) ----------
// A tela só é redesenhada quando algo muda: câmera, gesto, dado novo ou vida à vista. Parado, o laço
// não desenha; a simulação segue 4×/s para notar quem entra em cena. `pedirQuadro` (topo do arquivo)
// marca que há novidade para o próximo quadro.
let ativoAte = performance.now() + RITMO.aquecimentoMs; // logo após abrir, modelos e texturas ainda chegam
const gesto = () => { ativoAte = Math.max(ativoAte, performance.now() + RITMO.ativoMs); };
controles.addEventListener('change', gesto); // arraste, roda e amortecimento da câmera
for (const ev of ['pointerdown', 'wheel', 'keydown'] as const) addEventListener(ev, gesto, { passive: true });
THREE.DefaultLoadingManager.onLoad = pedirQuadro; // modelo ou textura que chegou depois
let ultimoDesenho = -Infinity;
let ultimaSimulacao = -Infinity;
let vida = true; // pessoas ou telas vivas à vista, ou carros andando (medido no passo anterior)
let livreAntes = false; // o quadro anterior foi desenhado em ritmo livre (amostra do orçamento)

let ultimoCorte = -1;
let segundo = -1; // relógio de parede: ponteiros mudam 1×/s
const relogio = new THREE.Clock();
let minutoRelogio = -1; // último minuto em que o relógio de parede foi desenhado
function laco() {
  const agoraMs = performance.now();
  const mexendo = sujo || agoraMs < ativoAte || transicao !== null || drone || camApi.abrindo() || vistaAtual !== vistaAlvo; // vista deslizando conta como movimento
  const entrada = { agora: agoraMs, ultimoDesenho, ultimaSimulacao, foco: document.hasFocus(), mexendo, vida };
  const passo = decidir(entrada);
  if (passo === 'nada') return;

  const bruto = relogio.getDelta(); // tempo desde a última simulação (desenhada ou não)
  const t = relogio.elapsedTime;
  ultimaSimulacao = agoraMs;
  economia.iniciarQuadro(camera);
  // Pessoas: o tempo decorrido em passos de no máximo 0,1 s (a 60 quadros/s é um passo só, como antes).
  const passos = passosDeSimulacao(bruto);
  let dt = 0;
  for (const d of passos) { dt += d; predio.atualizar(d, t - (bruto - dt), Date.now()); }
  // Cidade parada com a câmera perto do prédio ou em zoom; os carros só andam com a câmera longe (modo cidade/drone).
  const longe = camera.position.distanceTo(controles.target) > 70 || camera.position.length() > 110;
  const cidadeAnda = longe && par.cidadeAnima && !orc.zoom;
  if (cidadeAnda) cidade.atualizar(dt);
  if (drone && !transicao) {
    const a = dt * 0.12, c = Math.cos(a), sn = Math.sin(a);
    const x = camera.position.x, z = camera.position.z;
    camera.position.x = x * c - z * sn;
    camera.position.z = x * sn + z * c;
    controles.target.set(0, 10, 10);
  }
  if (transicao) {
    transicao.t = Math.min(1, transicao.t + dt / 1.8);
    const k = transicao.t * transicao.t * (3 - 2 * transicao.t);
    camera.position.lerpVectors(transicao.de, transicao.para, k);
    controles.target.lerpVectors(transicao.deA, transicao.paraA, k);
    if (transicao.t >= 1) transicao = null;
  }
  // Painel abriu ou fechou: a vista desliza até o centro da área livre (uns 0,3 s) e para.
  if (vistaAtual !== vistaAlvo) {
    const falta = vistaAlvo - vistaAtual;
    vistaAtual = Math.abs(falta) < 0.5 ? vistaAlvo : vistaAtual + falta * Math.min(1, dt * 12);
    aplicarVista();
    pedirQuadro();
  }
  selecao.atualizar(dt); // anel acompanha o boneco e o duplo clique segue (selecao.ts)
  controles.update(); // câmera mudou → evento 'change' → `gesto` mantém o ritmo cheio
  vida = economia.aVista > 0 || telas.vivasAVista > 0 || cidadeAnda;
  // Relógio de parede: com tudo parado, um quadro por minuto mantém os ponteiros na hora certa.
  const minuto = Math.floor(Date.now() / 60_000);
  if (minuto !== minutoRelogio) { minutoRelogio = minuto; pedirQuadro(); }
  if (passo === 'simular') return; // nada à vista mudou: a simulação andou, a tela fica como está

  // ---------- Quadro desenhado ----------
  // Orçamento: só quadros que dizem algo sobre a máquina entram na média (orcamento.ts, amostraDeQuadro).
  const livre = intervaloDeDesenho(entrada) === 0;
  const amostra = amostraDeQuadro({ intervaloMs: agoraMs - ultimoDesenho, desenhoMs: custoDesenho, livre: livre && livreAntes });
  if (amostra !== undefined) msMedio = mediaMovel(msMedio, amostra);
  livreAntes = livre;
  const novo = avaliar(orc, { agora: agoraMs, distAlvo: camera.position.distanceTo(controles.target), visivel: true, msQuadro: msMedio });
  if (novo !== orc) {
    par = economia.p = parametros(novo.nivel, novo.zoom, telas.reduzido);
    if (novo.nivel !== orc.nivel) renderer.setPixelRatio(Math.min(devicePixelRatio, par.pixelRatioMax)); // só na troca de nível
    Object.assign(orcTelas, { teto: par.telasTeto, mult: par.telasMult, raio: par.raioFoco, multFora: par.telasMultFora });
    orc = novo;
  }
  telas.atualizar(Date.now(), camera, orcTelas); // redesenha só o que a câmera vê (e mais devagar fora do foco)
  predio.placasNoZoom(camera.position); // placa colada na câmera some (não tapa a fileira no zoom)
  if (t - ultimoCorte > par.corteMs / 1000) { ultimoCorte = t; cortarArvore(scene, SEM_CORTE); } // pega fileiras e bonecos novos
  if (Math.floor(t) !== segundo) { segundo = Math.floor(t); for (const r of relogios) atualizarRelogio(r); }
  // Abertura progressiva: o plano de corte desce até o andar escolhido (camera.ts).
  camApi.aplicarAbertura(dt);
  if (quadro++ % par.sombraCada === 0) renderer.shadowMap.needsUpdate = true; // cheio = a cada 3 quadros, como antes
  renderer.render(scene, camera);
  sujo = false;
  ultimoDesenho = agoraMs;
  custoDesenho = performance.now() - agoraMs; // simulação + desenho deste quadro (CPU)
  hudPerf?.(msMedio, orc); // depois do render: renderer.info tem o quadro inteiro
}
let custoDesenho = 0;
renderer.setAnimationLoop(laco);

// Aba oculta: para o laço (render, pessoas, telas, corte). O stream de dados segue chegando e o
// Predio guarda o último snapshot, então nada se perde. Ao voltar, descarta o intervalo parado
// (senão o 1º dt e a média de ms sairiam enormes) e retoma.
document.addEventListener('visibilitychange', () => {
  const visivel = !document.hidden;
  if (visivel) { relogio.getDelta(); msMedio = 1000 / 60; livreAntes = false; pedirQuadro(); } // descarta o tempo parado antes de avaliar
  orc = avaliar(orc, { agora: performance.now(), distAlvo: camera.position.distanceTo(controles.target), visivel, msQuadro: msMedio });
  renderer.setAnimationLoop(visivel ? laco : null);
});
// Janela voltou a ser a ativa: um quadro já, sem esperar o próximo prazo de 10 quadros/s.
addEventListener('focus', pedirQuadro);

// Depuração local: expõe a cena no console do navegador (window.__cena).
(window as any).__cena = scene;
(window as any).__predio = predio;
(window as any).__render = renderer;
(window as any).__camera = camera;
(window as any).__controles = controles;
(window as any).__ritmo = () => ({ ultimoDesenho, ultimaSimulacao, vida, sujo, ativoAte, agora: performance.now() });
