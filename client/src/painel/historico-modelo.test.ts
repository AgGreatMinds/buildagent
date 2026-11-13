// Testes do modelo puro do diálogo "Histórico" (historico-modelo.ts):
// parse da resposta de GET /api/history (ausente/lixo → []), busca sem acento
// com filtro por status, agrupamento por dia e formatação de duração. Sem DOM.
import { describe, expect, it } from 'vitest';
import {
  agruparPorDia,
  formatarData,
  formatarDuracao,
  filtrarSessoes,
  parseHistorico,
  type SessaoHistorica,
} from './historico-modelo';

// Dias ancorados no meio-dia local para o rótulo "Hoje" ser estável em qualquer fuso:
// `hoje` é agora; `ontem`/`anteontem` caminham a partir da meia-noite local de `hoje`.
const AGORA = Date.parse('2026-10-30T14:00:00Z');
const HOJE_INICIO = new Date(AGORA);
HOJE_INICIO.setHours(0, 0, 0, 0);
const base = HOJE_INICIO.getTime();
const hoje = base + 9 * 3_600_000 + 30 * 60_000; // 09:30 local
const ontem = base - 86_400_000 + 16 * 3_600_000; // 16:00 local de ontem
const anteontem = base - 2 * 86_400_000 + 10 * 3_600_000; // 10:00 local de anteontem

/** Sessão de teste com todos os campos do contrato mínimo. */
function sessao(p: Partial<SessaoHistorica> & Pick<SessaoHistorica, 'id' | 'data'>): SessaoHistorica {
  return {
    titulo: 'Refatorar fila',
    projeto: 'buildagent',
    duracaoMs: 3_600_000,
    statusFinal: 'concluída',
    provedor: 'claude',
    ...p,
  };
}

describe('parseHistorico', () => {
  it('aceita a forma { sessions: [...] } e rejeita ausência/lixo (rota s2 ainda não existe)', () => {
    expect(parseHistorico(undefined)).toEqual([]);
    expect(parseHistorico(null)).toEqual([]);
    expect(parseHistorico({})).toEqual([]);
    expect(parseHistorico({ sessions: 'x' })).toEqual([]);
    const raw = {
      sessions: [
        { sessionId: 'a', lastAt: hoje }, // mínimo obrigatório
        { title: 'Sem chave', lastAt: hoje }, // sem sessionId → ignorada
        { sessionId: 'b' }, // sem lastAt → ignorada
        'lixo',
        { sessionId: 'c', lastAt: ontem, provider: 'codex', project: 'web', duracaoMs: 60_000, statusFinal: 'encerrada' },
      ],
    };
    const out = parseHistorico(raw);
    expect(out.map((s) => s.id)).toEqual(['a', 'c']); // ordenado do mais recente
    expect(out[0].provedor).toBe('claude'); // ausente = claude
    expect(out[1].provedor).toBe('codex');
  });

  it('projeto cai do campo project para projectDir; duração cai na janela firstAt→lastAt', () => {
    const out = parseHistorico({
      sessions: [{ sessionId: 'x', lastAt: hoje, projectDir: 'projetos/web', firstAt: hoje - 120_000 }],
    });
    expect(out[0].projeto).toBe('projetos/web');
    expect(out[0].duracaoMs).toBe(120_000);
  });
});

describe('filtrarSessoes', () => {
  const lista: SessaoHistorica[] = [
    sessao({ id: '1', data: hoje, titulo: 'Relatório financeiro', projeto: 'finance', statusFinal: 'concluída' }),
    sessao({ id: '2', data: ontem, titulo: 'Fix lint', projeto: 'web', provedor: 'codex', statusFinal: 'encerrada' }),
    sessao({ id: '3', data: ontem, titulo: 'Fix tipos', projeto: 'web', statusFinal: 'encerrada' }),
  ];

  it('busca por título/projeto/provedor sem acento e sem caixa', () => {
    expect(filtrarSessoes(lista, 'relatorio', '').map((s) => s.id)).toEqual(['1']);
    expect(filtrarSessoes(lista, 'CODEx', '').map((s) => s.id)).toEqual(['2']); // o rótulo "Codex" entra na busca
    expect(filtrarSessoes(lista, 'web fix', '').map((s) => s.id)).toEqual(['2', '3']); // várias palavras = E
  });

  it('filtra por status final exato; vazio = todos', () => {
    expect(filtrarSessoes(lista, '', 'concluída').map((s) => s.id)).toEqual(['1']);
    expect(filtrarSessoes(lista, '', 'encerrada').map((s) => s.id)).toEqual(['2', '3']);
    expect(filtrarSessoes(lista, '', '')).toHaveLength(3);
  });
});

describe('agruparPorDia', () => {
  it('rotula Hoje/Ontem/dia e ordena do mais recente', () => {
    const dias = agruparPorDia([sessao({ id: '3', data: anteontem }), sessao({ id: '1', data: hoje }), sessao({ id: '2', data: ontem })], AGORA);
    expect(dias.map((d) => d.rotulo)).toEqual(['Hoje', 'Ontem', dias[2].rotulo]); // o 3º dia fica com o nome formatado
    expect(dias[0].sessoes.map((s) => s.id)).toEqual(['1']);
    expect(dias[1].sessoes.map((s) => s.id)).toEqual(['2']);
  });

  it('reúne duas sessões do mesmo dia num único grupo', () => {
    const dias = agruparPorDia([sessao({ id: '2', data: ontem }), sessao({ id: '4', data: ontem })], AGORA);
    expect(dias).toHaveLength(1);
    expect(dias[0].sessoes.map((s) => s.id)).toEqual(['2', '4']);
  });
});

describe('formatarDuracao / formatarData', () => {
  it('duração usa a régua de "Meu dia" e a data é local pt-BR', () => {
    expect(formatarDuracao(12_000)).toBe('12 s');
    expect(formatarDuracao(3 * 60_000)).toBe('3 min');
    expect(formatarDuracao(2 * 3_600_000 + 10 * 60_000)).toBe('2 h 10 min');
    expect(formatarData(hoje)).toMatch(/\d{2} de [a-z]{3}\., \d{2}:\d{2}/); // "30 de out., 09:30"
  });
});
