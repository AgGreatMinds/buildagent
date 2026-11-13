// Abertura progressiva do prédio pela distância da câmera ("zoom progressivo") + botões de andar na tela.
// A lógica pura (nível por distância com histerese) sai exportada e testável sem WebGL (camera.test.ts);
// o resto amarra cena, câmera e DOM. O estado `foco` mora no main.ts (fonte única); aqui a gente lê e aplica.
import * as THREE from 'three';

// ---------- Ajustes (nomes pra mudar em um lugar só) ----------
const FACTOR_LERP = 0.1;       // suavização por quadro (a 60 fps): o plano desce sem corte seco
const ALTO_TOPVIEW = 110;      // altura da "vista de cima"
const FOLGA_LAJE = 0.45;       // o corte fica logo abaixo da laje do andar, que também some
const ACIMA_DO_PREDIO = 4;     // o corte "aberto" (sem efeito) fica 4 m acima do telhado
const ALCANCE = 30;            // distância da câmera ao centro do andar escolhido

// Andar em foco: 'todos' mostra o prédio inteiro; 0 (térreo), 1 e 2 cortam tudo que está acima dele.
export type Foco = 'todos' | 0 | 1 | 2;
export const ORDEM: Foco[] = ['todos', 0, 1, 2];

// Painéis laterais cobrem parte do canvas (a lista à esquerda, o detalhe à direita). Sem compensar, o alvo
// da câmera fica no meio da JANELA e o que interessa some atrás da lista. Devolve quantos pixels deslocar a
// vista (para `camera.setViewOffset`) para o alvo cair no meio da área LIVRE. Negativo = cena vai para a direita.
// Com área livre estreita demais (celular, painéis em gaveta) não desloca: lá os painéis cobrem a tela inteira.
export function deslocamentoDaVista(larguraTela: number, esquerda: number, direita: number, livreMin = 420): number {
  const livre = larguraTela - esquerda - direita;
  if (!(larguraTela > 0) || livre < livreMin) return 0;
  return (direita - esquerda) / 2;
}

/**
 * Altura do plano de corte (tudo acima dela some). Função pura, testável sem WebGL.
 * Só o andar escolhido nos botões/teclas decide; o zoom não corta nada.
 */
export function alturaDeCorte(foco: Foco, alt: number): number {
  if (foco === 'todos') return alt * 3 + ACIMA_DO_PREDIO;
  return (foco + 1) * alt - FOLGA_LAJE;
}

interface Opcoes {
  camera: THREE.PerspectiveCamera;
  controles: { target: THREE.Vector3; update(): void };
  corte: THREE.Plane; // plano compartilhado por todos os materiais do prédio (corte.ts)
  defFoco: (f: Foco) => void; // main define o foco (fonte única de estado)
  lerFoco: () => Foco;
  mover: (pos: [number, number, number], alvo: [number, number, number]) => void;
  vistaGeral: () => { pos: [number, number, number]; alvo: [number, number, number] }; // para onde o botão "Tudo" volta
  yAndar1: number;
  yAndar2: number;
}

export interface CameraApi {
  /** Chamar por quadro: leva o plano de corte à altura do andar escolhido, com suavização. */
  aplicarAbertura(dt: number): void;
  /** O plano de corte ainda não chegou ao andar escolhido (a tela precisa continuar sendo redesenhada). */
  abrindo(): boolean;
  /** Define o andar em foco (botões, teclas): atualiza o botão ativo, o corte e, se ligada, a vista de cima. */
  definirFoco(f: Foco): void;
  /** Sobe ou desce um andar (setas ↑/↓); de "Tudo", ↓ entra no andar mais alto e ↑ não faz nada. */
  mudarAndar(delta: 1 | -1): void;
}

export function criarCamera(o: Opcoes): CameraApi {
  const alt = o.yAndar2 - o.yAndar1;
  let cima = false;
  let corteAtual = o.corte.constant; // altura suavizada do plano
  const posAnterior = new THREE.Vector3();
  const alvoAnterior = new THREE.Vector3();

  // ---------- Botões na tela (index.html #andares) ----------
  const botoes = Array.from(document.querySelectorAll<HTMLButtonElement>('#andares [data-foco]'));
  const botaoCima = document.getElementById('vista-cima') as HTMLButtonElement | null;

  function lerFoco(s: string | undefined): Foco {
    return s === '0' ? 0 : s === '1' ? 1 : s === '2' ? 2 : 'todos';
  }

  function sincronizarBotao(f: Foco) {
    for (const b of botoes) b.classList.toggle('ativo', b.dataset.foco === String(f));
  }

  const yPiso = (f: Foco) => (f === 'todos' ? 2 : f) * alt; // 'todos' olha o andar de topo na vista de cima

  // "Vista de cima": câmera acima do andar escolhido, de planta (olhando pra baixo). Ao desligar, volta à posição anterior.
  function entrarCima() {
    const y = yPiso(o.lerFoco());
    o.mover([0.5, y + ALTO_TOPVIEW, 0.5], [0, y, 0]);
  }

  // Leva a câmera ao andar, mantendo a direção em que o usuário olha, de cima e inclinada.
  function irAoAndar(f: Foco) {
    if (f === 'todos') return o.mover(o.vistaGeral().pos, o.vistaGeral().alvo);
    const y = yPiso(f) + 1.5, t = o.controles.target, c = o.camera.position;
    const hx = c.x - t.x, hz = c.z - t.z, h = Math.hypot(hx, hz) || 1;
    o.mover([t.x + (hx / h) * ALCANCE * 0.8, y + ALCANCE * 0.6, t.z + (hz / h) * ALCANCE * 0.8], [t.x, y, t.z]);
  }

  function definirFoco(f: Foco) {
    o.defFoco(f); // fonte única no main
    sincronizarBotao(f);
    if (cima) entrarCima(); // trocou o andar com a vista de cima ligada: acompanha o novo andar
  }

  // Botões de andar: fixam o corte e levam a câmera ao andar.
  for (const b of botoes) b.addEventListener('click', () => {
    const f = lerFoco(b.dataset.foco);
    definirFoco(f);
    if (!cima) irAoAndar(f);
  });

  function mudarAndar(delta: 1 | -1) {
    const f = o.lerFoco();
    const atual = f === 'todos' ? 3 : f; // "Tudo" fica acima do andar 2
    const novo = Math.min(3, Math.max(0, atual + delta));
    if (novo === atual) return;
    const alvo: Foco = novo === 3 ? 'todos' : (novo as 0 | 1 | 2);
    definirFoco(alvo);
    if (!cima) irAoAndar(alvo);
  }

  botaoCima?.addEventListener('click', () => {
    cima = !cima;
    botaoCima.classList.toggle('ativo', cima);
    if (cima) {
      posAnterior.copy(o.camera.position);
      alvoAnterior.copy(o.controles.target);
      entrarCima();
    } else {
      o.mover([posAnterior.x, posAnterior.y, posAnterior.z], [alvoAnterior.x, alvoAnterior.y, alvoAnterior.z]);
    }
  });

  // ---------- O plano desce por quadro até o andar escolhido; nenhum objeto é escondido ou escalado ----------
  function aplicarAbertura(dt: number) {
    const alvo = alturaDeCorte(o.lerFoco(), alt);
    // Suavização independente de framerate: a 60 fps o coeficiente por quadro é FACTOR_LERP.
    corteAtual += (alvo - corteAtual) * (1 - Math.pow(1 - FACTOR_LERP, dt * 60));
    o.corte.constant = corteAtual;
  }

  const abrindo = () => Math.abs(alturaDeCorte(o.lerFoco(), alt) - corteAtual) > 0.01;

  sincronizarBotao(o.lerFoco()); // estado inicial dos botões, sem efeito colateral
  return { aplicarAbertura, abrindo, definirFoco, mudarAndar };
}
