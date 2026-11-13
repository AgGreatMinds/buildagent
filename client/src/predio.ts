// Orquestra a vida do prédio: junta identidade (vida/identidade), decisões sociais (vida/social) e os bonecos 3D.
// A cada segundo: agentes do snapshot → pessoas (consolidar) → intenções (Vida.passo) → rotas físicas
// (rua → porta → recepção → elevador → mesa/copa/lounge/andar 2) executadas por Pessoa.irPara.
// Nada aqui consome token nem usa aleatório: as decisões vêm de hash determinístico (vida/social).
import * as THREE from 'three';
import { Balao, textoBalao } from './balao';
import { Pessoa, semente, type Estado } from './people';
import { consolidar, novaMemoria, type Memoria } from './vida/identidade';
import { Vida } from './vida/social';
import { ENTRADA_MAX, type AgenteEntrada, type Intencao, type PessoaId } from './vida/tipos';
import { esperaNaFila, partidaNaFila, passosDoElevador, pousoDireto } from './entrada';
import { montarFileira, type Assento } from './interior';
import { corDaChave } from './cor-projeto';
import { Telas, type TelaViva } from './telas/telas';
import { modoDaTela, modoEstavel, representanteDe, type ModoTela } from './telas/modo';
import { opacidadeDaPlaca, placaNome } from './placa';
import { desvioLateral, direitaDe, type Andante } from './desvio';
import { liberarArvore } from './liberar';
import type { GanchoEconomia } from './economia';
import { LUGARES, VIA, type Lugar } from './sala/layout';
import { ASSENTOS_FILEIRA, COPA_ENTRADA_Z, CORREDOR_X, FILEIRAS_POS, TRAVESSIA_Z, corredorDoAssento } from './mesas';
import { ESTANTE_LADO_PINGPONG, SALA_SOCIAL, chaveDaIntencao, golNoQuadro, ladoPingpong, posicaoRaquete, viaNaRota } from './sala/regras';
import type { SalaMontada } from './sala/sala';
import type { NomePostura } from './vida/posturas';

// Distância máxima câmera→pessoa para o balão aparecer (some por distância: sem custo longe).
const BALAO_MAX_DIST = 40;
// Altura do balão acima da base da pessoa (a etiqueta da cabeça já vai a 2,1).
const BALAO_Y = 2.45;

// ---------- Geometria do prédio (m) ----------
const ELEV = { x: 0, z: -8.4 }; // porta dos elevadores (face sul do núcleo, z -10); fila espera em z -8,4
const SAIDA_ELEV = { x: 0, z: -9.3 };
const PORTA = { x: 0, z: 16 }; // porta da fachada
const RUA = { x: 0, z: 21 }; // onde a pessoa "chega" na calçada
const RECEPCAO = { x: 0, z: 5 }; // no eixo livre de entrada (x -2…2)
const PONTO_PLACA = new THREE.Vector3(); // vetor de trabalho de placasNoZoom (sem alocar por quadro)
const VEL_ENTRADA = 2.2; // m/s da calçada ao elevador: passo apressado, sem correr
// Quem recebe rota nova no mesmo instante (grupo indo à sala de guerra, subagentes voltando à mesa) sai um
// de cada vez, com este intervalo: andam em fila indiana (~1,2 m entre um e outro), nunca um dentro do outro.
const ESPACO_FILA_MS = 900;
const FATIA_MAX = 0.1; // s: maior passo de caminhada de uma vez (igual ao teto do laço, ritmo.ts)

// Destinos fixos por andar: [x, z]. Os do andar 1 ficam em y = Y1; os do andar 2 em y = Y1 + ALT.
const COPA: Array<[number, number]> = [[13.5, 13.6], [16, 13.6], [18.5, 13.6], [21, 13.6]];
const BANHEIRO: Array<[number, number]> = [[9, -14.8], [9, -13], [9, -11.2]]; // portas na face leste do núcleo
// S9: a lista antiga do lounge fica só como recuo (mesa sem vaga, conversa sem parceiro);
// o destino `lounge` em si agora usa os 9 lugares sentados de `LUGARES` (sala/layout).
const LOUNGE: Array<[number, number]> = [[12, -7.4], [14, -7.4], [16, -7.4], [18, -7.4], [12, -12.8], [14.5, -13], [17, -13], [19.4, -12.4]];
const CONVERSA: Array<[number, number]> = [[4.5, -3], [9, -3], [5, 5], [10, 5]]; // centro de cada par
const TERRACO: Array<[number, number]> = [[-14, 12.5], [-10, 12.5], [-6, 12.5], [-2, 12.5], [2, 12.5], [6, 12.5], [10, 12.5], [14, 12.5]];
const GALERIA: Array<[number, number]> = [[-18, -9.6], [-16, -9.6], [-14, -9.6], [-12, -9.6]];
const DESCANSO2: Array<[number, number]> = [[15, -10.6], [17, -10.6], [19, -10.6]]; // lounge executivo

// Lugares agrupados por destino (cache de módulo: LUGARES é estático — 1 vez, sem filtro
// por quadro em destinoFisico/rota).
const LUGARES_POR_DESTINO = new Map<Lugar['destino'], Lugar[]>();
for (const l of LUGARES) {
  const lista = LUGARES_POR_DESTINO.get(l.destino);
  if (lista) lista.push(l);
  else LUGARES_POR_DESTINO.set(l.destino, [l]);
}
const LUGARES_LOUNGE = LUGARES_POR_DESTINO.get('lounge')!;

// Passo de um percurso: ir a (x, y, z); ou trocar de andar dentro do elevador (troca); ou sumir (ocultar/remover) ao fim.
interface Passo {
  x: number; y: number; z: number;
  opcoes?: { sentar?: boolean; olhar?: number; vel?: number };
  troca?: number; // novo andar (0 térreo, 1, 2): teletransporta dentro do elevador
  ocultar?: boolean;
  remover?: boolean;
  destino?: string; // S9: destino social do ponto final (sala) — a rota passa por `VIA`
  mesaVia?: { x: number; zc: number }; // ponto final é uma mesa: x da cadeira e z do corredor que a serve (mesas.ts)
  entrada?: boolean; // passo do roteiro de chegada (rua → elevador → andar 1): intenção nova não o descarta
}

interface Viajante {
  p: Pessoa;
  balao: Balao; // sprite adicionado ao grupo da pessoa (y = BALAO_Y); mapa chave → Balao
  andar: number; // 0 térreo, 1, 2
  fila: Passo[];
  chaveIntencao: string;
  ocultaAoChegar: boolean;
  removendo: boolean;
  roomId: string;
  assento: number; // índice na fileira do projeto (-1 = sem lugar)
  mesaVia: { x: number; zc: number } | null; // corredor da mesa onde está sentado (a saída da mesa passa por ele)
  lado: 0 | 1; // lado no ping-pong (0 oeste, 1 leste) — só importa na postura `pingpong`
  // Intenção em vigor já decomposta (gravada em `aplicar`): a vida da sala lê estes campos
  // por quadro sem `split` da chave. '' = ainda sem intenção (entrada).
  destino: string;
  slot: number;
  estado: PessoaId['estado']; // último estado do snapshot (texto do balão na virada do GOL)
  partida: number; // fila da calçada: hora (epoch ms) em que começa a andar; 0 = já partiu ou nasceu dentro
  sairEm: number; // fila indiana: hora (epoch ms) em que começa a rota nova; 0 = já pode andar
  faixa: number; // deslocamento lateral (m) no eixo porta–recepção: quem cruza o térreo junto não se sobrepõe
}

export interface PredioOpcoes {
  cena: THREE.Scene;
  raiz: THREE.Group; // onde entram as fileiras
  Y1: number;
  ALT: number;
  assentosGuerra: THREE.Vector3[];
  nomeDaSala: (roomId: string) => string;
  /**
   * Em que fileira a sala senta (padrão: uma fileira por sala). Salas de um mesmo app de agentes (OpenBot)
   * devolvem a mesma chave e dividem a fileira; `nomeDaSala` recebe essa chave para o texto da placa.
   */
  fileiraDaSala?: (roomId: string) => string;
  camera: THREE.Camera; // mede a distância câmera→pessoa para ligar/desligar o balão (40 m)
  telas?: Telas; // monitores vivos das mesas (ausente nos testes: as fileiras nascem sem tela)
  sala?: SalaMontada; // sala de descanso montada em main.ts (S9): bolinha, raquetes e telas da TV/fliperamas
}

export class Predio {
  private mem: Memoria = novaMemoria();
  private vida: Vida;
  private viajantes = new Map<string, Viajante>();
  private fileiras = new Map<string, { idx: number; grupo: THREE.Group; assentos: Assento[]; usados: Array<string | null>; placa?: THREE.Object3D; telas: TelaViva[]; modos: Array<{ modo: ModoTela; desde: number }> }>();
  private agentes: AgenteEntrada[] = [];
  private ultimoPasso = -Infinity;
  private modoConteudo = false; // troca título/atividade por rótulo genérico (definido externamente, nada liga na v1)
  private gol = false; // GOL da TV no quadro atual (mesma conta de lanceFutebol, sem alocar objeto)
  private recebeu = false; // já chegou algum snapshot (definirAgentes)
  private abriu = false; // o primeiro snapshot já foi aplicado: daí em diante, quem aparece entra pela rua
  private proximaPartida = -Infinity; // fila da calçada: próxima vaga livre para sair andando (entrada.ts)
  economia: GanchoEconomia | null = null; // orçamento de desempenho (economia.ts); null = tudo a cada quadro, como antes

  constructor(private o: PredioOpcoes, semenaPredio = 20261029) {
    this.vida = new Vida(semenaPredio);
  }

  /** Último snapshot de agentes (vem do stream ou do demo). */
  definirAgentes(a: AgenteEntrada[], real = true) {
    this.agentes = a;
    // Só dado real conta como "primeiro snapshot": se a demonstração local veio antes (servidor ainda
    // subindo), os agentes reais que chegam depois nascem no lugar em vez de entrar todos pela rua.
    if (real) this.recebeu = true;
    this.ultimoPasso = -Infinity; // reavalia já no próximo quadro
  }

  /** Ligado o "modo conteúdo", o título do balão vira o rótulo genérico (privacidade por padrão = desligado). */
  definiModoConteudo(b: boolean) {
    this.modoConteudo = b;
  }

  private y(andar: number): number {
    return andar === 0 ? 0 : andar === 1 ? this.o.Y1 : this.o.Y1 + this.o.ALT;
  }

  /** Chave da fileira de uma sala (a própria sala, ou a fileira compartilhada do app que abriu o agente). */
  private chaveFileira(roomId: string): string {
    return this.o.fileiraDaSala?.(roomId) ?? roomId;
  }

  // Fileira do projeto: cria na primeira vez (até FILEIRAS_POS.length); devolve null se não há vaga.
  // `roomId` aqui já é a chave da fileira (chaveFileira).
  private fileiraDe(roomId: string) {
    let f = this.fileiras.get(roomId);
    if (f) return f;
    const idx = [...Array(FILEIRAS_POS.length).keys()].find((i) => ![...this.fileiras.values()].some((x) => x.idx === i));
    if (idx === undefined) return null;
    const m = montarFileira(FILEIRAS_POS[idx], this.o.nomeDaSala(roomId), corDaChave(roomId), this.o.Y1); // cor do registro: não repete entre projetos
    this.o.raiz.add(m.grupo);
    // Um monitor vivo por mesa, na ordem dos assentos; nascem desligados (assento vazio = off).
    const telas = this.o.telas
      ? m.monitores.map((mon, i) => this.o.telas!.criar({ pai: m.grupo, pos: mon.pos, rotY: mon.rotY, larg: 0.56, alt: 0.33, px: 48, py: 28, semente: (semente(roomId) + i * 7919) >>> 0 }))
      : [];
    f = { idx, grupo: m.grupo, assentos: m.assentos, usados: Array(ASSENTOS_FILEIRA).fill(null), placa: m.placa, telas, modos: m.monitores.map(() => ({ modo: 'off' as ModoTela, desde: 0 })) };
    this.fileiras.set(roomId, f);
    return f;
  }

  /**
   * Repinta a placa de nome das fileiras existentes (o nome da sala muda pelo apelido
   * local do painel — sem reconstruir a fileira inteira, só a placa suspensa, que é a
   * parte cara de trocar). A largura é a mesma da placa original (4,2 m, ver interior.ts).
   */
  repintarNomes(): void {
    for (const [roomId, f] of this.fileiras) {
      const velha = f.placa;
      if (!velha) continue;
      const nova = placaNome(this.o.nomeDaSala(roomId), 4.2);
      nova.position.copy(velha.position);
      f.grupo.remove(velha);
      f.grupo.add(nova);
      f.placa = nova;
      // Descarte da placa velha: geometria, textura e materiais são exclusivos dela (placaNome, placa.ts).
      const mesh = velha as THREE.Mesh;
      mesh.geometry.dispose();
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        (m as THREE.MeshStandardMaterial).map?.dispose();
        m.dispose();
      }
    }
  }

  /**
   * Zoom: placa perto da câmera fica transparente e some (placa.ts, opacidadeDaPlaca) — colada na lente
   * ela tapava a fileira inteira. Chamada a cada quadro desenhado; são no máximo 8 placas.
   */
  placasNoZoom(camera: THREE.Vector3): void {
    for (const f of this.fileiras.values()) {
      const placa = f.placa as THREE.Mesh | undefined;
      if (!placa) continue;
      const o = opacidadeDaPlaca(placa.getWorldPosition(PONTO_PLACA).distanceTo(camera));
      placa.visible = o > 0.02;
      for (const m of Array.isArray(placa.material) ? placa.material : [placa.material]) {
        if (m.opacity === o) continue;
        if (m.transparent !== o < 1) { m.transparent = o < 1; m.needsUpdate = true; }
        m.opacity = o;
      }
    }
  }

  private liberarFileiras(vivas: Set<string>) {
    for (const [roomId, f] of this.fileiras) {
      if (vivas.has(roomId) || f.usados.some(Boolean)) continue; // fileira com alguém sentado (de outro projeto) fica
      this.o.raiz.remove(f.grupo);
      for (const t of f.telas) t.dispose(); // textura e material da tela
      liberarArvore(f.grupo); // geometria mesclada e placa (os MAT compartilhados ficam)
      this.fileiras.delete(roomId);
    }
  }

  // Destino físico de uma intenção: posição, andar e como ficar ao chegar.
  private destinoFisico(v: Viajante, pid: PessoaId, it: Intencao): Passo & { andar: number } {
    const { Y1, ALT } = this.o;
    const em1 = (xz: [number, number], extra: Partial<Passo> = {}) => ({ x: xz[0], y: Y1, z: xz[1], andar: 1, ...extra });
    const em2 = (xz: [number, number], extra: Partial<Passo> = {}) => ({ x: xz[0], y: Y1 + ALT, z: xz[1], andar: 2, ...extra });
    const pegar = <T,>(lista: T[], slot: number) => lista[((slot % lista.length) + lista.length) % lista.length];

    switch (it.destino) {
      case 'mesa': {
        // Lugar fixo enquanto a pessoa existe: a fileira do projeto primeiro; com mais projetos
        // abertos que fileiras (FILEIRAS_POS), ou fileira cheia, ocupa um assento livre de OUTRA
        // fileira — todo agente de sessão aberta tem mesa, em vez de ficar de pé no lounge.
        const propria = this.fileiraDe(this.chaveFileira(pid.roomId));
        const fileiras = propria ? [propria, ...[...this.fileiras.values()].filter((x) => x !== propria)] : [...this.fileiras.values()];
        for (const f of fileiras) {
          let i = f.usados.indexOf(pid.chave);
          if (i < 0) { i = f.usados.indexOf(null); if (i >= 0) f.usados[i] = pid.chave; }
          if (i >= 0) {
            v.assento = i;
            const a = f.assentos[i];
            const mesaVia = { x: a.pos.x, zc: corredorDoAssento(FILEIRAS_POS[f.idx].linha, i) };
            v.mesaVia = mesaVia;
            return { x: a.pos.x, y: a.pos.y, z: a.pos.z, andar: 1, opcoes: { sentar: true, olhar: a.olhar }, mesaVia };
          }
        }
        v.mesaVia = null;
        // Nenhum assento livre em nenhuma fileira: fica em pé no lounge (nunca some nem sobrepõe).
        return em1(pegar(LOUNGE, pid.semente % 997));
      }
      case 'copa': return em1(pegar(COPA, it.slot), { opcoes: { olhar: 0 }, destino: 'copa' });
      case 'banheiro': return em1(pegar(BANHEIRO, it.slot), { ocultar: true });
      // S9: lounge agora são os 9 lugares sentados de LUGARES (linha 268 da spec).
      // A agenda pode exceder (excedente em pé, slot ≥ 9): nesse caso cai na lista antiga de pé.
      case 'lounge': {
        if (it.slot >= LUGARES_LOUNGE.length) return em1(pegar(LOUNGE, it.slot), { opcoes: { olhar: 0 } });
        const l = LUGARES_LOUNGE[it.slot];
        return { x: l.x, z: l.z, y: Y1, andar: 1, destino: 'lounge', opcoes: l.sentado ? { sentar: true, olhar: l.olhar } : { olhar: l.olhar } };
      }
      // S9: destinos da sala de descanso (4.3): o lugar vem de LUGARES; `it.slot` escolhe
      // (slot = lugar de alocar). `destino` marca o passo para a rota passar por `VIA`
      // (corredor, sem atravessar os móveis). No ping-pong, o lugar é o LADO (0 oeste,
      // 1 leste) — como a agenda aloca os dois parceiros no MESMO slot, cada um fica num
      // lado oposto da mesa.
      case 'tv':
      case 'estante': {
        const lista = LUGARES_POR_DESTINO.get(it.destino)!;
        const l = pegar(lista, it.slot);
        return { x: l.x, z: l.z, y: Y1, andar: 1, destino: it.destino, opcoes: l.sentado ? { sentar: true, olhar: l.olhar } : { olhar: l.olhar } };
      }
      case 'fliperama': {
        const lista = LUGARES_POR_DESTINO.get('fliperama')!;
        const l = pegar(lista, it.slot);
        return { x: l.x, z: l.z, y: Y1, andar: 1, destino: 'fliperama', opcoes: { olhar: l.olhar } };
      }
      case 'pingpong': {
        // Os 2 parceiros da agenda compartilham o MESMO slot (lugar da dupla); o
        // lado da mesa (0 oeste, 1 leste) já foi calculado em `aplicar` (ladoPingao,
        // antes da chave da intenção) e gravado no viajante.
        const l = LUGARES_POR_DESTINO.get('pingpong')![v.lado];
        return { x: l.x, z: l.z, y: Y1, andar: 1, destino: 'pingpong', opcoes: { olhar: l.olhar } };
      }
      case 'descanso': return em2(pegar(DESCANSO2, it.slot));
      case 'conversa': {
        if (!it.conversaCom) return em1(pegar(LOUNGE, it.slot));
        const c = pegar(CONVERSA, it.slot);
        const primeiro = pid.chave < it.conversaCom; // quem tem a menor chave fica à esquerda, olhando o parceiro
        return em1([c[0] + (primeiro ? -0.5 : 0.5), c[1]], { opcoes: { olhar: primeiro ? Math.PI / 2 : -Math.PI / 2 } });
      }
      case 'guerra': {
        const a = this.o.assentosGuerra[it.slot % this.o.assentosGuerra.length];
        return { x: a.x, y: a.y, z: a.z, andar: 2, opcoes: { sentar: true, olhar: a.z < 4 ? 0 : Math.PI } };
      }
      case 'terraco': return em2(pegar(TERRACO, it.slot));
      case 'galeria': return em2(pegar(GALERIA, it.slot), { opcoes: { olhar: -Math.PI / 2 } });
      case 'saida': return { x: SAIDA_ELEV.x, y: this.y(v.andar), z: SAIDA_ELEV.z, andar: v.andar, remover: true };
      default: return em1(pegar(LOUNGE, it.slot)); // 'entrada' (fim da fase) e qualquer outro
    }
  }

  // Monta o percurso: se o andar muda, passa pelo elevador. `origem` = destino da
  // intenção anterior (de onde a pessoa sai).
  private rota(v: Viajante, d: Passo & { andar: number }, origem: string): Passo[] {
    const fila: Passo[] = [];
    // S9 (§4.3, ida E volta): quem SAI de um lugar da sala de descanso passa primeiro
    // pelo corredor de `VIA` — antes do elevador —, sem atravessar mesa e fliperamas.
    const via = viaNaRota(v.andar, origem, d.andar, d.destino);
    if (via.saida) {
      if (origem === 'estante') for (const e of ESTANTE_LADO_PINGPONG) fila.push({ x: e.x, y: this.y(1), z: e.z }); // contorna a mesa de ping-pong
      fila.push({ x: VIA.x, y: this.y(1), z: VIA.z });
    }
    if (v.andar !== d.andar) {
      fila.push(...passosDoElevador(ELEV, SAIDA_ELEV, this.y(v.andar), this.y(d.andar), d.andar)); // entra por um lado, sai pelo outro
    }
    // Mesas: sem pathfinding, a rota usa os corredores de mesas.ts. SAÍDA — da cadeira ao corredor
    // da fileira e ao corredor leste (e, indo para a sala, à travessia de VIA); CHEGADA — do
    // corredor leste (vindo da sala, pela travessia) ao corredor da fileira e à cadeira.
    const sentado = v.andar === 1 && origem === 'mesa' ? v.mesaVia : null;
    const paraSala = d.andar === 1 && !!d.destino && SALA_SOCIAL.has(d.destino);
    if (sentado) {
      fila.push({ x: sentado.x, y: this.y(1), z: sentado.zc }, { x: CORREDOR_X, y: this.y(1), z: sentado.zc });
      if (paraSala) fila.push({ x: CORREDOR_X, y: this.y(1), z: TRAVESSIA_Z });
      // Copa (z 9…15,5): desce pelo corredor leste e entra por z 13,2 — sem cruzar o pilar (8; 8) nem a bancada.
      if (d.andar === 1 && d.destino === 'copa') fila.push({ x: CORREDOR_X, y: this.y(1), z: COPA_ENTRADA_Z });
    }
    if (v.andar === 1 && d.mesaVia && origem === 'copa') fila.push({ x: CORREDOR_X, y: this.y(1), z: COPA_ENTRADA_Z });
    if (v.andar === 1 && d.mesaVia && via.saida) fila.push({ x: CORREDOR_X, y: this.y(1), z: TRAVESSIA_Z });
    // Vindo do elevador (z −9,3), desce o eixo livre x 0 até a travessia (sala) ou até o corredor da copa,
    // em vez da reta até `VIA`/copa — que cortava poltrona e bancada.
    if (v.andar !== d.andar && d.andar === 1) {
      if (d.destino && SALA_SOCIAL.has(d.destino)) fila.push({ x: SAIDA_ELEV.x, y: this.y(1), z: TRAVESSIA_Z });
      else if (d.destino === 'copa') fila.push({ x: SAIDA_ELEV.x, y: this.y(1), z: COPA_ENTRADA_Z });
    }
    // Quem CHEGA num lugar social da sala também passa por `VIA` (`d.destino` é marcado
    // só nos destinos da sala); se já passou por ela na saída (sala → sala), não repete.
    if (via.chegada) {
      fila.push({ x: VIA.x, y: this.y(1), z: VIA.z });
      if (d.destino === 'estante') for (const e of [...ESTANTE_LADO_PINGPONG].reverse()) fila.push({ x: e.x, y: this.y(1), z: e.z });
    }
    if (d.mesaVia && d.andar === 1) {
      fila.push({ x: CORREDOR_X, y: this.y(1), z: d.mesaVia.zc }, { x: d.mesaVia.x, y: this.y(1), z: d.mesaVia.zc });
    }
    fila.push(d);
    return fila;
  }

  // Saída: do lugar ao elevador do andar, desce ao térreo e sai pela recepção e pela porta até a calçada,
  // onde some — o caminho da chegada ao contrário. Quem ainda nem subiu dá meia-volta direto para a porta.
  private rotaDeSaida(v: Viajante, origem: string): Passo[] {
    const fila: Passo[] = [];
    if (v.andar !== 0) {
      const elev = passosDoElevador(ELEV, SAIDA_ELEV, this.y(v.andar), 0, 0);
      fila.push(...this.rota(v, { ...elev[0], andar: v.andar }, origem), ...elev.slice(1));
    }
    const opcoes = { vel: VEL_ENTRADA };
    fila.push(
      { x: RECEPCAO.x + v.faixa, y: 0, z: RECEPCAO.z, opcoes },
      { x: PORTA.x + v.faixa, y: 0, z: PORTA.z, opcoes },
      { x: RUA.x + v.faixa, y: 0, z: RUA.z, opcoes, remover: true },
    );
    return fila;
  }

  private novoViajante(pid: PessoaId, agora: number, dentro: boolean): Viajante {
    const p = new Pessoa(pid.nome, pid.papel, pid.seedVisual ?? pid.semente, pid.look);
    p.definirCracha(corDaChave(this.chaveFileira(pid.roomId))); // cordão na cor da fileira em que senta (mesmo registro)
    p.grupo.position.set(RUA.x, 0, RUA.z);
    p.colocar(RUA.x, 0, RUA.z);
    // Balão de atividade: sprite com CanvasTexture própria, adicionado ao grupo da pessoa
    // (não mexe em people.ts); a visibilidade por distância é ligada no `atualizar`.
    const balao = new Balao();
    balao.sprite.position.y = BALAO_Y;
    p.grupo.add(balao.sprite);
    this.o.cena.add(p.grupo);
    const v: Viajante = { p, balao, andar: 0, fila: [], chaveIntencao: '', ocultaAoChegar: false, removendo: false, roomId: pid.roomId, assento: -1, mesaVia: null, lado: 0, destino: '', slot: 0, estado: pid.estado, partida: 0, sairEm: 0, faixa: ((pid.semente % 9) - 4) * 0.3 };
    if (dentro) {
      // Já estava no prédio quando a página abriu: nasce no andar 1 e `pousar` a põe no lugar (sem refazer a entrada).
      v.andar = 1;
      p.colocar(SAIDA_ELEV.x, this.o.Y1, SAIDA_ELEV.z);
      p.irPara(SAIDA_ELEV.x, this.o.Y1, SAIDA_ELEV.z); // rota do prédio desde o nascimento (ver nota abaixo)
      return v;
    }
    // Entrada: calçada → porta → recepção → elevador → sobe ao andar 1, em passo apressado (uns 13 s da rua
    // ao elevador). Mais rápido que isso a pessoa "patina": o ciclo de pernas é o de caminhada (people.ts).
    const trecho: Passo[] = [
      { x: PORTA.x, y: 0, z: PORTA.z },
      { x: RECEPCAO.x, y: 0, z: RECEPCAO.z },
      ...passosDoElevador(ELEV, SAIDA_ELEV, 0, this.o.Y1, 1),
    ];
    const lado = v.faixa; // faixa própria na porta e na recepção
    for (const t of trecho) { t.entrada = true; t.opcoes = { vel: VEL_ENTRADA }; if (t.z > 0) t.x += lado; }
    p.colocar(RUA.x + lado, 0, RUA.z);
    // Põe a pessoa em rota do prédio já aqui. Sem isto, `definirEstado` (people.ts) a mandava para a "mesa"
    // padrão (0, 0, 0) antes do primeiro passo: ela andava até o meio do térreo, voltava à porta e entrava de novo.
    p.irPara(RUA.x + lado, 0, RUA.z);
    v.fila = trecho;
    // Fila da calçada: quem chega junto parte um de cada vez; até a sua vez, a pessoa ainda não apareceu na rua.
    const vez = partidaNaFila(agora, this.proximaPartida);
    this.proximaPartida = vez.proxima;
    if (vez.partida > agora) { v.partida = vez.partida; p.grupo.visible = false; }
    return v;
  }

  // Aplica uma intenção nova: troca a fila a partir de onde a pessoa está (sem interromper a entrada).
  private aplicar(v: Viajante, pid: PessoaId, it: Intencao, intencoes: Map<string, Intencao>) {
    if (it.destino === 'entrada') return; // a entrada é roteirizada em novoViajante
    // O lado do ping-pong entra na chave: quando o parceiro troca, o lado pode virar sem
    // o slot mudar — sem isto a chave ficava igual, `aplicar` saía cedo e os dois
    // jogadores acabavam no mesmo lado (bolinha nunca aparecia).
    const lado = it.destino === 'pingpong' ? ladoPingpong(pid.chave, it.slot, intencoes) : v.lado;
    const chave = chaveDaIntencao(it, lado);
    if (chave === v.chaveIntencao) return;
    const entrada = v.fila.filter((s) => s.entrada); // passos da chegada que ainda faltam
    // Destino antigo, guardado antes de sobrescrever (rota de volta por VIA). Quem ainda está chegando não saiu de lugar nenhum.
    const origem = entrada.length ? '' : v.destino;
    v.chaveIntencao = chave;
    v.destino = it.destino;
    v.slot = it.slot;
    v.lado = lado;
    v.p.grupo.visible = v.partida === 0; // quem ainda espera a vez na calçada segue fora de cena
    v.ocultaAoChegar = false;
    // Entrada ainda rodando: os passos dela ficam e a rota nova entra depois (só a última intenção vale).
    // Enquanto a pessoa não subiu, a rota é calculada a partir do andar 1, onde a entrada termina.
    const andar = v.andar;
    const d = this.destinoFisico(v, pid, it);
    const iTroca = entrada.findIndex((s) => s.troca !== undefined);
    if (iTroca >= 0) {
      // Ainda não subiu: o elevador da chegada já leva ao andar do destino. Antes a pessoa descia no 1,
      // atravessava a frente da porta e entrava de novo no elevador para ir ao 2.
      const alvo = d.andar > 0 ? d.andar : 1;
      entrada[iTroca].troca = alvo;
      for (let i = iTroca; i < entrada.length; i++) entrada[i].y = this.y(alvo);
      v.andar = alvo;
    }
    const fila = this.rota(v, d, origem);
    v.andar = andar;
    v.fila = entrada.length ? [...entrada, ...fila] : fila;
    // S9: postura social na troca de intenção — destino da sala (tabela 4.4) define a pose;
    // qualquer outro destino volta à postura de pé (`null`). O `lado` só vale no ping-pong
    // (gravado acima, antes da chave).
    v.p.definirPostura(this.posturaDe(it.destino), v.lado);
    v.removendo = it.destino === 'saida'; // voltou a ter o que fazer no meio da saída: fica
  }

  // S9: destino social → postura da tabela 4.4 (null fora da sala).
  private posturaDe(destino: string): NomePostura | null {
    switch (destino) {
      case 'tv': return 'assistindo';
      case 'fliperama': return 'fliperama';
      case 'pingpong': return 'pingpong';
      case 'estante': return 'ler';
      case 'lounge': return 'sentado';
      default: return null;
    }
  }

  // S9: modos das telas da sala (§4.5) — 1×/passo (o modo muda ~1×/s; antes rodava por
  // quadro com uma varredura e `split` da chave por tela). UMA passada pelos viajantes:
  // TV com plateia parada = show (futebol); fliperama ocupado = game; vazio = off. O
  // `agora` é o mesmo da tela, então GOL e placar sincronizam.
  private telasSala(agora: number): void {
    const s = this.o.sala;
    if (!s) return;
    let tv = false;
    let flip = 0; // bit i = fliperama i ocupado
    for (const v of this.viajantes.values()) {
      if (v.removendo || v.fila.length !== 0) continue;
      if (v.destino === 'tv') { if (!tv && v.p.parada) tv = true; }
      else if (v.destino === 'fliperama' && v.p.parada) flip |= 1 << v.slot;
    }
    s.tv.definirModo(tv ? 'show' : 'off', agora);
    for (let i = 0; i < s.fliperamas.length; i++) s.fliperamas[i].definirModo(flip & (1 << i) ? 'game' : 'off', agora);
  }

  // S9: vida da sala a cada quadro — bolinha e raquetes (só quando existe a sala,
  // montada em main.ts; ausente nos testes, o caminho é nulo e barato). UMA passada,
  // sem alocar: acha o jogador parado em cada lado do ping-pong (lado gravado em `aplicar`).
  private salaAtualizar(t: number, agora: number): void {
    const s = this.o.sala;
    if (!s) return;
    s.atualizar(agora, t);
    let oeste: Viajante | null = null;
    let leste: Viajante | null = null;
    for (const v of this.viajantes.values()) {
      if (v.destino !== 'pingpong' || v.removendo || v.fila.length !== 0) continue;
      if (v.lado === 0 ? oeste : leste) continue; // lado já tem jogador (o 1º vence, como antes)
      if (!v.p.parada) continue;
      if (v.lado === 0) oeste = v;
      else leste = v;
    }
    // Bolinha: só aparece com as duas pessoas paradas nos 2 lados do ping-pong.
    s.bolinha.visible = oeste !== null && leste !== null;
    // Raquetes: quem joga as segura — a raquete do lado segue o jogador, deslocada
    // RAQUETE_AFASTAR na direção da mesa (fora do tronco); sem jogador parado, volta ao
    // descanso no tampo (x ∓ 0,45 e z do item PP_ITEM — fonte única, como em sala.ts).
    for (let lado = 0; lado < 2; lado++) {
      const r = s.raquetes[lado];
      const v = lado === 0 ? oeste : leste;
      if (v) {
        const q = posicaoRaquete(v.p.grupo.position, lado as 0 | 1, this.o.Y1);
        r.position.set(q.x, q.y, q.z);
      } else { const q = posicaoRaquete(null, lado as 0 | 1, this.o.Y1); r.position.set(q.x, q.y, q.z); }
    }
  }

  // S9: GOL da TV na plateia — postura e balão de quem está PARADO assistindo (a
  // postura exige parada; andando, nem comemora nem mostra o balão).
  private plateiaTv(): void {
    for (const v of this.viajantes.values()) {
      if (v.destino !== 'tv' || v.removendo || v.fila.length !== 0 || !v.p.parada) continue;
      v.p.definirPostura(this.gol ? 'comemorar' : 'assistindo', v.lado);
      v.balao.definirTexto(textoBalao(v.estado, '', 'tv', this.modoConteudo, this.gol));
    }
  }

  // Pouso direto (entrada.ts): troca a rota recém-montada pelo ponto final e põe a pessoa lá, já no andar certo.
  private pousar(v: Viajante) {
    const pouso = pousoDireto(v.fila, v.andar);
    if (!pouso) return;
    v.andar = pouso.andar;
    v.p.colocar(pouso.fim.x, pouso.fim.y, pouso.fim.z);
    v.fila = [pouso.fim]; // o passo final ainda roda em `avancar`: senta, vira para a mesa, oculta no banheiro
  }

  private avancar(v: Viajante) {
    while (v.p.parada && v.fila.length) {
      const s = v.fila.shift()!;
      if (s.troca !== undefined) {
        v.andar = s.troca;
        v.p.colocar(s.x, this.y(s.troca), s.z);
        continue;
      }
      v.p.irPara(s.x, s.y, s.z, s.opcoes);
      if (s.ocultar) v.ocultaAoChegar = true;
      if (s.remover) v.removendo = true;
      return;
    }
    if (v.p.parada && !v.fila.length) {
      if (v.ocultaAoChegar) v.p.grupo.visible = false;
      if (v.removendo) this.remover(v);
    }
  }

  private remover(v: Viajante) {
    this.o.cena.remove(v.p.grupo);
    v.balao.liberar(); // textura própria da pessoa: libera ao sair da cena
    liberarArvore(v.p.grupo); // corpo, esqueleto e etiqueta (o material do corpo é compartilhado e fica)
    for (const [k, x] of this.viajantes) if (x === v) this.viajantes.delete(k);
  }

  /** Chamar por quadro. `agora` em epoch ms (Date.now() ao vivo; fixo/simulado em gravação). */
  atualizar(dt: number, t: number, agora: number) {
    // S9: GOL da TV por quadro (§4.5) — a mesma conta de `lanceFutebol(agora, 0).gol`
    // (progresso do lance ≥ GOL_A_PARTIR), sem criar objeto. Ler só no passo perdia ~30%
    // dos gols no nível mínimo (passo de 2 s > janela de 1,4 s) e atrasava a comemoração.
    const gol = golNoQuadro(agora);
    const virou = gol !== this.gol;
    this.gol = gol;
    if (agora - this.ultimoPasso >= (this.economia?.passoMs ?? 1000)) {
      this.ultimoPasso = agora;
      this.passo(agora);
    } else if (virou) {
      this.plateiaTv(); // o gol começou/terminou entre dois passos: só a plateia muda
    }
    // S9: a sala de descanso anda por quadro — a bolinha do ping-pong sobe e desce
    // só quando visível, e as raquetes seguem quem joga (ou descansam no tampo).
    this.salaAtualizar(t, agora);
    for (const v of this.viajantes.values()) {
      if (v.partida > 0) {
        if (agora < v.partida) continue; // ainda não chegou a vez na calçada: fora de cena, sem custo
        v.partida = 0;
        v.p.grupo.visible = true;
      }
      if (v.sairEm > agora) { /* espera a vez na fila indiana: segue onde está, na postura em que estava */ }
      else {
        // Chegou a vez: só agora vale a postura do destino novo (ou de pé, para quem vai embora).
        if (v.sairEm) { v.sairEm = 0; v.p.definirPostura(v.removendo ? null : this.posturaDe(v.destino), v.lado); }
        this.avancar(v);
      }
      const dtp = this.economia ? this.economia.dtDe(v.p.grupo, dt) : dt; // fora da vista/foco: anima com menos passos
      // Tempo liberado de uma vez (pessoa fora da vista acumula até ~1 s) anda em fatias de 0,1 s: cada fatia
      // pode trocar de trecho. Num passo só, a sobra era descartada a cada curva e a pessoa andava em câmera lenta.
      for (let resto = dtp; resto > 0; resto -= FATIA_MAX) {
        v.p.atualizar(Math.min(resto, FATIA_MAX), t);
        if (resto > FATIA_MAX && v.sairEm === 0 && v.fila.length) this.avancar(v);
      }
      // Balão: mostra só com a câmera a menos de BALAO_MAX_DIST da pessoa (sem custo longe).
      const d = this.o.camera.position.distanceTo(v.p.grupo.position);
      const visivel = v.balao.texto !== '' && d < BALAO_MAX_DIST && (this.economia?.balao(v.p.grupo, d) ?? true);
      if (v.balao.sprite.visible !== visivel) v.balao.sprite.visible = visivel;
    }
    this.desviar(dt);
  }

  // Quem se cruza desvia para a própria direita (regra em desvio.ts). Só entre pessoas andando, visíveis e
  // no mesmo andar; no pior caso (48 andando) são ~1100 pares por quadro, só contas simples.
  private andando: Array<{ v: Viajante; a: Andante; lado: number }> = [];
  private desviar(dt: number) {
    const lista = this.andando;
    let n = 0;
    for (const v of this.viajantes.values()) {
      if (!v.p.grupo.visible) continue;
      const item = lista[n] ?? (lista[n] = { v, a: { x: 0, z: 0, dx: 0, dz: 0 }, lado: 0 });
      if (!v.p.rumo(item.a)) continue; // parada
      item.v = v;
      item.a.x = v.p.grupo.position.x;
      item.a.z = v.p.grupo.position.z;
      item.lado = 0;
      n++;
    }
    if (n < 2) return;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const p = lista[i], q = lista[j];
        if (Math.abs(p.v.p.grupo.position.y - q.v.p.grupo.position.y) > 0.5) continue; // andares diferentes
        p.lado = Math.max(p.lado, desvioLateral(p.a, q.a));
        q.lado = Math.max(q.lado, desvioLateral(q.a, p.a));
      }
    }
    for (let i = 0; i < n; i++) {
      const p = lista[i];
      if (p.lado <= 0) continue;
      const r = direitaDe(p.a.dx, p.a.dz);
      p.v.p.grupo.position.x += r.x * p.lado * dt;
      p.v.p.grupo.position.z += r.z * p.lado * dt;
    }
  }

  private passo(agora: number) {
    const pessoas = consolidar(this.agentes, agora, this.mem);
    // Primeiro snapshot da página: essas pessoas já estavam no prédio. A chegada delas é recuada para a
    // fase de entrada (vida/social, regra 1) já ter passado, e cada uma nasce direto no seu lugar.
    const dentro = this.recebeu && !this.abriu;
    if (dentro) for (const p of pessoas) p.entrouEm = Math.min(p.entrouEm, agora - ENTRADA_MAX);
    if (this.recebeu) this.abriu = true;
    const intencoes = this.vida.passo(pessoas, agora);
    // Balão: PessoaId não traz `title` (vida/tipos não muda nesta etapa) — monta chave→título
    // do snapshot e resolve por pessoa os títulos dos agentes ativos (agenteIds).
    const titulos = new Map<string, string>();
    for (const a of this.agentes) if (a.title) titulos.set(a.id, a.title);
    const tituloDaPessoa = (pid: PessoaId): string => {
      for (const id of pid.agenteIds) { const t = titulos.get(id); if (t) return t; }
      return '';
    };
    const vivas = new Set<string>();
    let naFila = 0; // quantos já receberam rota nova neste passo (fila indiana)
    for (const pid of pessoas) {
      vivas.add(pid.chave);
      let v = this.viajantes.get(pid.chave);
      const nova = !v;
      if (!v) { v = this.novoViajante(pid, agora, dentro); this.viajantes.set(pid.chave, v); }
      v.roomId = pid.roomId;
      v.estado = pid.estado;
      v.p.definirContagem(pid.contagem);
      v.p.definirEstado(pid.estado as Estado);
      const it = intencoes.get(pid.chave);
      const antes = v.chaveIntencao;
      const destinoAntes = v.destino, ladoAntes = v.lado;
      if (it) this.aplicar(v, pid, it, intencoes);
      if (nova && dentro) this.pousar(v);
      // Rota nova no mesmo passo que outras: parte depois delas (quem ainda está chegando já vem espaçado da calçada).
      else if (v.chaveIntencao !== antes && !v.fila.some((s) => s.entrada)) {
        const espera = esperaNaFila(naFila++, ESPACO_FILA_MS);
        v.sairEm = agora + espera;
        // Enquanto espera a vez, fica na postura do lugar onde ainda está (a nova entra na partida, em `atualizar`).
        if (espera > 0) v.p.definirPostura(this.posturaDe(destinoAntes), ladoAntes);
      }
      // S9: GOL da TV — quem está parado na sala assistindo comemora (postura + balão),
      // senão segue `assistindo` (`this.gol` vem do quadro; a virada entre passos é do
      // `plateiaTv`). Andando até o sofá: nem postura nem balão "Assistindo".
      const assistindo = it?.destino === 'tv' && v.p.parada && v.fila.length === 0;
      if (assistindo) v.p.definirPostura(this.gol ? 'comemorar' : 'assistindo', v.lado);
      // Texto do balão (1×/s, redesenha a textura só quando muda): estado + título curto + destino da intenção.
      const destinoBalao = it?.destino === 'tv' && !assistindo ? undefined : it?.destino;
      v.balao.definirTexto(textoBalao(pid.estado, tituloDaPessoa(pid), destinoBalao, this.modoConteudo, assistindo ? this.gol : undefined));
    }
    // Quem sumiu da lista (passou dos 30 min ou todos os agentes foram embora): desce e sai pela porta.
    // Se está num lugar da sala, o destino antigo (origem da rota) a faz passar de volta por `VIA`.
    for (const [chave, v] of this.viajantes) {
      if (vivas.has(chave) || v.removendo) continue;
      if (v.partida > 0) { this.remover(v); continue; } // sumiu antes de sair da calçada: nunca entrou
      v.removendo = true;
      v.chaveIntencao = ''; // se voltar à lista no meio da saída, a intenção é reaplicada (e `removendo` zera)
      v.p.grupo.visible = true;
      v.fila = this.rotaDeSaida(v, v.destino);
      // Primeiro da fila levanta e sai já; os demais ficam como estão até a vez (postura de pé na partida).
      const espera = esperaNaFila(naFila++, ESPACO_FILA_MS);
      v.sairEm = agora + espera;
      if (espera === 0) v.p.definirPostura(null);
    }
    // Libera lugares de mesa de quem saiu e fileiras de projetos sem ninguém.
    const salas = new Set<string>();
    for (const v of this.viajantes.values()) salas.add(this.chaveFileira(v.roomId));
    for (const [, f] of this.fileiras) {
      f.usados = f.usados.map((c) => (c && vivas.has(c) ? c : null));
    }
    this.liberarFileiras(salas);
    this.atualizarTelas(pessoas, intencoes, agora);
    this.telasSala(agora);
  }

  // Modo de cada monitor pelo estado do dono da mesa (regra em telas/modo.ts); anti-pisca de 3 s entre modos de trabalho.
  private atualizarTelas(pessoas: PessoaId[], intencoes: Map<string, Intencao>, agora: number) {
    if (!this.o.telas) return;
    const porChave = new Map(pessoas.map((p) => [p.chave, p] as const));
    for (const f of this.fileiras.values()) {
      f.telas.forEach((tela, i) => {
        const pid = f.usados[i] ? porChave.get(f.usados[i]!) : undefined;
        const rep = pid ? representanteDe(pid, this.agentes) : null;
        const novo = modoDaTela({
          ocupado: !!pid,
          estado: pid?.estado ?? 'offline',
          noLugar: pid ? intencoes.get(pid.chave)?.destino === 'mesa' : false,
          atividade: rep?.atividade?.kind,
          desdeEstado: rep?.statusSince ?? pid?.concluidoEm ?? agora,
          agora,
        });
        const m = f.modos[i];
        const modo = modoEstavel(m.modo, m.desde, novo, agora);
        if (modo !== m.modo) { m.modo = modo; m.desde = agora; }
        tela.definirModo(m.modo, agora);
      });
    }
  }

  /** Pessoas existentes (depuração e testes de tela). */
  get pessoasVivas() {
    return [...this.viajantes.entries()].map(([chave, v]) => ({ chave, p: v.p, andar: v.andar }));
  }
}
