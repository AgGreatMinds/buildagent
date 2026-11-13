// Rotas de entregas locais (PRs/commits do git de cada sala): GET /api/deliveries.
// Padrão do createTimelineHandler: devolve true quando respondeu, false senão; sub-rotas → 404.
// Zero escrita, zero rede, zero token: cada sala contribui com `git log` somente leitura
// (server/deliveries/git.ts). Salas sem repositório devolvem arrays vazios + `warning`, nunca erro.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RoomInfo } from '../../shared/types';
import { tr } from '../../shared/i18n';
import { readRoomGit, type GitOptions, type RoomCommit } from './git';

/** O que a rota vê de cada sala: id, nome e caminho (o que o snapshot já expõe em /api/snapshot). */
export type RoomRef = Pick<RoomInfo, 'id' | 'name' | 'path'>;

export interface DeliveryEntry {
  roomId: string;
  room: string;
  commits: RoomCommit[];
  merges: RoomCommit[];
  /** Quando não há repositório git ou o git falhou (explicação curta). */
  warning?: string;
}

export interface DeliveriesRoutesOptions extends GitOptions {
  /** Salas atuais (leitura do snapshot no momento da requisição). */
  rooms: () => ReadonlyArray<RoomRef>;
}

/** Resposta JSON (o buildagent não tem um app.ts; contrato local do chamador). */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

/** Devolve um handler que trata /api/deliveries e responde false para o resto. */
export function createDeliveriesHandler(opts: DeliveriesRoutesOptions): (req: IncomingMessage, res: ServerResponse, url: URL) => boolean {
  return (req, res, url) => {
    const path = url.pathname;
    if (path !== '/api/deliveries') return false; // sub-rotas seguem para o 404 geral do index
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      res.setHeader('Allow', 'GET');
      sendJson(res, 405, { error: tr('método não permitido') });
      return true;
    }
    void (async () => {
      // Paralelo: cada `git log` tem timeout curto; um repositório lento não segura os demais.
      const entries: DeliveryEntry[] = await Promise.all(
        opts.rooms().map(async (r) => {
          const read = await readRoomGit(r.path, opts);
          const e: DeliveryEntry = { roomId: r.id, room: r.name, commits: read.commits, merges: read.merges };
          if (read.warning) e.warning = read.warning;
          return e;
        }),
      );
      sendJson(res, 200, { deliveries: entries });
    })().catch(() => {
      // readRoomGit não lança; esta rede é rede de fallback contra falha inesperada de rooms().
      sendJson(res, 200, { deliveries: [] });
    });
    return true;
  };
}
