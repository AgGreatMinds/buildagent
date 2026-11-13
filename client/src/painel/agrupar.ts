// Lógica pura da lista de agentes (item 1 do painel): agrupa o snapshot por sala (projeto),
// aninha os subagentes sob o pai e faz a busca. Sem DOM — o DOM fica em lista.ts.
// Fonte de verdade dos tipos: shared/types.ts (AgentInfo/RoomInfo/AccountInfo).
import type { ActivityKind, AgentInfo, AgentStatus, AccountInfo, RoomInfo } from '../../../shared/types';
import type { AppearanceParts } from '../../../shared/appearance';

/** Agrupador de snapshot para a lista: sala → agentes (pai com filhados). */
export interface ItemAgente {
  id: string;
  nome: string;
  papel: string;
  titulo?: string;
  status: AgentInfo['status'];
  /** Quando o status mudou (epoch ms) — vira "no status há X" pelo tempo.ts. */
  statusDesde: number;
  /** Ausente = 'claude' (regra do protocolo: campo opcional). */
  provedor: AccountInfo['provider'] | undefined;
  conta: string;
  /** Rótulo amigável da conta (ex.: "Conta C"); cai no id quando a conta é desconhecida. */
  contaRotulo: string;
  /** Sigla curtíssima da conta (AccountInfo.short) — vira o selo-círculo da lista. */
  contaSigla?: string;
  /** Cor da conta (AccountInfo.color) — tingindo do selo; ausente cai no padrão do CSS. */
  contaCor?: string;
  modelo?: string;
  /** Semente de aparência do agente — o rosto da lista é a MESMA pessoa do boneco 3D (Frente B). */
  seed: number;
  /** Peças do editor por cima da aparência da seed (ver shared/appearance.ts). */
  partes?: AppearanceParts;
  /** Dica de gênero do nome automático (AgentInfo.look): rosto e corpo 3D concordam com o nome. */
  look?: 'f' | 'm';
  /** Atividade atual (ou a mais recente) — vira a segunda linha da lista (ver linhaDaAtividade). */
  atividade?: { kind: ActivityKind; texto: string };
  /** Motivo da espera (AgentInfo.waitingFor) quando o status é 'waiting'. Ex.: "aprovar uma permissão". */
  esperandoPor?: string;
  /** Rótulo do primeiro shell que o agente espera (AgentInfo.shells[0].label), quando houver. */
  shellRotulo?: string;
  /** Subagentes aninhados sob este agente (somente 1 nível). */
  filhados: ItemAgente[];
}

/** Sala (projeto) com os agentes principais (e seus subagentes) nela. */
export interface GrupoSala {
  id: string;
  nome: string;
  /** Caminho do projeto — o cabeçalho do grupo exibe riscado no meio (Frente B). */
  path: string;
  /** Ordem de chegada da sala no snapshot — é ela que manda na ordem dos grupos. */
  slot: number;
  /** App que abriu a sala (RoomInfo.launcher): decide a fileira e, com ela, a cor do projeto. */
  lancador?: string;
  agentes: ItemAgente[];
}

/**
 * Converte um snapshot em grupos: salas (por `slot`) → agentes principais com os
 * subagentes aninhados. Regras:
 * - `offline` sai da lista; `done` fica (é um estado exibível);
 * - subagente cujo pai não está no snapshot sobe para o nível da sala;
 * - os filhados são ordenados por nome; os agentes da sala, por nome também
 *   (a posição 3D pertence à cena, não à lista).
 */
export function agruparPorSala(snapshot: { rooms?: RoomInfo[]; agents?: AgentInfo[]; accounts?: AccountInfo[] }): GrupoSala[] {
  const salas = [...(snapshot.rooms ?? [])].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  const rotulos = new Map<string, string>(); // conta → rótulo amigável
  const siglas = new Map<string, string>(); // conta → sigla curta (1–3 letras) do selo-círculo
  const cores = new Map<string, string>(); // conta → cor de selo
  for (const c of snapshot.accounts ?? []) {
    rotulos.set(c.id, c.name);
    siglas.set(c.id, c.short);
    cores.set(c.id, c.color);
  }

  const ativos = (snapshot.agents ?? []).filter((a) => a.status !== 'offline');
  const porSala = new Map<string, AgentInfo[]>();
  for (const a of ativos) {
    const l = porSala.get(a.roomId) ?? [];
    l.push(a);
    porSala.set(a.roomId, l);
  }

  const grupos: GrupoSala[] = [];
  for (const sala of salas) {
    const agentesDaSala = porSala.get(sala.id);
    if (!agentesDaSala) continue; // sala vazia (só offline/done removidos ou nenhum agente): não aparece
    const porPai = new Map<string, AgentInfo[]>();
    const tops: AgentInfo[] = [];
    // Primeira passada: decide quem é topo (main, ou sub cujo pai não aparece na sala)
    // e quem sobe na aninhamento. Aninhamento de no máximo 1 nível: sub filha de sub vira topo.
    for (const a of agentesDaSala) {
      const paiVisivel = a.kind === 'sub' && !!a.parentId && (agentesDaSala.find((p) => p.id === a.parentId)?.kind === 'main');
      if (paiVisivel) {
        const l = porPai.get(a.parentId!) ?? [];
        l.push(a);
        porPai.set(a.parentId!, l);
      } else {
        tops.push(a);
      }
    }
    const filhosDe = (pai: AgentInfo): ItemAgente[] =>
      (porPai.get(pai.id) ?? [])
        .sort((x, y) => x.name.localeCompare(y.name))
        .map((f) => item(f, filhosDe));
    grupos.push({
      id: sala.id,
      nome: sala.name,
      path: sala.path,
      slot: sala.slot ?? 0,
      lancador: sala.launcher,
      // Ordenados por nome dentro do nível — a posição na sala é papel da cena, não da lista.
      agentes: [...tops].sort((x, y) => x.name.localeCompare(y.name)).map((a) => item(a, filhosDe)),
    });
  }
  return grupos;

  // Monta o item exibível; `filhosDe` resolve a aninhamento dos filhados do pai.
  function item(a: AgentInfo, filhosDe: (p: AgentInfo) => ItemAgente[]): ItemAgente {
    return {
      id: a.id,
      nome: a.name,
      papel: a.role,
      titulo: a.title,
      status: a.status,
      statusDesde: a.statusSince,
      provedor: a.provider,
      conta: a.account,
      contaRotulo: rotulos.get(a.account) ?? a.account,
      contaSigla: siglas.get(a.account),
      contaCor: cores.get(a.account),
      modelo: a.model,
      seed: a.seed,
      partes: a.parts,
      look: a.look,
      // Texto vazio não vira atividade: a linha omite em vez de mostrar um ícone sem frase.
      atividade: a.activity && a.activity.text ? { kind: a.activity.kind, texto: a.activity.text } : undefined,
      esperandoPor: a.waitingFor || undefined,
      shellRotulo: a.shells?.[0]?.label || undefined,
      filhados: filhosDe(a),
    };
  }
}

/** Um agente casou com a busca: nome, papel/título, projeto (sala) ou conta. */
function casa(a: ItemAgente, sala: string, termo: string): boolean {
  const alvo = `${a.nome} ${a.papel} ${a.titulo ?? ''} ${sala} ${a.conta} ${a.contaRotulo}`.toLowerCase();
  return alvo.includes(termo);
}

/**
 * Busca + filtro por conta sobre os grupos de `agruparPorSala`.
 * `conta` vazio = todas; `termo` vazio = sem busca. Termos não-casando tiram o agente
 * da lista; sala sem agente visível não aparece; filhados casam pelo próprio nome.
 */
export function buscar(grupos: GrupoSala[], termo: string, conta: string): GrupoSala[] {
  const t = termo.trim().toLowerCase();
  const porTermo = (a: ItemAgente, sala: string): boolean => (t ? casa(a, sala, t) : true);
  const porConta = (a: ItemAgente): boolean => (conta ? a.conta === conta : true);

  const resultado: GrupoSala[] = [];
  for (const g of grupos) {
    const agentes = g.agentes
      .map((a) => {
        const okPai = porTermo(a, g.nome) && porConta(a);
        const filhados = a.filhados.filter((f) => porTermo(f, g.nome) && porConta(f));
        // Pai não casa mas algum filhado casa → mostra o pai como contexto.
        return { ...a, filhados: okPai ? a.filhados : filhados } as ItemAgente;
      })
      .filter((a) => a.filhados.length || (porTermo(a, g.nome) && porConta(a)));
    if (agentes.length) resultado.push({ ...g, agentes });
  }
  return resultado;
}

// ---------------------------------------------------------------------------------------------
// Apresentação da lista (refino "atividade ao vivo"): o que cada linha e cada cabeçalho mostram.
// ---------------------------------------------------------------------------------------------

/**
 * Segunda linha de um agente na lista. A regra: trabalhando não ganha selo (o ponto pulsando
 * no rosto já diz isso) — a linha conta O QUE ele está fazendo. Selo só para exceção:
 * 'forte' = precisa de você; 'discreto' = ocioso/concluído. Sem dado → texto '' (a linha
 * omite; nunca inventa frase).
 */
export interface LinhaAtividade {
  selo: 'forte' | 'discreto' | null;
  /** Tipo de atividade que escolhe o ícone (icone-atividade.ts); null = sem ícone. */
  icone: ActivityKind | null;
  texto: string;
}

export function linhaDaAtividade(a: Pick<ItemAgente, 'status' | 'atividade' | 'esperandoPor' | 'shellRotulo'>): LinhaAtividade {
  const at = a.atividade;
  switch (a.status) {
    case 'waiting': {
      // O motivo da espera manda; sem ele, a pergunta (kind 'ask') ainda diz o que é.
      const texto = a.esperandoPor ?? (at?.kind === 'ask' ? at.texto : '');
      return { selo: 'forte', icone: texto ? 'ask' : null, texto };
    }
    case 'shell': {
      // Esperando um comando em segundo plano: o rótulo do shell é mais exato que a última atividade.
      const texto = a.shellRotulo ?? at?.texto ?? '';
      return { selo: null, icone: texto ? 'run' : null, texto };
    }
    case 'idle':
    case 'done':
    case 'offline': {
      // Parado: só o fechamento do turno ("Concluiu em 1 min") ainda é verdade; a última ação
      // em gerúndio ("Escrevendo a resposta") mentiria sobre o presente, então sai.
      // Um sinal por linha: com duração ("Concluiu em 1min 18s") a frase inteira basta e o selo
      // sai; "Concluiu" sozinho não diz nada além do estado — aí só o selo fica.
      if (at?.kind === 'done' && complementoDoConcluido(at.texto)) return { selo: null, icone: 'done', texto: at.texto };
      return { selo: 'discreto', icone: null, texto: '' };
    }
    default:
      return at ? { selo: null, icone: at.kind, texto: at.texto } : { selo: null, icone: null, texto: '' };
  }
}

/**
 * O que a frase de fim de turno diz ALÉM de "concluiu": "Concluiu em 1min 18s" → "em 1min 18s";
 * "Concluiu" sozinho → "". Cobre o texto em português e em inglês ("Finished in 2s" → "in 2s").
 */
export function complementoDoConcluido(texto: string): string {
  return texto.replace(/^\s*(concluiu|finished|done)\b[\s:·,.-]*/i, '').trim();
}

/** Prioridade visual dos estados: quem exige ação primeiro, quem está parado por último. */
const ORDEM_ESTADO: Record<AgentStatus, number> = { waiting: 0, working: 1, shell: 2, idle: 3, done: 4, offline: 5 };

/** Estados de todos os agentes do grupo (principais + subagentes), na ordem de prioridade — os pontos do cabeçalho. */
export function estadosDoGrupo(g: Pick<GrupoSala, 'agentes'>): AgentStatus[] {
  const todos = g.agentes.flatMap((a) => [a.status, ...a.filhados.map((f) => f.status)]);
  return todos.sort((x, y) => ORDEM_ESTADO[x] - ORDEM_ESTADO[y]);
}

/** Contagem por estado (para a dica/leitor de tela dos pontos), só com os estados presentes, na ordem de prioridade. */
export function contagemDeEstados(estados: AgentStatus[]): Array<[AgentStatus, number]> {
  const n = new Map<AgentStatus, number>();
  for (const e of estados) n.set(e, (n.get(e) ?? 0) + 1);
  return [...n.entries()].sort((x, y) => ORDEM_ESTADO[x[0]] - ORDEM_ESTADO[y[0]]);
}

/** Um agente que precisa de você, com a sala de contexto (o bloco do topo mostra o projeto no lugar do título). */
export interface Urgente {
  item: ItemAgente;
  salaId: string;
  salaNome: string;
  lancador?: string;
}

/**
 * Quem precisa de você (status 'waiting'), principal ou subagente, de todas as salas —
 * quem espera há mais tempo primeiro (statusDesde crescente; empate por nome).
 */
export function precisamDeVoce(grupos: GrupoSala[]): Urgente[] {
  const r: Urgente[] = [];
  for (const g of grupos) {
    for (const a of g.agentes) {
      for (const x of [a, ...a.filhados]) {
        if (x.status === 'waiting') r.push({ item: x, salaId: g.id, salaNome: g.nome, lancador: g.lancador });
      }
    }
  }
  return r.sort((x, y) => x.item.statusDesde - y.item.statusDesde || x.item.nome.localeCompare(y.item.nome));
}

/** Agentes (principais + subagentes) por conta — os números dos chips do filtro. */
export function contagemPorConta(grupos: GrupoSala[]): Map<string, number> {
  const n = new Map<string, number>();
  for (const g of grupos) {
    for (const a of g.agentes) {
      for (const x of [a, ...a.filhados]) n.set(x.conta, (n.get(x.conta) ?? 0) + 1);
    }
  }
  return n;
}

/**
 * Ponto de cor da conta só na exceção: quando o mesmo provedor tem mais de uma conta, a conta
 * DOMINANTE dele (a com mais agentes na lista) fica sem marca — é o caso comum — e as outras
 * ganham um ponto na cor delas. Empate no topo → nenhuma é dominante e todas mostram.
 * Devolve conta → cor hex (ausente = sem ponto). Cor que não é hex é descartada: ela vai para
 * uma propriedade CSS e não pode carregar outra coisa.
 */
export function coresDeExcecao(
  contas: Pick<AccountInfo, 'id' | 'provider' | 'color'>[] | undefined,
  agentesPorConta: Map<string, number>,
): Map<string, string> {
  // Contas por provedor.
  const porProvedor = new Map<string, Pick<AccountInfo, 'id' | 'provider' | 'color'>[]>();
  for (const c of contas ?? []) {
    const p = c.provider ?? 'claude';
    porProvedor.set(p, [...(porProvedor.get(p) ?? []), c]);
  }
  const r = new Map<string, string>();
  for (const lista of porProvedor.values()) {
    if (lista.length < 2) continue; // uma conta só no provedor: o logo basta
    const n = (c: { id: string }) => agentesPorConta.get(c.id) ?? 0;
    const max = Math.max(...lista.map(n));
    const noTopo = lista.filter((c) => n(c) === max);
    const dominante = noTopo.length === 1 ? noTopo[0].id : null;
    for (const c of lista) {
      const cor = (c.color ?? '').trim();
      if (c.id !== dominante && /^#[0-9a-f]{3,8}$/i.test(cor)) r.set(c.id, cor);
    }
  }
  return r;
}
