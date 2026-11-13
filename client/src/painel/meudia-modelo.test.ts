// Testes do modelo puro do diálogo "Meu dia" (meudia-modelo.ts): dia vazio,
// dia cheio (valores esperados), escalas das colunas por hora e ordenação das
// esperas. Sem DOM.
import { describe, expect, it } from 'vitest';
import {
  colunasPorHora,
  deveAtualizar,
  destaques,
  escalaBonita,
  ehDiaVazio,
  formatarTempoAgente,
  formatarTokens,
  linhasDeEspera,
  linhasPorProjeto,
  segmentosPorStatus,
  urlStats,
} from './meudia-modelo';
import { zeroCounts, zeroMs, type DayStats, type HourDayStats, type RoomDayStats, type StatusMs, type WaitDayStats } from '../../../shared/daystats';

const H = 3_600_000;

/** DayStats mínimo, pronto para preencher apenas o que cada teste precisa. */
function diaVazio(): DayStats {
  return {
    day: '2026-10-30',
    tz: 'America/Sao_Paulo',
    start: 0,
    end: 0,
    totals: { ms: zeroMs(), counts: zeroCounts(), sessions: 0, subagents: 0, waits: 0, longestWaitMs: 0, waitWallMs: 0 },
    rooms: [],
    accounts: [],
    hours: [],
    waits: [],
  };
}

/** Hora cheia do gráfico: 14h com 45 min trabalhando, 15h com 30 min esperando. */
function horasCheias(): HourDayStats[] {
  const h14 = zeroMs();
  h14.working = 45 * 60_000;
  const h15 = zeroMs();
  h15.waiting = 30 * 60_000;
  return [
    { t: 14 * H, hour: 14, ms: h14 },
    { t: 15 * H, hour: 15, ms: h15 },
  ];
}

/** Sala com o shape completo de RoomDayStats (só `ms` varia entre os casos). */
function sala(nome: string, ms?: StatusMs): RoomDayStats {
  return {
    id: nome,
    name: nome,
    ms: ms ?? zeroMs(),
    counts: zeroCounts(),
    sessions: 0,
    subagents: 0,
    waits: 0,
    longestWaitMs: 0,
  };
}

describe('formatarTempoAgente', () => {
  it('escreve segundos, minutos e horas (e passa de 24 h sem virar dias)', () => {
    expect(formatarTempoAgente(12_000)).toBe('12 s');
    expect(formatarTempoAgente(3 * 60_000)).toBe('3 min');
    expect(formatarTempoAgente(2 * H + 10 * 60_000)).toBe('2 h 10 min');
    expect(formatarTempoAgente(27 * H + 5 * 60_000)).toBe('27 h 5 min');
    expect(formatarTempoAgente(-5)).toBe('0 s');
  });
});

describe('formatarTokens', () => {
  it('compacta a partir de 1 k e 1 M', () => {
    expect(formatarTokens(850)).toBe('850');
    expect(formatarTokens(12_300)).toBe('12,3 k');
    expect(formatarTokens(1_200_000)).toBe('1,2 M');
  });
});

describe('urlStats', () => {
  it('pega o dia de hoje no fiso local, codificando o fuso', () => {
    expect(urlStats('America/Sao_Paulo')).toBe('/api/stats?tz=America%2FSao_Paulo');
  });
});

describe('destaques', () => {
  it('dia vazio: tudo zero e strings coerentes', () => {
    const d = destaques(diaVazio());
    expect(d.esperandoMs).toBe(0);
    expect(d.sessoes).toBe(0);
    expect(d.custoUSD).toBe(0);
    expect(ehDiaVazio(diaVazio())).toBe(true);
  });

  it('dia cheio: soma os números dos totals', () => {
    const s = diaVazio();
    s.totals = {
      ms: { waiting: 10 * 60_000, working: 2 * H, idle: 0, shell: 0 },
      counts: { ...zeroCounts(), prompts: 7, toolCalls: 84, tasksDone: 6, tokensIn: 400, tokensOut: 250, costUSD: 1.5 },
      sessions: 3,
      subagents: 2,
      waits: 5,
      longestWaitMs: 42 * 60_000,
      waitWallMs: 35 * 60_000,
    };
    const d = destaques(s);
    expect(d.esperandoMs).toBe(10 * 60_000);
    expect(d.trabalhandoMs).toBe(2 * H);
    expect(d.sessoes).toBe(3);
    expect(d.subagentes).toBe(2);
    expect(d.esperas).toBe(5);
    expect(d.maiorEsperaMs).toBe(42 * 60_000);
    expect(d.tempoRelogioEsperaMs).toBe(35 * 60_000);
    expect(d.pedidos).toBe(7);
    expect(d.ferramentas).toBe(84);
    expect(d.tarefasConcluidas).toBe(6);
    expect(d.tokensIn + d.tokensOut).toBe(650);
    expect(d.custoUSD).toBe(1.5);
  });
});

describe('escalaBonita', () => {
  it('sobe o topo ao múltiplo redondo acima (a régua da referência já usa 45 min)', () => {
    expect(escalaBonita(45 * 60_000).maxMs).toBe(45 * 60_000);
    expect(escalaBonita(46 * 60_000).maxMs).toBe(60 * 60_000);
    expect(escalaBonita(12 * 60_000).maxMs).toBe(15 * 60_000);
  });

  it('marca o topo em 2 a 4 partes iguais', () => {
    const e = escalaBonita(45 * 60_000);
    expect(e.marcasMs).toEqual([15 * 60_000, 30 * 60_000, 45 * 60_000]);
    const g = escalaBonita(2 * H + 30 * 60_000);
    expect(g.maxMs).toBe(3 * H);
    expect(g.marcasMs).toEqual([H, 2 * H, 3 * H]);
  });

  it('valor zero ganha a escala mínima de 5 min (a referência não tem marca de 1 min)', () => {
    expect(escalaBonita(0).maxMs).toBe(5 * 60_000);
    expect(escalaBonita(0).marcasMs).toEqual([5 * 60_000]);
  });
});

describe('colunasPorHora', () => {
  it('toda coluna usa a escala comum (a mais alta vira o topo)', () => {
    const { colunas, escala } = colunasPorHora(horasCheias(), 15 * H);
    expect(escala.maxMs).toBe(45 * 60_000);
    const fatias = segmentosPorStatus(colunas[0].ms, escala.maxMs);
    expect(fatias).toEqual([{ status: 'working', ms: 45 * 60_000, pct: 100 }]);
    const f15 = segmentosPorStatus(colunas[1].ms, escala.maxMs);
    expect(f15).toEqual([{ status: 'waiting', ms: 30 * 60_000, pct: (30 / 45) * 100 }]);
    expect(colunas[0].rotulo).toBe('14h–15h');
    expect(colunas[1].rotulo).toBe('15h–16h');
  });

  it('marca a hora em curso e a futura', () => {
    const { colunas } = colunasPorHora(horasCheias(), 15 * H + 5 * 60_000);
    expect(colunas[0].agora).toBe(false);
    expect(colunas[1].agora).toBe(true);
    expect(colunas[1].futuro).toBe(false);
  });

  it('fim do dia (agora = 24h): tudo já passou', () => {
    const { colunas } = colunasPorHora(horasCheias(), 24 * H);
    expect(colunas.map((c) => c.agora)).toEqual([false, false]);
    expect(colunas.map((c) => c.futuro)).toEqual([false, false]);
    expect(colunas.map((c) => c.rotuloEixo)).toEqual([false, true]); // 15h é múltiplo de 3; 14h, não
  });

  it('rótulo no eixo X a cada 3 horas', () => {
    const horas: HourDayStats[] = [12, 15, 18].map((h) => {
      const ms = zeroMs();
      ms.working = 5 * 60_000;
      return { t: h * H, hour: h, ms };
    });
    const { colunas } = colunasPorHora(horas);
    expect(colunas.map((c) => c.rotuloEixo)).toEqual([true, true, true]);
  });
});

describe('linhasPorProjeto', () => {
  it('filtra projeto sem tempo e escala a barra pelo maior total', () => {
    const vazio = sala('vazio');
    const a = sala('projeto-a', { waiting: 30 * 60_000, working: 90 * 60_000, idle: 0, shell: 0 });
    const b = sala('projeto-b', { waiting: 0, working: 30 * 60_000, idle: 0, shell: 0 });
    const { linhas, escalaMs } = linhasPorProjeto([vazio, a, b]);
    expect(escalaMs).toBe(2 * H);
    expect(linhas.map((l) => l.nome)).toEqual(['projeto-a', 'projeto-b']);
    expect(linhas[0].pct).toBe(100);
    expect(linhas[1].pct).toBe(25);
    expect(linhas[0].aguardandoMs).toBe(30 * 60_000);
  });

  it('todos vazios: escala zero e sem linhas', () => {
    const { linhas, escalaMs } = linhasPorProjeto([sala('x'), sala('y')]);
    expect(linhas).toEqual([]);
    expect(escalaMs).toBe(0);
  });
});

/** Espera mínima para os testes (o shape completo de WaitDayStats). */
function espera(agente: string, duracaoMs: number, inicio: number, extra?: Partial<WaitDayStats>): WaitDayStats {
  return {
    agentId: agente,
    agentName: `Agente ${agente}`,
    roomId: 'r',
    roomName: 'Meu projeto',
    account: 'claude',
    start: inicio,
    end: inicio + duracaoMs,
    ms: duracaoMs,
    ...extra,
  };
}

describe('linhasDeEspera', () => {

  it('ordena da mais longa e numera a posição', () => {
    const linhas = linhasDeEspera([espera('b', 10 * 60_000, 2), espera('a', 40 * 60_000, 1), espera('c', 40 * 60_000, 0)]);
    expect(linhas.map((l) => l.nomeAgente)).toEqual(['Agente c', 'Agente a', 'Agente b']);
    expect(linhas.map((l) => l.posicao)).toEqual([1, 2, 3]);
    expect(linhas[0].pct).toBe(100);
    expect(linhas[2].pct).toBe(25);
  });

  it('mesma duração: a que começou antes vem primeiro', () => {
    const linhas = linhasDeEspera([espera('x', 30 * 60_000, 10), espera('y', 30 * 60_000, 5)]);
    expect(linhas.map((l) => l.nomeAgente)).toEqual(['Agente y', 'Agente x']);
  });

  it('guarda motivo e espera em curso quando presentes', () => {
    const linhas = linhasDeEspera([espera('z', 5 * 60_000, 0, { reason: 'permissão de arquivo', ongoing: true })]);
    expect(linhas[0].motivo).toBe('permissão de arquivo');
    expect(linhas[0].emCurso).toBe(true);
  });

  it('lista vazia: sem linhas', () => {
    expect(linhasDeEspera([])).toEqual([]);
  });
});

describe('ehDiaVazio / deveAtualizar', () => {
  it('dia com espera mas sem tempo não é vazio', () => {
    const s = diaVazio();
    s.waits = [espera('w', 60_000, 0)];
    expect(ehDiaVazio(s)).toBe(false);
  });

  it('só atualiza aberto e no dia de hoje', () => {
    expect(deveAtualizar(true, '2026-10-30', '2026-10-30')).toBe(true);
    expect(deveAtualizar(false, '2026-10-30', '2026-10-30')).toBe(false);
    expect(deveAtualizar(true, '2026-10-29', '2026-10-30')).toBe(false);
  });
});
