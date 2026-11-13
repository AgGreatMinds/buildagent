// Tipos mínimos da barra superior: só o que a barra usa; nada que
// interfira nos demais itens do painel (lista, feed, ajuda).
import type { AccountInfo, OfficeSnapshot } from '../../../shared/types';

/** Contadores agregados da barra, no snapshot atual. */
export interface Contagens {
  /** Salas de projeto abertas (= `rooms.length`). */
  salas: number;
  /** Agentes presentes no escritório (principais + subagentes, exceto `offline`). */
  agentes: number;
  /** Agentes processando um pedido agora (`status === 'working'`). */
  trabalhando: number;
  /** Agentes esperando a resposta do usuário (`status === 'waiting'`). */
  precisamDeVoce: number;
}

/**
 * O pedaço do snapshot que a barra consome (o mesmo que a lista; `accounts`
 * alimenta o painel de uso). `accounts` é opcional aqui — snapshots antigos /
 * de teste podem não trazê-lo; o painel de uso trata a ausência como vazio.
 */
export type SnapPainel = Pick<OfficeSnapshot, 'rooms' | 'agents'> & { accounts?: AccountInfo[] };

/** Painéis que os botões da barra abrem/fecham. */
export type PainelId = 'lista' | 'atividade' | 'ajuda' | 'uso' | 'meudia' | 'config' | 'historico' | 'replay';
