// Testes da lógica pura do painel "Contas · uso" (uso.ts): agrupamento por
// provedor, estado efetivo da conta e vista da janela de uso. Sem DOM.
import { describe, expect, it } from 'vitest';
import {
  agruparPorProvedor,
  estadoDaConta,
  nivelDoUso,
  resumoCompactoUso,
  vistaJanela,
  janelaMaisApertada,
  ordemDaFaixa,
  resumoPorConta,
  folgaFinalDaFaixa,
  temNumeros,
  CHAVE_USO_ABIERTO,
  JANELA_5H_MS,
  JANELA_SEMANA_MS,
} from './uso';
import type { AccountInfo, UsageWindow } from '../../../shared/types';

const AGORA = 1_700_000_000_000;

/** Conta mínima: id/nome/cor/pasta obrigatórios; `provider` é opcional de propósito. */
function conta(id: string, extra?: Partial<AccountInfo>): AccountInfo {
  return {
    id,
    short: id.slice(-1).toUpperCase(),
    name: `Conta ${id}`,
    color: '#4f8cff',
    configDir: id,
    sessions: 0,
    usageStatus: 'ok',
    ...extra,
  };
}

describe('agruparPorProvedor', () => {
  it('ordem fixa Claude → Codex → OpenCode, grupos vazios somem', () => {
    const grupos = agruparPorProvedor([
      conta('b', { provider: 'opencode' }),
      conta('c', { provider: 'codex' }),
      conta('a'),
      conta('d'),
    ]);
    expect(grupos.map((g) => g.provedor)).toEqual(['claude', 'codex', 'opencode']);
    expect(grupos[0].contas.map((c) => c.id)).toEqual(['a', 'd']);
    expect(grupos[1].contas.map((c) => c.id)).toEqual(['c']);
    expect(grupos[2].contas.map((c) => c.id)).toEqual(['b']);
  });

  it('provider ausente vira claude; lista vazia → sem grupos', () => {
    expect(agruparPorProvedor([conta('a')])[0]).toEqual({ provedor: 'claude', contas: [conta('a')] });
    expect(agruparPorProvedor([])).toEqual([]);
    expect(agruparPorProvedor(undefined)).toEqual([]);
  });
});

describe('estadoDaConta', () => {
  const janelas: UsageWindow[] = [{ utilization: 10, resetsAt: AGORA + 1_800_000 }];

  it('noQuota vem antes: leitura com noQuota é "sem cota" mesmo sem janelas', () => {
    expect(estadoDaConta(conta('a', { usage: { source: 'codex', fetchedAt: AGORA, noQuota: true } }))).toBe('sem-cota');
    // noQuota com janelas ainda é "sem cota"
    expect(
      estadoDaConta(conta('a', { usage: { source: 'codex', fetchedAt: AGORA, noQuota: true, fiveHour: janelas[0] } })),
    ).toBe('sem-cota');
  });

  it('leitura sem nenhuma das janelas = "sem dados" (mesmo status ok)', () => {
    expect(estadoDaConta(conta('a'))).toBe('sem-dados');
    expect(estadoDaConta(conta('a', { usage: { source: 'cache', fetchedAt: AGORA } }))).toBe('sem-dados');
  });

  it('janelas presentes: usoStatus ok → "dados", qualquer outro → "stale"', () => {
    expect(estadoDaConta(conta('a', { usage: { source: 'statusline', fetchedAt: AGORA, fiveHour: janelas[0] } }))).toBe('dados');
    const stale = conta('a', {
      usage: { source: 'cache', fetchedAt: AGORA - 3_600_000, sevenDay: janelas[0] },
      usageStatus: 'stale',
    });
    expect(estadoDaConta(stale)).toBe('stale');
    // 'unavailable'/'disabled' com janelas também é stale (regra do projeto de origem)
    expect(
      estadoDaConta(conta('a', { usage: { source: 'codex', fetchedAt: AGORA, fiveHour: janelas[0] }, usageStatus: 'unavailable' })),
    ).toBe('stale');
  });
});

describe('vistaJanela', () => {
  it('janela ausente → null', () => {
    expect(vistaJanela(undefined, AGORA, AGORA, JANELA_5H_MS)).toBeNull();
  });

  it('janela renovada por resetsAt no passado: pct null, nunca inventa número', () => {
    const v = vistaJanela({ utilization: 42, resetsAt: AGORA - 1_000 }, AGORA - 100_000, AGORA, JANELA_5H_MS);
    expect(v).toEqual({ pct: null, renovada: true, reset: '' });
  });

  it('janela renovada por idade (leitura mais velha que a janela, sem resetsAt)', () => {
    const v = vistaJanela({ utilization: 10 }, AGORA - (JANELA_5H_MS + 1), AGORA, JANELA_5H_MS);
    expect(v).toEqual({ pct: null, renovada: true, reset: '' });
  });

  it('janela normal: pct arredondado e limitado a 0–100', () => {
    const v = vistaJanela({ utilization: 33.4, resetsAt: AGORA + 2_700_000 }, AGORA - 1000, AGORA, JANELA_5H_MS);
    expect(v?.pct).toBe(33);
    expect(v?.renovada).toBe(false);
    expect(vistaJanela({ utilization: 130 }, AGORA, AGORA, JANELA_5H_MS)?.pct).toBe(100);
    expect(vistaJanela({ utilization: -5 }, AGORA, AGORA, JANELA_5H_MS)?.pct).toBe(0);
  });

  it('rótulo de reinício: < 1 h → "em X min", ≥ 1 h → "em X h Y min", dias → "em X d"', () => {
    expect(vistaJanela({ utilization: 1, resetsAt: AGORA + 1_800_000 }, AGORA, AGORA, JANELA_5H_MS)?.reset).toBe('em 30 min');
    expect(vistaJanela({ utilization: 1, resetsAt: AGORA + 5_400_000 }, AGORA, AGORA, JANELA_5H_MS)?.reset).toBe('em 1 h 30 min');
    expect(vistaJanela({ utilization: 1, resetsAt: AGORA + 10_800_000 }, AGORA, AGORA, JANELA_5H_MS)?.reset).toBe('em 3 h');
    const semana = vistaJanela({ utilization: 1, resetsAt: AGORA + 5 * 86_400_000 }, AGORA, AGORA, JANELA_SEMANA_MS);
    expect(semana?.reset).toBe('em 5 d');
  });

  it('sem resetsAt: reset vazio', () => {
    expect(vistaJanela({ utilization: 20 }, AGORA - 60_000, AGORA, JANELA_5H_MS)?.reset).toBe('');
  });
});

describe('nivelDoUso', () => {
  it('cobalto < 70, laranja 70–89, vermelho ≥ 90', () => {
    expect(nivelDoUso(0)).toBe('ok');
    expect(nivelDoUso(69)).toBe('ok');
    expect(nivelDoUso(70)).toBe('warn');
    expect(nivelDoUso(89)).toBe('warn');
    expect(nivelDoUso(90)).toBe('crit');
    expect(nivelDoUso(100)).toBe('crit');
  });
});

describe('resumoCompactoUso (linha recolhida da Frente A)', () => {
  const janela = (pct: number): UsageWindow => ({ utilization: pct, resetsAt: AGORA + 3_600_000 });

  it('conta com dados: "5h X% · sem Y%"', () => {
    const r = resumoCompactoUso(conta('a', { usage: { source: 'statusline', fetchedAt: AGORA, fiveHour: janela(32), sevenDay: janela(62) } }), AGORA);
    expect(r).toEqual({ janela5h: '5h 32%', semana: 'sem 62%', semLimite: false });
  });

  it('janela renovada: nunca inventa número → "—" no trecho', () => {
    const r = resumoCompactoUso(
      conta('a', { usage: { source: 'cache', fetchedAt: AGORA - JANELA_5H_MS - 1, fiveHour: { utilization: 90 } } }),
      AGORA,
    );
    expect(r).toEqual({ janela5h: '5h —', semana: 'sem —', semLimite: false });
  });

  it('Claude sem dados: "5h — · sem —", semLimite false', () => {
    expect(resumoCompactoUso(conta('a'), AGORA)).toEqual({ janela5h: '5h —', semana: 'sem —', semLimite: false });
    expect(resumoCompactoUso(conta('a', { usage: { source: 'codex', fetchedAt: AGORA, noQuota: true } }), AGORA)).toEqual({
      janela5h: '5h —',
      semana: 'sem —',
      semLimite: false,
    });
  });

  it('OpenCode sem dado: trecho vazio + semLimite ("sem limite de uso informado" na UI)', () => {
    const r = resumoCompactoUso(conta('b', { provider: 'opencode' }), AGORA);
    expect(r).toEqual({ janela5h: '', semana: '', semLimite: true });
    const rNoCota = resumoCompactoUso(conta('b', { provider: 'opencode', usage: { source: 'cache', fetchedAt: AGORA, noQuota: true } }), AGORA);
    expect(rNoCota).toEqual({ janela5h: '', semana: '', semLimite: true });
  });

  it('OpenCode com dados: números normais, semLimite false', () => {
    const r = resumoCompactoUso(conta('b', { provider: 'opencode', usage: { source: 'cache', fetchedAt: AGORA, fiveHour: janela(10), sevenDay: janela(20) } }), AGORA);
    expect(r).toEqual({ janela5h: '5h 10%', semana: 'sem 20%', semLimite: false });
  });

  it('chave de persistência existe (estado em localStorage, sem storage = aberta)', () => {
    expect(CHAVE_USO_ABIERTO).toBe('buildagent.usoAberto');
  });
});

describe('faixa refinada: ordem, janela mais apertada e resumo recolhido', () => {
  const j = (pct: number, emMin?: number): UsageWindow => ({ utilization: pct, resetsAt: emMin === undefined ? undefined : AGORA + emMin * 60_000 });
  const comUso = (id: string, extra: Partial<AccountInfo>, cinco?: UsageWindow, semana?: UsageWindow) =>
    conta(id, { usage: { source: 'statusline', fetchedAt: AGORA, fiveHour: cinco, sevenDay: semana }, ...extra });

  it('temNumeros: só dados/stale', () => {
    expect(temNumeros(comUso('a', {}, j(10)))).toBe(true);
    expect(temNumeros(conta('b'))).toBe(false);
    expect(temNumeros(conta('c', { usage: { source: 'codex', fetchedAt: AGORA, noQuota: true } }))).toBe(false);
  });

  it('ordemDaFaixa: mais apertado primeiro (crítico → atenção → ok), chips no fim, depois provedor e snapshot', () => {
    const r = ordemDaFaixa(
      [
        conta('pi', { provider: 'pi' }),
        conta('a'),
        comUso('cx', { provider: 'codex' }, j(5)),
        comUso('b', {}, j(5)),
        comUso('crit', { provider: 'codex' }, j(10, 60), j(94, 3000)),
        comUso('warn', {}, j(75, 60)),
      ],
      AGORA,
    );
    expect(r.map((c) => c.id)).toEqual(['crit', 'warn', 'b', 'cx', 'a', 'pi']);
    expect(ordemDaFaixa(undefined, AGORA)).toEqual([]);
  });

  it('janelaMaisApertada: maior %; empate fica com quem tem reinício; sem leitura → null', () => {
    expect(janelaMaisApertada(comUso('a', {}, j(30, 90), j(80, 3000)), AGORA)).toEqual({ qual: 'semana', pct: 80, reset: 'em 3 d' });
    expect(janelaMaisApertada(comUso('a', {}, j(50, 134), j(20, 3000)), AGORA)).toEqual({ qual: '5h', pct: 50, reset: 'em 2 h 14 min' });
    expect(janelaMaisApertada(comUso('a', {}, j(0), j(0, 600)), AGORA)?.qual).toBe('semana');
    expect(janelaMaisApertada(comUso('a', {}, j(0, 600), j(0, 3000)), AGORA)?.qual).toBe('5h');
    expect(janelaMaisApertada(conta('b'), AGORA)).toBeNull();
    // Janela renovada (reinício no passado) não conta.
    expect(janelaMaisApertada(comUso('a', {}, j(99, -5), j(10, 3000)), AGORA)).toEqual({ qual: 'semana', pct: 10, reset: 'em 3 d' });
  });

  it('resumoPorConta: uma pílula por conta com número, a janela mais apertada dela, da mais apertada à mais folgada', () => {
    const r = resumoPorConta(
      [
        comUso('a', { name: 'Claude' }, j(34, 60), j(58, 3000)),
        conta('c', { name: 'Sem' }),
        comUso('b', { name: 'Codex', provider: 'codex' }, undefined, j(94, 3000)),
      ],
      AGORA,
    );
    expect(r.map((p) => [p.conta, p.pct, p.qual, p.nivel])).toEqual([
      ['Codex', 94, 'semana', 'crit'],
      ['Claude', 58, 'semana', 'ok'],
    ]);
    expect(r[0].provedor).toBe('codex');
    expect(r[0].reset).toBe('em 3 d');
    // Empate mantém a ordem do snapshot; sem conta com número → lista vazia.
    expect(resumoPorConta([comUso('x', { name: 'X' }, j(10, 60)), comUso('y', { name: 'Y' }, j(10, 60))], AGORA).map((p) => p.conta)).toEqual(['X', 'Y']);
    expect(resumoPorConta([], AGORA)).toEqual([]);
  });
});

describe('folgaFinalDaFaixa (a rolagem termina com um cartão alinhado)', () => {
  // Fileira medida na tela a 1024 px: dois cartões de 379, dois chips, 6 px de vão, recuo de 20.
  const inicios = [0, 385, 770, 983];
  it('quando tudo cabe não acrescenta nada', () => {
    expect(folgaFinalDaFaixa(inicios, 1139, 1200, 20)).toBe(0);
    expect(folgaFinalDaFaixa([], 0, 500, 20)).toBe(0);
  });
  it('estica o fim até a próxima parada de cartão', () => {
    // Fim natural em 559 (cortava o 2º cartão ao meio); a próxima parada é o 3º cartão, em 750.
    expect(folgaFinalDaFaixa(inicios, 1139, 580, 20)).toBe(191);
    // Depois da folga, o fim da rolagem coincide com uma parada.
    const fim = 1139 + 191 - 580;
    expect(inicios.map((x) => Math.max(0, x - 20))).toContain(fim);
  });
  it('fim natural que já é uma parada fica como está', () => {
    expect(folgaFinalDaFaixa(inicios, 1139, 1139 - 365, 20)).toBe(0);
  });
});
