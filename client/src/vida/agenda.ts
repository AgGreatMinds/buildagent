// Agenda ociosa da vida social — módulo puro.
// Decide onde cada pessoa ociosa/concluída vai (destino) e por quanto tempo,
// sem aleatoriedade nem relógio global: toda escolha sai do hashFNV1a de
// (semente do prédio, chave da pessoa, balde 'ag|k|...') — a gravação inteira é
// reproduzível. Os tipos de entrada são os próprios da agenda; nenhum arquivo
// alheio a `./social` e `./tipos` é editado.
//
// Blocos:
// 1. Tabelas (pesos/durações/lugares do andar 1, andar 2, ordem de recuo).
// 2. `segmento` — destino + duração de um segmento k, sem repetir o destino anterior.
// 3. `avancarAgenda` — avança k(s) até o estado cobrir `agora` (teto de 500 voltas).
// 4. `alocar` — preenche os lugares mantendo a invariante "nunca 2 no mesmo
//    (destino, lugar)", exceto o excedente em pé do lounge e o par de conversa/ping-pong.

import { hashFNV1a } from './social';
import { MIN } from './tipos';

// Destinos da agenda ociosa (tabela 4.2). `tv`, `fliperama`, `pingpong` e `estante`
// ainda não existem em `Destino` (tipos.ts) — a ligação ao tipo real vem em S7b;
// por isso o tipo próprio, cobrindo os 11 destinos da tabela, declarado aqui.
export type DestinoAgenda =
  | 'lounge'
  | 'tv'
  | 'fliperama'
  | 'pingpong'
  | 'estante'
  | 'copa'
  | 'banheiro'
  | 'conversa'
  | 'terraco'
  | 'galeria'
  | 'descanso';

// Tabela do andar 1 (tabela 4.2): peso no sorteio, duração em minutos (mín–máx) e lugares.
const TABELA_ANDAR_1: Array<{ destino: DestinoAgenda; peso: number; min: number; max: number; lugares: number }> = [
  { destino: 'lounge', peso: 3, min: 1, max: 3, lugares: 9 },
  { destino: 'tv', peso: 3, min: 2, max: 5, lugares: 4 },
  { destino: 'fliperama', peso: 2, min: 1, max: 3, lugares: 2 },
  { destino: 'pingpong', peso: 2, min: 1, max: 3, lugares: 2 },
  { destino: 'estante', peso: 1, min: 1, max: 2, lugares: 2 },
  { destino: 'copa', peso: 2, min: 1, max: 2, lugares: 4 },
  { destino: 'banheiro', peso: 1, min: 1, max: 2, lugares: 3 },
  { destino: 'conversa', peso: 2, min: 1, max: 3, lugares: 4 },
];

// Andar 2 (tabela 4.2): destinos com pesos iguais, duração 3–8 min. Só abrem com
// ociosidade/conclusão ≥ 5 min e em 30% dos segmentos — decisão dentro de `segmento`.
const TABELA_ANDAR_2: Array<{ destino: DestinoAgenda; min: number; max: number; lugares: number }> = [
  { destino: 'terraco', min: 3, max: 8, lugares: 8 },
  { destino: 'galeria', min: 3, max: 8, lugares: 4 },
  { destino: 'descanso', min: 3, max: 8, lugares: 3 },
];

// Ordem de recuo quando o destino desejado está cheio (regra 4.2, linear, sem retorno).
const RECUO: readonly DestinoAgenda[] = ['lounge', 'copa', 'tv', 'fliperama', 'estante', 'banheiro'];

// Tudo cheio → lounge em pé: lugar ≥ 9 (0–8 são os assentos novos; 9+ é a lista antiga de pé).
const LOUNGE_PE_DESDE = 9;

// Destinos que só comportam pares: alocados no mesmo lugar, dois lados juntos.
const DUPLOS: readonly DestinoAgenda[] = ['pingpong', 'conversa'];

// Limiar (minutos) de ociosidade/conclusão para liberar o andar 2.
const PISO_2_DESDE_MIN = 5;

// Percentual de segmentos que sobem ao andar 2 (quando `piso` já liberou).
const CHANCE_PISO_2 = 30;

// Teto do laço de avanço (protege contra `agora` absurdamente à frente de `desde`).
const TETO_VOLTAS = 500;

// Estado por pessoa dentro da agenda (regra 4.2): o segmento em vigor e quando
// termina. Os campos de recomputação (`semente`, `chave`, `piso`) andam com o
// estado para `avancarAgenda` permanecer puro e determinístico: qualquer segmento
// é re-derivável de (semente, chave, k, piso) — gravação inteira reproduzível.
// `desde` zera ao voltar a trabalhar (o passo da `Vida` recria o estado nesses casos).
export interface EstadoAgenda {
  semente: number;
  chave: string;
  // minutos ocioso/concluído; ≥ 5 libera o andar 2 (30% dos segmentos)
  piso: number;
  // epoch em que ficou idle/done (ancoragem dos segmentos)
  desde: number;
  // índice do segmento em vigor
  k: number;
  // destino do segmento em vigor
  destino: DestinoAgenda;
  // epoch em que o segmento termina
  ate: number;
}

// Cria o estado no segmento 0: o primeiro destino/duração saem de `segmento` com
// `anterior` indefinido. Sem isto, um estado "em mão" poderia ter `ate` inconsistente.
export function iniciarAgenda(semente: number, chave: string, desde: number, piso: number): EstadoAgenda {
  const seg = segmento(semente, chave, 0, piso, undefined);
  return {
    semente,
    chave,
    piso,
    desde,
    k: 0,
    destino: seg.destino,
    ate: desde + seg.duracaoMinutos * MIN,
  };
}

// Resultado de um segmento: destino + duração em minutos inteiros.
export interface ResultadoSegmento {
  destino: DestinoAgenda;
  duracaoMinutos: number;
}

// Um desejo de alocação: quem quer onde, e de onde veio.
export interface Desejo {
  // chave da pessoa (ordem de alocação é por ela)
  chave: string;
  // destino desejado no segmento atual
  destino: DestinoAgenda;
  // lugar no destino anterior; se ainda livre, a pessoa mantém
  lugarAnterior?: number;
  // só para `conversa`: chave do parceiro desejado
  com?: string;
}

// Resultado de `alocar`, por pessoa: destino (possivelmente de recuo) e lugar.
export interface AlocacaoPessoa {
  chave: string;
  destino: DestinoAgenda;
  // -1 não aparece no resultado final; lugar de pé no lounge é ≥ LOUNGE_PE_DESDE
  lugar: number;
  // preenchido apenas quando destino === 'conversa'
  conversaCom?: string;
}

// Duração em minutos inteiros: `min + hash % (max - min + 1)` (regra 4.2).
function duracaoMin(semente: number, chave: string, k: number, min: number, max: number): number {
  return min + (hashFNV1a(semente, chave, `ag|${k}|duracao`) % (max - min + 1));
}

// Sorteio de destino por peso no andar 1: o hash recai em [0, total) e a soma
// acumulada roda a tabela a partir de `inicio` (posição logo após o destino
// anterior, quando existe) — "não repete o destino do segmento anterior".
function sorteiaAndar1(
  semente: number,
  chave: string,
  k: number,
  anterior: DestinoAgenda | undefined,
): DestinoAgenda {
  const total = TABELA_ANDAR_1.reduce((soma, linha) => soma + linha.peso, 0);
  const r = hashFNV1a(semente, chave, `ag|${k}|destino`) % total;
  // Sem anterior: a leitura parte do topo da tabela. Com anterior: da linha
  // seguinte — o `anterior` fica fora da caçada por construção.
  const n = TABELA_ANDAR_1.length;
  const idxAnterior = anterior === undefined ? -1 : TABELA_ANDAR_1.findIndex((linha) => linha.destino === anterior);
  const inicio = idxAnterior === -1 ? 0 : (idxAnterior + 1) % n;
  // Caçada: a soma acumulada a partir de `inicio` consome `r` por peso. Roda n-1
  // linhas quando há anterior (o último candidato seria o próprio anterior).
  let restante = r;
  const passosMax = idxAnterior === -1 ? n : n - 1;
  for (let passo = 0; passo < passosMax; passo++) {
    const linha = TABELA_ANDAR_1[(inicio + passo) % n];
    if (restante < linha.peso) return linha.destino;
    restante -= linha.peso;
  }
  // Sobrou massa (só possível com anterior: `r` além de total - pesoDoAnterior):
  // o sorteio "queria" o anterior — regra da tabela: pega o próximo da tabela.
  return TABELA_ANDAR_1[inicio].destino;
}

// Sorteio no andar 2: pesos iguais → hash % 3; pula o anterior pelo próximo da tabela.
function sorteiaAndar2(
  semente: number,
  chave: string,
  k: number,
  anterior: DestinoAgenda | undefined,
): DestinoAgenda {
  const idx = hashFNV1a(semente, chave, `ag|${k}|piso2`) % TABELA_ANDAR_2.length;
  for (let passo = 1; passo <= TABELA_ANDAR_2.length; passo++) {
    const candidato = TABELA_ANDAR_2[(idx + passo - 1) % TABELA_ANDAR_2.length].destino;
    if (candidato !== anterior || passo === TABELA_ANDAR_2.length) return candidato;
  }
  return TABELA_ANDAR_2[idx].destino;
}

// Segmento k (regra 4.2): andar 2 só se `piso` (minutos ocioso/concluído) ≥ 5 E o
// sorteio de 30% cair; senão, tabela do andar 1 por peso. Duração sempre por hash.
export function segmento(
  semente: number,
  chave: string,
  k: number,
  piso: number,
  anterior: DestinoAgenda | undefined,
): ResultadoSegmento {
  const liberaPiso2 = piso >= PISO_2_DESDE_MIN;
  const sobePara2 =
    liberaPiso2 && hashFNV1a(semente, chave, `ag|${k}|piso2|liberado`) % 100 < CHANCE_PISO_2;
  if (sobePara2) {
    const destino = sorteiaAndar2(semente, chave, k, anterior);
    const linha = TABELA_ANDAR_2.find((l) => l.destino === destino) as (typeof TABELA_ANDAR_2)[number];
    return { destino, duracaoMinutos: duracaoMin(semente, chave, k, linha.min, linha.max) };
  }
  const destino = sorteiaAndar1(semente, chave, k, anterior);
  const linha = TABELA_ANDAR_1.find((l) => l.destino === destino) as (typeof TABELA_ANDAR_1)[number];
  return { destino, duracaoMinutos: duracaoMin(semente, chave, k, linha.min, linha.max) };
}

// Avança o estado até cobrir `agora` (regra 4.2): `while (agora >= ate) k++`,
// recomputando o segmento e somando as durações ao `ate`; teto de 500 voltas
// contra `agora` absurdamente à frente de `desde`. Devolve um estado novo —
// o mapa da `Vida` troca a referência sem mutação.
export function avancarAgenda(estado: EstadoAgenda, agora: number): EstadoAgenda {
  // Ainda dentro do segmento em vigor: nada a fazer.
  if (agora < estado.ate) return estado;
  let k = estado.k;
  let destino = estado.destino;
  let ate = estado.ate;
  let voltas = 0;
  while (agora >= ate && voltas < TETO_VOLTAS) {
    k += 1;
    const seg = segmento(estado.semente, estado.chave, k, estado.piso, destino);
    ate += seg.duracaoMinutos * MIN;
    destino = seg.destino;
    voltas += 1;
  }
  return { ...estado, k, destino, ate };
}

// Recuo linear comum (regra 4.2): primeiro destino de RECUO com lugar livre
// (duplas fora — decididas à parte); tudo cheio → lounge em pé (lugar ≥ 9, à
// vontade). `peUsados` dá lugar único a cada excedente (9, 10, 11...) — nem a
// exceção de sobreposição de pé precisa disparar na prática.
function recuaLugar(
  livres: Map<DestinoAgenda, Set<number>>,
  peUsados: Set<number>,
  chave: string,
  indice: number,
  resultado: AlocacaoPessoa[],
): void {
  for (const candidato of RECUO) {
    if (DUPLOS.includes(candidato)) continue;
    const set = livres.get(candidato);
    if (set && set.size > 0) {
      const lugar = Math.min(...Array.from(set));
      set.delete(lugar);
      resultado[indice] = { chave, destino: candidato, lugar };
      return;
    }
  }
  let lugar = LOUNGE_PE_DESDE;
  while (peUsados.has(lugar)) lugar += 1;
  peUsados.add(lugar);
  resultado[indice] = { chave, destino: 'lounge', lugar };
}

// Alocação (regra 4.2): percorre as pessoas em ordem de `chave`; mantém o lugar
// anterior se livre; senão o primeiro livre; destino cheio → ordem de recuo; tudo
// cheio → lounge em pé. Duplas (pingpong/conversa): pares no MESMO lugar, em
// ordem de chave; contagem ímpar → a última recua; `conversa` preenche `conversaCom`.
// Capacidades por destino (parciais): só o que o chamador conhece é sobreposto.
export function alocar(desejos: Desejo[], capacidades: Partial<Record<DestinoAgenda, number>>): AlocacaoPessoa[] {
  // Ordem por `chave` (independe da ordem de entrada dos desejos).
  const porChave = [...desejos].sort((a, b) => (a.chave < b.chave ? -1 : a.chave > b.chave ? 1 : 0));
  const resultado: AlocacaoPessoa[] = new Array(porChave.length);

  // Lugares por destino: padrão da tabela 4.2; o chamador pode sobrepor via `capacidades`.
  const lugares = new Map<DestinoAgenda, number>();
  for (const linha of TABELA_ANDAR_1) lugares.set(linha.destino, capacidades[linha.destino] ?? linha.lugares);
  for (const linha of TABELA_ANDAR_2) lugares.set(linha.destino, capacidades[linha.destino] ?? linha.lugares);

  // Set de lugares livres por destino (0..n-1); as duplas marcam os usados depois, na
  // própria passagem, para que um destino de dupla não dê 2× a cada lugar do mesmo par.
  const livres: Map<DestinoAgenda, Set<number>> = new Map();
  for (const [destino, n] of lugares) {
    const set = new Set<number>();
    for (let s = 0; s < n; s++) set.add(s);
    livres.set(destino, set);
  }

  // Lugares únicos de pé no lounge (excedente): cada excedente tem o seu próprio
  // lugar — a sobreposição documentada só vale para pares, nunca para "em pé".
  const peUsados = new Set<number>();

  // Passo 1: destinos comuns (mantém lugar anterior se livre; senão primeiro livre;
  // senão recuo linear; tudo cheio → lounge em pé). Duplas ficam para o passo 2.
  for (let i = 0; i < porChave.length; i++) {
    const desejo = porChave[i];
    if (DUPLOS.includes(desejo.destino)) continue; // passo 2 decide
    const set = livres.get(desejo.destino);
    // Mantém o lugar anterior se ainda livre — estabilidade sem custo de decisão.
    if (desejo.lugarAnterior !== undefined && set?.has(desejo.lugarAnterior)) {
      set.delete(desejo.lugarAnterior);
      resultado[i] = { chave: desejo.chave, destino: desejo.destino, lugar: desejo.lugarAnterior };
      continue;
    }
    // Primeiro lugar livre (menor índice → determinístico).
    if (set && set.size > 0) {
      const lugar = Math.min(...Array.from(set));
      set.delete(lugar);
      resultado[i] = { chave: desejo.chave, destino: desejo.destino, lugar };
      continue;
    }
    // Destino cheio → ordem de recuo; tudo cheio → lounge em pé.
    recuaLugar(livres, peUsados, desejo.chave, i, resultado);
  }

  // Passo 2: duplas. Para cada destino de dupla, em ordem de chave (porChave já vem
  // ordenado), forma pares: parceiro desejado em `com` primeiro; senão, o próximo da
  // ordem. Cada par ocupa UM lugar do destino (a exceção documentada à invariante).
  // Contagem ímpar → a última recua; destino sem lugar livre → o par inteiro recua.
  const porDestino = new Map<DestinoAgenda, { i: number; desejo: Desejo }[]>();
  for (let i = 0; i < porChave.length; i++) {
    const desejo = porChave[i];
    if (!DUPLOS.includes(desejo.destino)) continue;
    const lista = porDestino.get(desejo.destino);
    if (lista) lista.push({ i, desejo });
    else porDestino.set(desejo.destino, [{ i, desejo }]);
  }

  for (const [destino, membros] of porDestino) {
    const set = livres.get(destino);
    const chavesAqui = new Set(membros.map((m) => m.desejo.chave));
    const pareado = new Set<string>();
    const pendentes: { i: number; desejo: Desejo }[] = [];

    for (const membro of membros) {
      if (pareado.has(membro.desejo.chave)) continue;
      // Parceiro: o desejado em `com` (se no mesmo destino e ainda livre); senão o próximo.
      let parceiro: { i: number; desejo: Desejo } | undefined;
      const alvo = membro.desejo.com;
      if (alvo && chavesAqui.has(alvo) && !pareado.has(alvo)) {
        parceiro = membros.find((m) => m.desejo.chave === alvo && !pareado.has(m.desejo.chave));
      }
      if (!parceiro) {
        parceiro = membros.find((m) => m !== membro && !pareado.has(m.desejo.chave));
      }
      // Sem parceiro (contagem ímpar) → a última recua para o recuo linear comum.
      if (!parceiro) {
        pendentes.push(membro);
        continue;
      }
      // Lugar do par: primeiro lugar livre do destino; destino cheio → ambos recuam.
      const setSeg = set;
      const lugarPar = setSeg !== undefined && setSeg.size > 0 ? Math.min(...Array.from(setSeg)) : -1;
      if (lugarPar === -1 || setSeg === undefined) {
        pendentes.push(membro);
        pendentes.push(parceiro);
        continue;
      }
      setSeg.delete(lugarPar);
      pareado.add(membro.desejo.chave);
      pareado.add(parceiro.desejo.chave);
      const conversaCom = destino === 'conversa' ? parceiro.desejo.chave : undefined;
      const conversaComRev = destino === 'conversa' ? membro.desejo.chave : undefined;
      resultado[membro.i] = { chave: membro.desejo.chave, destino, lugar: lugarPar, conversaCom };
      resultado[parceiro.i] = { chave: parceiro.desejo.chave, destino, lugar: lugarPar, conversaCom: conversaComRev };
    }

    // Quem ficou de fora (ímpar, ou par sem lugar): recuo linear comum.
    for (const pend of pendentes) recuaLugar(livres, peUsados, pend.desejo.chave, pend.i, resultado);
  }

  // Duplas cujo destino estava cheio desde o passo 1 e sem lugar livre no passo 2
  // já foram colocadas em `pendentes`; o único caso que ainda pode estar ausente é
  // duplicidade de chave em `desejos` — segurança de totalidade (lugar de pé único).
  for (let i = 0; i < resultado.length; i++) {
    if (resultado[i] === undefined) recuaLugar(livres, peUsados, porChave[i].chave, i, resultado);
  }
  return resultado;
}
