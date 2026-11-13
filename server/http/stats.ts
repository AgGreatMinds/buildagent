// Portado de marmottajr/habblaud@faa1a01 server/http/stats.ts (MIT)
// Adaptado: sem o parâmetro `source`/modo demo (cortado do buildagent); a mensagem de retenção
// não menciona a marca do projeto de origem. Contrato local: o chamador (server/index.ts) fornece o
// `send` de JSON — o buildagent não tem um app.ts com sendJson.
// Rotas do "Meu dia": GET /api/stats?day=AAAA-MM-DD&tz=<IANA> e GET /api/stats/days?tz=<IANA>.
// Só números agregados e nomes de projeto, conta e agente — a mesma exposição do /api/snapshot.
// Os parâmetros são validados com rigor (400).
import type { IncomingMessage, ServerResponse } from 'node:http';
import { addDays, canonicalTimeZone, parseDayKey, RETENTION_DAYS } from '../../shared/daystats';
import type { DayStatsService } from '../history/daystats';
import { tr } from '../../shared/i18n';

type Send = (res: ServerResponse, status: number, body: unknown) => void;

export type StatsQuery = { ok: true; day: string; tz: string } | { ok: false; status: number; error: string };

/** Um parâmetro aparece no máximo uma vez (o valor é validado por quem chama). */
function single(url: URL, name: string): { value?: string; error?: string } {
  const all = url.searchParams.getAll(name);
  if (all.length > 1) return { error: tr('parâmetro "{0}" repetido', [name]) };
  if (!all.length) return {};
  return { value: all[0] };
}

/** Lê e valida `tz` (padrão: o fuso do servidor). */
function parseTz(url: URL, fallback: string): { tz?: string; error?: string } {
  const p = single(url, 'tz');
  if (p.error) return { error: p.error };
  if (p.value === undefined) return { tz: fallback };
  const tz = canonicalTimeZone(p.value);
  if (!tz) return { error: tr('fuso inválido: use um nome IANA, ex.: America/Sao_Paulo') };
  return { tz };
}

/**
 * Valida a consulta de GET /api/stats. `today(tz)` dá o dia de hoje no fuso pedido. Erros: 400 (formato,
 * data que não existe, dia no futuro, parâmetro repetido, fuso inválido) e 404 (fora da retenção).
 */
export function parseStatsQuery(url: URL, defaultTz: string, today: (tz: string) => string): StatsQuery {
  const t = parseTz(url, defaultTz);
  if (!t.tz) return { ok: false, status: 400, error: t.error ?? tr('fuso inválido') };
  const d = single(url, 'day');
  if (d.error) return { ok: false, status: 400, error: d.error };
  const now = today(t.tz);
  const day = d.value ?? now;
  if (!parseDayKey(day)) return { ok: false, status: 400, error: tr('dia inválido: use AAAA-MM-DD (ex.: 2026-10-08)') };
  if (day > now) return { ok: false, status: 400, error: tr('dia no futuro') };
  if (day < addDays(now, -RETENTION_DAYS)) return { ok: false, status: 404, error: tr('são guardados só os últimos {0} dias', [RETENTION_DAYS]) };
  return { ok: true, day, tz: t.tz };
}

/** Atende /api/stats e /api/stats/days (chame com url já construída a partir de req). */
export function handleStatsRoute(req: IncomingMessage, res: ServerResponse, url: URL, stats: DayStatsService | undefined, send: Send): void {
  const method = req.method ?? 'GET';
  const path = url.pathname;
  if (path !== '/api/stats' && path !== '/api/stats/days') {
    send(res, 404, { error: tr('rota desconhecida') });
    return;
  }
  if (method !== 'GET' && method !== 'HEAD') {
    res.setHeader('Allow', 'GET');
    send(res, 405, { error: tr('método não permitido') });
    return;
  }
  if (!stats) {
    send(res, 404, { error: tr('estatísticas indisponíveis') });
    return;
  }
  if (path === '/api/stats/days') {
    const t = parseTz(url, stats.tz);
    if (!t.tz) send(res, 400, { error: t.error ?? tr('fuso inválido') });
    else send(res, 200, stats.days(t.tz));
    return;
  }
  const q = parseStatsQuery(url, stats.tz, (tz) => stats.today(tz));
  if (!q.ok) {
    send(res, q.status, { error: q.error });
    return;
  }
  const body = stats.day(q.day, q.tz);
  if (body) send(res, 200, body);
  else send(res, 404, { error: tr('sem estatísticas para este dia') });
}
