// Testes da Frente C: formatadores de Estatísticas e regras puras da Vida social
// (detalhe-estat.ts). Determinismo é a régua: mesma entrada → mesma saída, sempre.
import { describe, expect, it } from 'vitest';
import {
  dataHoraLocal,
  duracaoLegivel,
  encurtarSessao,
  extratoVidaSocial,
  formatarInt,
  formatarTokensCompacto,
  indexDoBorde,
  moedasPorWorking,
  ordenarRivais,
  tempoWorkingSessao,
  tracosDoAgente,
  type TracaoId,
} from './detalhe-estat';
import type { Activity, AgentInfo } from '../../../shared/types';

// Atividade mínima para os testes da Vida social (só os campos que as regras leem).
function at(kind: Activity['kind'], at: number, extra: Partial<Activity> = {}): Activity {
  return { id: `${kind}-${at}`, kind, icon: '·', text: kind, at, ...extra };
}

function ag(base: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'ac:1',
    kind: 'main',
    roomId: 'r1',
    name: 'Otávio',
    look: 'm',
    role: 'Agente principal',
    sessionId: '8f3a2c1b-9d4e-4f6a-8c2e-1a0b9d3e5f7a',
    account: '.claude',
    status: 'idle',
    recent: [],
    tasks: [],
    stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
    startedAt: 1_700_000_000_000,
    lastEventAt: 1_700_000_000_000,
    statusSince: 1_700_000_000_000,
    seed: 42,
    ...base,
  };
}

describe('formatadores de Estatísticas', () => {
  it('inteiros com separador pt-BR e negativas estouram em 0', () => {
    expect(formatarInt(12345)).toBe('12.345');
    expect(formatarInt(0)).toBe('0');
    expect(formatarInt(-5)).toBe('0');
  });

  it('tokens compactos (a régua do plano: 2_200_000 → "2,2 M")', () => {
    expect(formatarTokensCompacto(850)).toBe('850');
    expect(formatarTokensCompacto(1_240_000)).toBe('1,2 M');
    expect(formatarTokensCompacto(2_200_000)).toBe('2,2 M');
    expect(formatarTokensCompacto(1_500)).toBe('1,5 k');
  });

  it('sessão longa vira 8 dígitos + elipse; curta fica inteira', () => {
    expect(encurtarSessao('8f3a2c1b-9d4e-4f6a-8c2e-1a0b9d3e5f7a')).toBe('8f3a2c1b…');
    expect(encurtarSessao('abc')).toBe('abc');
  });

  it('data local no formato "30 de out., 09:10"', () => {
    // 30 de outubro de 2026, 09:10, em PT-BR (fuso do teste — a régua compara o padrão, não o fuso).
    const ts = new Date(2026, 9, 30, 9, 10).getTime();
    expect(dataHoraLocal(ts)).toMatch(/^\d{2} de out\., \d{2}:\d{2}$/);
    expect(dataHoraLocal(ts)).toContain('30 de out.');
  });

  it('duração: segundos, minutos e horas', () => {
    expect(duracaoLegivel(12_000)).toBe('12 s');
    expect(duracaoLegivel(3 * 60_000 + 59_999)).toBe('3 min');
    expect(duracaoLegivel(2 * 3_600_000 + 10 * 60_000)).toBe('2 h 10 min');
    expect(duracaoLegivel(4 * 3_600_000)).toBe('4 h');
    expect(duracaoLegivel(Number.NaN)).toBe('0 s');
  });
});

describe('Vida social — moedas e tempo de working', () => {
  it('1 moeda por minuto de working; abaixo de 1 min, zero', () => {
    expect(moedasPorWorking(59_999)).toBe(0);
    expect(moedasPorWorking(60_000)).toBe(1);
    expect(moedasPorWorking(3 * 60_000 + 59_000)).toBe(3);
  });

  it('tempo de working da sessão: durações concluídas + trecho atual (só quando working)', () => {
    const a = ag({
      status: 'working',
      statusSince: 1_000_000_000_000,
      recent: [at('done', 0, { durationMs: 120_000 })],
    });
    // 2 min concluídos + trecho atual (agora - statusSince = 16 min 40 s).
    expect(tempoWorkingSessao(a, 1_000_001_000_000)).toBe(1_120_000);
    // Agente parado não acumula nada além do concluído.
    const b = { ...a, status: 'idle' as const };
    expect(tempoWorkingSessao(b, 1_000_002_000_000)).toBe(120_000);
  });
});

describe('Vida social — traços (regra pura e determinística)', () => {
  const base = { toolCalls: 40, duracaoMs: 10 * 60_000, atividades: [] as Activity[] }; // 4/min

  it('muitas chamadas → "mão na massa" entra nos traços', () => {
    expect(tracosDoAgente({ ...base, status: 'working' })).toContain('mao-na-massa');
  });

  it('muito working → "competição"', () => {
    const t = tracosDoAgente({ ...base, status: 'working' });
    expect(t).toContain('competicao');
    expect(t).toHaveLength(2);
  });

  it('muito ocioso → "sonecas" (e o rival competitivo some)', () => {
    const t = tracosDoAgente({ ...base, toolCalls: 0, status: 'idle' });
    expect(t).toContain('sonecas');
    expect(t).not.toContain('competicao');
  });

  it('pensar/planejar → "foco"', () => {
    const t = tracosDoAgente({ ...base, toolCalls: 0, status: 'idle', atividades: [at('think', 0)] });
    expect(t).toContain('foco');
  });

  it('mesma entrada → mesmos traços (estável entre recarregamentos)', () => {
    const input = { ...base, status: 'working' as const, atividades: [at('plan', 0)] };
    expect(tracosDoAgente(input)).toEqual(tracosDoAgente(input));
    expect(new Set(tracosDoAgente(input) as TracaoId[]).size).toBeLessThanOrEqual(2);
  });
});

describe('Vida social — bordão e rivais por hash', () => {
  it('mesma seed → mesmo bordão; total ≤ 0 é piso 0', () => {
    expect(indexDoBorde(123, 8)).toBe(indexDoBorde(123, 8));
    expect(indexDoBorde(123, 0)).toBe(0);
    expect(indexDoBorde(123, 8)).toBeGreaterThanOrEqual(0);
    expect(indexDoBorde(123, 8)).toBeLessThan(8);
  });

  it('ordem de rivais é estável por seed + id do colega', () => {
    const colegas = [{ id: 'ac:2' }, { id: 'ac:3' }, { id: 'ac:4' }];
    const a = ordenarRivais(7, colegas);
    const b = ordenarRivais(7, colegas);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3); // a função ordena; o teto (2) é cortado em detalhe.ts
    expect(new Set(a).size).toBe(3);
  });

  it('a ordem não depende da ordem de entrada (é hash da seed + id do colega)', () => {
    const colegas = Array.from({ length: 6 }, (_, i) => ({ id: `ac:${i}` }));
    const rev = [...colegas].reverse();
    expect(ordenarRivais(7, rev)).toEqual(ordenarRivais(7, colegas));
  });
});

describe('Vida social — extrato com eventos reais', () => {
  it('chegada sempre no extrato; conclusões do recent entram também', () => {
    const a = ag({
      startedAt: 100,
      recent: [
        at('done', 200, { durationMs: 60_000 }),
        at('done', 400, { durationMs: 90_000 }),
      ],
    });
    const itens = extratoVidaSocial(a);
    expect(itens.map((i) => [i.tipo, i.at])).toEqual([
      ['concluiu', 400],
      ['concluiu', 200],
      ['chegou', 100],
    ]);
  });

  it('só chegada quando não há turnos concluídos; teto de 4 itens', () => {
    expect(extratoVidaSocial(ag({ startedAt: 5, recent: [] })).map((i) => i.tipo)).toEqual(['chegou']);
    const muitos = ag({
      startedAt: 1,
      recent: [1, 2, 3, 4, 5].map((n) => at('done', 10 * n, { durationMs: 60_000 })),
    });
    expect(extratoVidaSocial(muitos)).toHaveLength(4);
  });
});
