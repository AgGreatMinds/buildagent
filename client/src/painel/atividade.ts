// Adaptado de marmottajr/habblaud@faa1a01 client/src/ui/feed.ts (MIT)
// Lógica pura do feed de atividade: deriva linhas de feed da diferença entre dois
// snapshots — mudanças de `status` e de `title`/atividade por agente. Sem DOM — o
// DOM fica em feed.ts. Fonte de verdade dos tipos: shared/types.ts.
import type { AgentInfo, AgentStatus, RoomInfo } from '../../../shared/types';
import { texto } from './texto';

/** Ícone de cada mudança de status (o de título é 📌, ver ICONE_TITULO). */
const ICONES_STATUS: Record<AgentStatus, string> = {
  working: '⚙️',
  waiting: '✋',
  shell: '⏳',
  idle: '☕',
  done: '✅',
  offline: '👋',
};
const ICONE_TITULO = '📌';

export interface LinhaFeed {
  /** Único dentro do feed (com contador seqüencial para nunca repetir). */
  id: string;
  agenteId: string;
  salaId?: string;
  salaNome: string;
  /** Nome real do agente — a máscara do modo conteúdo acontece no display (nomeDaLinha/textoDaLinha). */
  nome: string;
  sub: boolean;
  icone: string;
  /** Epoch ms do evento (mudança de status usa `statusSince`; título usa o snapshot). */
  hora: number;
  /** status = o agente trocou de estado; titulo = a atividade atual/título mudou. */
  tipo: 'status' | 'titulo';
  status?: AgentStatus;
  titulo?: string;
}

/** Rótulo de exibição: no modo conteúdo, nome do agente vira genérico (privacidade por padrão). */
export function nomeDaLinha(l: LinhaFeed, modoConteudo: boolean): string {
  if (!modoConteudo) return l.nome;
  return l.sub ? texto.generico.subagente : texto.generico.principal;
}

/** Rótulo de exibição: no modo conteúdo, o título (conteúdo da sessão) vira um rótulo genérico. */
export function textoDaLinha(l: LinhaFeed, modoConteudo: boolean): string {
  if (l.tipo === 'status' && l.status) return texto.status[l.status];
  if (modoConteudo) return texto.feed.tituloMascarado;
  return l.titulo ?? texto.feed.semTitulo;
}

/**
 * Estado entre snapshots do feed. Diferencial entre o que já se viu (`mem`) e o snapshot
 * atual gera as linhas novas. Regras:
 * - agente novo ou status diferente → linha 'status' (ícone + rótulo do status, hora = statusSince);
 * - título mudou → linha 'titulo' (📌 + texto curto, hora = momento do snapshot);
 * - agente que saiu do snapshot sem estar offline/done → linha de saída (👋 ausente);
 * - o histórico completo fica com teto de `limite` linhas (padrão 200).
 */
export class RastreadorAtividade {
  readonly limite: number;
  linhas: LinhaFeed[] = [];
  private mem = new Map<string, { status: AgentStatus; titulo?: string; nome: string; sub: boolean; salaId?: string; salaNome: string }>();
  private seq = 0; // id estável e único mesmo para eventos do mesmo agente no mesmo instante

  constructor(limite = 200) {
    this.limite = limite;
  }

  /** Diferencia o snapshot atual do último visto e devolve as linhas novas (o histórico é acumulado com o teto). */
  atualizar(agentes: AgentInfo[], salas: RoomInfo[], ts: number): LinhaFeed[] {
    const nova: LinhaFeed[] = [];
    const porSala = new Map(salas.map((s) => [s.id, s.name]));
    const presentes = new Set<string>();

    for (const a of agentes) {
      presentes.add(a.id);
      const salaNome = porSala.get(a.roomId) ?? '—';
      const anterior = this.mem.get(a.id);

      // Mudança de status (ou primeira vez que o agente é visto).
      if (!anterior || anterior.status !== a.status) {
        nova.push({
          id: `${a.id}:s:${a.statusSince}:${this.seq++}`,
          agenteId: a.id,
          salaId: a.roomId,
          salaNome,
          nome: a.name,
          sub: a.kind === 'sub',
          icone: ICONES_STATUS[a.status],
          hora: a.statusSince,
          tipo: 'status',
          status: a.status,
        });
      }

      // Mudança de título/atividade atual.
      const titulo = a.title;
      if (!anterior || (anterior.titulo ?? '') !== (titulo ?? '')) {
        nova.push({
          id: `${a.id}:t:${a.lastEventAt}:${this.seq++}`,
          agenteId: a.id,
          salaId: a.roomId,
          salaNome,
          nome: a.name,
          sub: a.kind === 'sub',
          icone: ICONE_TITULO,
          hora: ts,
          tipo: 'titulo',
          titulo,
        });
      }

      this.mem.set(a.id, { status: a.status, titulo, nome: a.name, sub: a.kind === 'sub', salaId: a.roomId, salaNome });
    }

    // Sumiu do snapshot sem estar offline/done (ex.: sala desmontada): linha de saída.
    for (const [id, m] of this.mem) {
      if (presentes.has(id) || m.status === 'offline' || m.status === 'done') continue;
      nova.push({
        id: `${id}:s:${ts}:${this.seq++}`,
        agenteId: id,
        salaId: m.salaId,
        salaNome: m.salaNome,
        nome: m.nome,
        sub: m.sub,
        icone: ICONES_STATUS.offline,
        hora: ts,
        tipo: 'status',
        status: 'offline',
      });
      this.mem.delete(id);
    }

    if (nova.length) {
      this.linhas.push(...nova);
      if (this.linhas.length > this.limite) this.linhas.splice(0, this.linhas.length - this.limite);
    }
    return nova;
  }
}
