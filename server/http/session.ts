// Adaptado de marmottajr/habblaud@faa1a01 server/http/sessions.ts (MIT)
// Detalhe de uma sessão (somente leitura):
//   GET /api/session/:id          -> resumo da sessão (últimas N ações, tokens, modelo,
//                                    contagem de ferramentas e subagentes — SEM conteúdo bruto)
// Adaptado: a `locate()` varre as contas (sem parâmetro de conta na URL), o hostAllowed global
// do server/index.ts é a guarda (sem trava local extra), e o chamador fornece o `send` de JSON
// (o buildagent não tem um app.ts com sendJson) — o mesmo molde de http/history.ts.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isSessionId } from '../sources/history';
import type { SessionHistory } from '../sources/history';
import type { DetailOptions, SessionDetail } from '../sources/session-detail';
import { tr } from '../../shared/i18n';

type Send = (res: ServerResponse, status: number, body: unknown) => void;

/** Leitor de detalhe (injetado: index.ts passa `readSessionDetail`; testes podem substituir). */
type SessionDetailReader = (path: string, opts?: DetailOptions) => Promise<{ detail: SessionDetail | undefined; error?: string }>;

/** `?limit=` inteiro 1–100 (padrão 50); repetido ou inválido → erro 400. */
export function parseLimit(url: URL): { limit: number } | { error: string } {
  const all = url.searchParams.getAll('limit');
  if (all.length > 1) return { error: tr('parâmetro "limit" repetido') };
  const v = all[0];
  if (v === undefined) return { limit: 50 };
  if (!/^[1-9][0-9]*$/.test(v) || Number(v) > 100) return { error: tr('limit inválido: inteiro de 1 a 100') };
  return { limit: Number(v) };
}

/**
 * Atende /api/session/:id (chame com url já construída a partir de req).
 * O leitor de detalhe (sessãoDetail) recebe o caminho da `locate()` e devolve o resumo.
 */
export function handleSessionRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  history: SessionHistory | undefined,
  detail: SessionDetailReader,
  send: Send,
): void {
  const method = req.method ?? 'GET';
  const idMatch = /^\/api\/session\/([^/]+)$/.exec(url.pathname);
  if (!idMatch) {
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
  let id: string;
  try {
    id = decodeURIComponent(idMatch[1]);
  } catch {
    send(res, 400, { error: tr('id inválido') });
    return;
  }
  // Id fora do formato de UUID (o mesmo das sessões do Claude Code) → 400, sem tocar no disco.
  if (!isSessionId(id)) {
    send(res, 400, { error: tr('id de sessão inválido: use o UUID do transcript') });
    return;
  }
  const p = parseLimit(url);
  if ('error' in p) {
    send(res, 400, { error: p.error });
    return;
  }

  const done = (status: number, body: unknown): void => {
    if (!res.headersSent) send(res, status, body);
    else res.destroy();
  };
  history
    .locate(id)
    .then((found) => {
      // Fora da janela da listagem (ou em conta desconhecida) = 404 documentado.
      if (!found) {
        done(404, { error: tr('sessão não encontrada (fora da janela de 7 dias?)') });
        return;
      }
      return detail(found.path, { limit: p.limit }).then((r) => {
        if (r.error || !r.detail) {
          done(404, { error: r.error ?? 'transcript ilegível' });
          return;
        }
        const d = r.detail;
        // `actions` já é a lista das últimas N (N = limit); `detail`/conteúdo bruto não existem aqui.
        const body: Record<string, unknown> = {
          sessionId: id,
          tokens: d.tokens,
          toolCalls: d.toolCalls,
          actions: d.actions,
          subagents: d.subagents,
        };
        if (d.model) body.model = d.model;
        if (d.truncated) body.truncated = true;
        done(200, body);
      });
    })
    .catch(() => {
      done(500, { error: tr('não foi possível ler a sessão') });
    });
}
