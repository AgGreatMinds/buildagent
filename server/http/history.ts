// Adaptado de marmottajr/habblaud@faa1a01 server/http/sessions.ts + server/http/stats.ts (MIT)
// Rotas do histórico de sessões (somente leitura):
//   GET /api/history          -> lista paginada (limit/offset) das sessões recentes
//   GET /api/history/:id     -> resumo da sessão (só o que a listagem já expõe:
//                               título, projeto, firstAt/lastAt, size, open)
// Adaptado: sem o parâmetro de terminal (não existe terminal neste servidor — o
// `resolve()` do projeto de origem foi cortado), sem trava de Host local (o hostAllowed global
// do server/index.ts já cobre), e o chamador fornece o `send` de JSON (o buildagent
// não tem um app.ts com sendJson). Sem GET nenhum escreve nada.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RecentSession } from '../../shared/types';
import { HISTORY_DAYS, HISTORY_LIMIT, isSessionId } from '../sources/history';
import type { SessionHistory } from '../sources/history';
import { tr } from '../../shared/i18n';

type Send = (res: ServerResponse, status: number, body: unknown) => void;

/** Erro de paginação (400) ou o par já validado. */
export type ParsedPaging = { limit: number; offset: number } | { error: string };

/** Um parâmetro aparece no máximo uma vez (o mesmo rigor do stats.ts). */
function single(url: URL, name: string): { value?: string; error?: string } {
  const all = url.searchParams.getAll(name);
  if (all.length > 1) return { error: tr('parâmetro "{0}" repetido', [name]) };
  if (!all.length) return {};
  return { value: all[0] };
}

/**
 * Lê e valida `limit`/`offset` de /api/history: inteiros não negativos, `limit` em
 * 1..`max` (padrão = `max`), `offset` em 0.. (padrão 0). Qualquer outra coisa → 400.
 */
export function parsePaging(url: URL, max: number): ParsedPaging {
  const l = single(url, 'limit');
  if (l.error) return { error: l.error };
  const o = single(url, 'offset');
  if (o.error) return { error: o.error };
  let limit = max;
  let offset = 0;
  if (l.value !== undefined) {
    if (!/^[1-9][0-9]*$/.test(l.value) || Number(l.value) > max) return { error: tr('limit inválido: inteiro de 1 a {0}', [max]) };
    limit = Number(l.value);
  }
  if (o.value !== undefined) {
    if (!/^(0|[1-9][0-9]*)$/.test(o.value)) return { error: tr('offset inválido: inteiro ≥ 0') };
    offset = Number(o.value);
  }
  return { limit, offset };
}

/**
 * Atende /api/history e /api/history/:id (chame com url já construída a partir de req).
 * Só o que a listagem já sabe: não lê o corpo da conversa, não tem terminal.
 */
export function handleHistoryRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  history: SessionHistory | undefined,
  max: number,
  send: Send,
): void {
  const method = req.method ?? 'GET';
  const path = url.pathname;
  const idMatch = /^\/api\/history\/([^/]+)$/.exec(path);
  const isList = path === '/api/history';
  if (!isList && !idMatch) {
    send(res, 404, { error: tr('rota desconhecida') });
    return;
  }
  if (method !== 'GET' && method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    send(res, 405, { error: tr('método não permitido') });
    return;
  }
  if (!history) {
    send(res, 404, { error: tr('histórico indisponível') });
    return;
  }

  if (isList) {
    const p = parsePaging(url, max);
    if ('error' in p) {
      send(res, 400, { error: p.error });
      return;
    }
    history
      .list()
      .then((sessions) => {
        const all = sessions.slice(p.offset, p.offset + p.limit);
        send(res, 200, { sessions: all, days: HISTORY_DAYS, limit: p.limit, offset: p.offset });
      })
      .catch((err) => {
        // index.ts tem try/catch global; aqui é um promise não-encadeada no handler:
        // responde 500 se o header ainda não saiu.
        if (!res.headersSent) send(res, 500, { error: tr('não foi possível listar as sessões') });
        else res.destroy();
        void err;
      });
    return;
  }

  // GET /api/history/:id — id fora do formato de UUID (o mesmo das sessões do Claude
  // Code) → 400, sem tocar no disco.
  const rawId = idMatch![1];
  let id: string;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    send(res, 400, { error: tr('id inválido') });
    return;
  }
  if (!isSessionId(id)) {
    send(res, 400, { error: tr('id de sessão inválido: use o UUID do transcript') });
    return;
  }
  history
    .list()
    .then((sessions) => {
      const found = sessions.find((s) => s.sessionId === id);
      // Fora da janela (dias) ou além do limite da listagem também é "não encontrada".
      if (!found) {
        send(res, 404, { error: tr('sessão não encontrada (fora da janela de {0} dias?)', [HISTORY_DAYS]) });
        return;
      }
      const s: RecentSession = found;
      // Só os campos que a listagem já expõe — nada novo do transcript.
      const body: Record<string, unknown> = { sessionId: s.sessionId, account: s.account, lastAt: s.lastAt, size: s.size, open: s.open };
      if (s.project) body.project = s.project;
      if (s.title) body.title = s.title;
      if (s.firstAt !== undefined) body.firstAt = s.firstAt;
      if (s.agentId) body.agentId = s.agentId;
      send(res, 200, body);
    })
    .catch(() => {
      if (!res.headersSent) send(res, 500, { error: tr('não foi possível listar as sessões') });
      else res.destroy();
    });
}
