// Vida social das pessoas do prédio: regras puras e determinísticas de onde cada uma vai.
// Sem relógio global nem Math.random(): o tempo entra por `agora` (epoch ms) e toda escolha
// decorre de um hash FNV-1a de (semente do prédio, chave da pessoa, balde da regra) —
// a gravação inteira é reproduzível.
//
// Entrada (rua → andar em ≤ ENTRADA_MAX), sala de guerra (histerese de 20 s + teto por
// sessão), trabalho na mesa e waiting/shell na mesa (S7b). Ociosas (idle) e concluídas
// (done, ≤ 30 min) seguem a agenda ociosa: estado por
// pessoa em `Vida.agendas`, segmentos determinísticos de `agenda.ts`, e a alocação final
// do `Vida.passo` (função pura `alocar`) garante a invariante "nunca 2 no mesmo
// (destino, lugar)" — exceto o par de conversa/ping-pong e o excedente em pé do lounge.

import type { Intencao, PessoaId } from './tipos';
import { ENTRADA_MAX, MIN, PERMANENCIA_APOS_CONCLUIR } from './tipos';
import { avancarAgenda, alocar, iniciarAgenda } from './agenda';
import type { Desejo, EstadoAgenda } from './agenda';

// Intervalo padrão de reavaliação para intenções estáveis.
const REAVALIACAO_MS = 5_000;

// Histerese da sala de guerra: com menos de 3 working, ela segue acesa por no máximo isso.
const HISTERESE_GUERRA_MS = 20_000;

// Teto de pessoas na sala de guerra por sessão; o excedente fica na mesa.
const GUERRA_MAX = 12;

// Mesas do trabalho: a ida à copa é da agenda; aqui a escolha da mesa é só o hash.
const MESA_MAX = 16;

// A guerra se conta por "sessão de trabalho" (chat + pasta), nunca por prédio todo.
function chaveSessao(p: PessoaId): string {
  return `${p.sessionId}|${p.roomId}`;
}

// FNV-1a de 32 bits sobre (semente, chave, balde): mesmo input, sempre a mesma escolha.
// O `balde` separa as regras — cada uma tem seu próprio espaço de decisão, sem interferência.
export function hashFNV1a(semente: number, chave: string, balde: string): number {
  const s = `${semente}|${chave}|${balde}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Regra 1 — entrada: a pessoa entra pela rua e em até ENTRADA_MAX (8 s) está no andar.
// O atraso exato varia por semente+chave (determinístico, nunca aleatório).
export function decideEntrada(
  semente: number,
  chave: string,
  entrouEm: number,
  agora: number,
): { emAndar: boolean; ate: number } {
  const atraso = hashFNV1a(semente, chave, 'entrada') % ENTRADA_MAX;
  const ate = entrouEm + atraso;
  return { emAndar: agora >= ate, ate };
}

// Estado da histerese por sessão: fica no mapa da `Vida` e entra/sai pelas funções puras.
export interface EstadoGuerra {
  ativa: boolean;
  // epoch em que a contagem caiu para < 3 (0 = nunca/não importa)
  caiuEm: number;
}

// Regra 3 — guerra: 3+ working na mesma sessão acende a sala; com < 3, ela segue acesa
// só por mais HISTERESE_GUERRA_MS (20 s) antes de devolver as pessoas à mesa.
// Função pura: recebe o estado anterior e devolve o novo (quem guarda o mapa é a `Vida`).
export function decideGuerra(
  nWorking: number,
  agora: number,
  anterior: EstadoGuerra | undefined,
): { ativa: boolean; estado: EstadoGuerra } {
  if (nWorking >= 3) return { ativa: true, estado: { ativa: true, caiuEm: 0 } };
  if (!anterior?.ativa) return { ativa: false, estado: { ativa: false, caiuEm: 0 } };
  // Queda recém-observada (estado antigo com caiuEm 0): registra `agora` como início da queda.
  const caiuEm = anterior.caiuEm ? anterior.caiuEm : agora;
  if (agora - caiuEm >= HISTERESE_GUERRA_MS) return { ativa: false, estado: { ativa: false, caiuEm: 0 } };
  return { ativa: true, estado: { ativa: true, caiuEm } };
}

// Quem fica na guerra: ordem determinística por chave dentro da sessão;
// posições 0..GUERRA_MAX-1 ganham slot; o excedente volta para a mesa.
export function slotGuerra(ordemChaves: string[], chave: string, ativa: boolean): number | null {
  if (!ativa) return null;
  const i = ordemChaves.indexOf(chave);
  return i === -1 || i >= GUERRA_MAX ? null : i;
}

// Regra 4 — trabalho: mesa estável por hash (a ida à copa entra na agenda ociosa).
// waiting/shell (S7b) caem no MESMO hash: a pessoa fica na mesma mesa do trabalho,
// mãos paradas / recostada — estável entre passos.
export function decideTrabalho(semente: number, chave: string): number {
  return hashFNV1a(semente, chave, 'mesa') % MESA_MAX;
}

// Regra 8 — saída: concluída permanece no prédio pelo exato PERMANENCIA_APOS_CONCLUIR
// (30 min). Quem remove o corpo do snapshot continua sendo a identidade (identidade.ts);
// `decideSaida` documenta a janela que ela aplica. Desde a S7b a concluída circula na
// agenda ociosa — a exportação segue para os testes da janela de 30 min.
export function decideSaida(pessoa: PessoaId, agora: number): Intencao {
  const desde = pessoa.concluidoEm ?? agora;
  return {
    chave: pessoa.chave,
    destino: 'saida',
    slot: 0,
    desde,
    ate: desde + PERMANENCIA_APOS_CONCLUIR,
  };
}

// Carência na mesa antes da vida social (31/10/2026): quem acabou de ficar ocioso ou concluir
// ainda está em uso — a vida social cresce com o tempo sem uso, não a cada pausa entre turnos.
export const CARENCIA_IDLE_MS = 5 * MIN;
export const CARENCIA_DONE_MS = 2 * MIN;

export class Vida {
  private readonly semente: number;
  // Última intenção de cada pessoa presente; serve para preservar o "desde" e remover quem sumiu.
  private ultimas = new Map<string, Intencao>();
  // Histerese da guerra por sessão (chat|pasta).
  private guerras = new Map<string, EstadoGuerra>();
  // Agenda ociosa (S7b): estado por pessoa para quem está `idle`/`done`; a entrada some
  // do mapa na transição de volta ao trabalho (o `desde` zera, regra 4.2).
  private agendas = new Map<string, EstadoAgenda>();

  constructor(semente: number) {
    this.semente = semente;
  }

  // Um passo da simulação: devolve a intenção de cada pessoa presente neste snapshot.
  // Chave ausente de `pessoas` (sumiu do prédio) é removida da memória da classe.
  passo(pessoas: PessoaId[], agora: number): Map<string, Intencao> {
    const presentes = new Set(pessoas.map((p) => p.chave));
    for (const chave of this.ultimas.keys()) if (!presentes.has(chave)) this.ultimas.delete(chave);
    for (const chave of this.agendas.keys()) if (!presentes.has(chave)) this.agendas.delete(chave);

    // Agrupa por sessão e atualiza a histerese da guerra antes de decidir cada pessoa
    // (a decisão de um depende do estado global da sala, não só dele).
    const porSessao = new Map<string, PessoaId[]>();
    for (const p of pessoas) {
      const chaveSess = chaveSessao(p);
      const grupo = porSessao.get(chaveSess);
      if (grupo) grupo.push(p);
      else porSessao.set(chaveSess, [p]);
    }
    for (const chave of this.guerras.keys()) if (!porSessao.has(chave)) this.guerras.delete(chave);

    const guerraAtiva = new Map<string, boolean>();
    const ordemPorSessao = new Map<string, string[]>();
    for (const [chaveSess, grupo] of porSessao) {
      const working = grupo.filter((g) => g.estado === 'working');
      const { ativa, estado } = decideGuerra(working.length, agora, this.guerras.get(chaveSess));
      this.guerras.set(chaveSess, estado);
      guerraAtiva.set(chaveSess, ativa);
      // Slots da guerra na ordem estável das chaves — repetível entre passos.
      ordemPorSessao.set(chaveSess, working.map((g) => g.chave).sort());
    }

    // Decide cada pessoa (guerra, mesa, agenda ociosa). Quem não está ociosa/done some
    // da agenda agora — a transição de volta ao trabalho zera o `desde` da próxima vez.
    const resultado = new Map<string, Intencao>();
    for (const p of pessoas) {
      const anterior = this.ultimas.get(p.chave);
      if (p.estado !== 'idle' && p.estado !== 'done') this.agendas.delete(p.chave);
      const nova = this.decide(p, agora, guerraAtiva, ordemPorSessao);
      resultado.set(
        p.chave,
        // Mesma intenção do passo anterior: preserva o "desde" (a pessoa não "chegou" de novo).
        anterior && anterior.destino === nova.destino && anterior.slot === nova.slot && anterior.fase === nova.fase
          ? { ...nova, desde: anterior.desde }
          : nova,
      );
    }

    // Alocação da agenda (4.2): com todos decididos, fixa (destino, lugar) sem
    // sobreposição — capacidades da tabela 4.2 vêm de padrão no `alocar`, exceto o
    // ping-pong: a tabela conta 2 lugares (os 2 lados), mas `alocar` dá UM lugar por
    // PAR — com 2, cabiam 2 pares numa mesa só (o predio usa os lados, não o lugar).
    // Capacidade 1 = um par; o excedente recua pela ordem de recuo.
    // Desejo: destino do segmento em vigor; `lugarAnterior` vale só quando a última
    // intenção era o MESMO destino (o lugar dela ali — mantido se ainda livre).
    const desejos: Desejo[] = [];
    for (const [chave, estado] of this.agendas) {
      const intent = resultado.get(chave);
      if (!intent || agora < estado.desde) continue; // sumiu do snapshot, ou ainda na carência (fica na mesa)
      const ultima = this.ultimas.get(chave);
      desejos.push({
        chave,
        destino: estado.destino,
        lugarAnterior: ultima?.destino === intent.destino ? ultima.slot : undefined,
      });
    }
    // Escreve o lugar final de volta na Intenção (`conversa` preenche `conversaCom`).
    for (const aloc of alocar(desejos, { pingpong: 1 })) {
      const intent = resultado.get(aloc.chave);
      if (!intent) continue;
      intent.destino = aloc.destino;
      intent.slot = aloc.lugar;
      intent.conversaCom = aloc.conversaCom;
    }

    this.ultimas = resultado;
    return resultado;
  }

  // Estado da agenda ociosa de `p` neste passo. Período ocioso em curso (`idle`/`done`
  // no passo anterior: a chave ainda está em `this.agendas`): avança com `avancarAgenda`,
  // recomputando o `piso` (minutos ocioso) com o `desde` estável do período. Transição
  // recém-observada (chave ausente do mapa): recria com `desde` = agora (idle) ou
  // `concluidoEm` (done) e `piso` correspondente.
  private estadosAgenda(p: PessoaId, agora: number): EstadoAgenda {
    const anterior = this.agendas.get(p.chave);
    if (anterior) {
      const piso = Math.max(0, Math.floor((agora - anterior.desde) / MIN));
      const novo = avancarAgenda({ ...anterior, piso }, agora);
      this.agendas.set(p.chave, novo);
      return novo;
    }
    // A agenda só começa depois da carência: `desde` fica no futuro enquanto a pessoa segue na mesa.
    const desde = p.estado === 'done' ? (p.concluidoEm ?? agora) + CARENCIA_DONE_MS : agora + CARENCIA_IDLE_MS;
    const piso = Math.max(0, Math.floor((agora - desde) / MIN));
    const novo = iniciarAgenda(this.semente, p.chave, desde, piso);
    this.agendas.set(p.chave, novo);
    return novo;
  }

  private decide(
    p: PessoaId,
    agora: number,
    guerraAtiva: Map<string, boolean>,
    ordem: Map<string, string[]>,
  ): Intencao {
    // Regra 1: nos primeiros ≤ ENTRADA_MAX (8 s) desde a chegada, está na rua.
    const entrada = decideEntrada(this.semente, p.chave, p.entrouEm, agora);
    if (!entrada.emAndar) {
      return {
        chave: p.chave,
        destino: 'entrada',
        slot: 0,
        fase: 'rua',
        desde: p.entrouEm,
        ate: entrada.ate,
      };
    }

    if (p.estado === 'working') {
      const chaveSess = chaveSessao(p);
      const slot = slotGuerra(ordem.get(chaveSess) ?? [], p.chave, guerraAtiva.get(chaveSess) === true);
      // Regra 3: guerra (dentro do teto por sessão).
      if (slot !== null) {
        return { chave: p.chave, destino: 'guerra', slot, desde: p.entrouEm, ate: agora + REAVALIACAO_MS };
      }
      // Regra 4: trabalho — fica na mesa (a ida à copa é da agenda).
      return {
        chave: p.chave,
        destino: 'mesa',
        slot: decideTrabalho(this.semente, p.chave),
        desde: p.entrouEm,
        ate: agora + REAVALIACAO_MS,
      };
    }

    // S7b: waiting/shell → mesa, mãos paradas / recostado — MESMO hash do trabalho
    // (mesma mesa de `working`, estável entre passos), sem entrar na guerra.
    if (p.estado === 'waiting' || p.estado === 'shell') {
      return {
        chave: p.chave,
        destino: 'mesa',
        slot: decideTrabalho(this.semente, p.chave),
        desde: p.entrouEm,
        ate: agora + REAVALIACAO_MS,
      };
    }

    // 4.2: ociosas (idle) e concluídas (done, ≤ 30 min — a remoção é da identidade)
    // seguem a agenda ociosa. `slot` é provisório (0): o `alocar` do passo fixa o
    // lugar final; destino cheio cai na ordem de recuo.
    if (p.estado === 'idle' || p.estado === 'done') {
      const estado = this.estadosAgenda(p, agora);
      // Carência: segue na mesa (mesmo lugar do trabalho) até a agenda começar.
      if (agora < estado.desde) {
        return { chave: p.chave, destino: 'mesa', slot: decideTrabalho(this.semente, p.chave), desde: p.entrouEm, ate: estado.desde };
      }
      return {
        chave: p.chave,
        destino: estado.destino,
        slot: 0,
        desde: estado.desde,
        ate: estado.ate,
      };
    }

    // `offline` (fora da spec S7b; na prática a identidade não o expõe): fallback na
    // mesa pelo hash — a mesma escolha de `working`.
    return {
      chave: p.chave,
      destino: 'mesa',
      slot: decideTrabalho(this.semente, p.chave),
      desde: p.entrouEm,
      ate: agora + REAVALIACAO_MS,
    };
  }
}
