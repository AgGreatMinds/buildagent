// Testes do orçamento de desempenho: histerese de nível e de zoom, pausa da aba, e a garantia de que
// 'cheio' sem zoom reproduz exatamente os valores de antes do módulo.
import { describe, expect, it } from 'vitest';
import { amostraDeQuadro, avaliar, estadoInicial, LIMITES, mediaMovel, NIVEIS, parametros, type EstadoOrcamento, type Entrada } from './orcamento';

const BOM = 16.7; // 60 fps
const RUIM = 40; // 25 fps
const LONGE = 30; // vista padrão de andar (sem zoom)

const e = (agora: number, msQuadro: number, distAlvo = LONGE, visivel = true): Entrada => ({ agora, msQuadro, distAlvo, visivel });
// Estado já fora do aquecimento, no nível pedido.
const em = (nivel: EstadoOrcamento['nivel'], desde = 0): EstadoOrcamento => ({ nivel, zoom: false, desde, pausado: false });

describe('estadoInicial', () => {
  it('começa cheio, sem zoom, e só decide depois do aquecimento', () => {
    const s = estadoInicial(1000);
    expect(s).toEqual({ nivel: 'cheio', zoom: false, desde: 1000 + LIMITES.aquecimento, pausado: false });
    // Mesmo com quadro ruim, nada muda durante o aquecimento + espera.
    expect(avaliar(s, e(1000 + LIMITES.aquecimento + LIMITES.esperaPiorar - 1, RUIM))).toBe(s);
    expect(avaliar(s, e(1000 + LIMITES.aquecimento + LIMITES.esperaPiorar, RUIM)).nivel).toBe('economico');
  });
  it('máquina com ≤ 2 núcleos começa no econômico; desconhecido ou 0 = cheio', () => {
    expect(estadoInicial(0, 2).nivel).toBe('economico');
    expect(estadoInicial(0, 1).nivel).toBe('economico');
    expect(estadoInicial(0, 8).nivel).toBe('cheio');
    expect(estadoInicial(0, undefined).nivel).toBe('cheio');
    expect(estadoInicial(0, 0).nivel).toBe('cheio');
  });
});

describe('avaliar: nível com histerese', () => {
  it('sem mudança devolve o mesmo objeto', () => {
    const s = em('cheio');
    expect(avaliar(s, e(60_000, BOM))).toBe(s);
  });
  it('desce um nível por vez e respeita o tempo mínimo no nível', () => {
    let s = em('cheio');
    s = avaliar(s, e(LIMITES.esperaPiorar, RUIM));
    expect(s.nivel).toBe('economico');
    expect(s.desde).toBe(LIMITES.esperaPiorar);
    // Logo em seguida, ainda ruim: espera de novo antes de descer outra vez.
    expect(avaliar(s, e(LIMITES.esperaPiorar + 100, RUIM))).toBe(s);
    s = avaliar(s, e(2 * LIMITES.esperaPiorar, RUIM));
    expect(s.nivel).toBe('minimo');
    // Não existe nível abaixo do mínimo.
    expect(avaliar(s, e(10 * LIMITES.esperaPiorar, RUIM))).toBe(s);
  });
  it('sobe só depois da espera longa (mais lenta que a de descer)', () => {
    const s = em('minimo', 0);
    expect(avaliar(s, e(LIMITES.esperaMelhorar - 1, BOM))).toBe(s);
    const sub = avaliar(s, e(LIMITES.esperaMelhorar, BOM));
    expect(sub.nivel).toBe('economico');
    expect(avaliar(em('cheio'), e(LIMITES.esperaMelhorar * 5, BOM)).nivel).toBe('cheio'); // não passa do cheio
  });
  it('faixa morta entre os limiares: nada muda (não oscila)', () => {
    const meio = (LIMITES.msPiorar + LIMITES.msMelhorar) / 2;
    for (const n of NIVEIS) {
      const s = em(n);
      expect(avaliar(s, e(10 * LIMITES.esperaMelhorar, meio))).toBe(s);
    }
  });
  it('sequência ruim → boa → ruim muda no máximo 1× por espera', () => {
    let s = em('cheio');
    const trocas: number[] = [];
    for (let t = 0; t <= 30_000; t += 100) {
      const ms = Math.floor(t / 1000) % 2 === 0 ? RUIM : BOM; // alterna a cada segundo
      const n = avaliar(s, e(t, ms));
      if (n.nivel !== s.nivel) trocas.push(t);
      s = n;
    }
    for (let k = 1; k < trocas.length; k++) expect(trocas[k] - trocas[k - 1]).toBeGreaterThanOrEqual(LIMITES.esperaPiorar);
  });
});

describe('avaliar: zoom com histerese', () => {
  it('entra abaixo de zoomEntra e só sai acima de zoomSai', () => {
    let s = em('cheio');
    s = avaliar(s, e(100, BOM, LIMITES.zoomEntra - 0.1));
    expect(s.zoom).toBe(true);
    // Entre os dois limiares continua em zoom.
    expect(avaliar(s, e(200, BOM, (LIMITES.zoomEntra + LIMITES.zoomSai) / 2))).toBe(s);
    s = avaliar(s, e(300, BOM, LIMITES.zoomSai + 0.1));
    expect(s.zoom).toBe(false);
    // Fora do zoom, a faixa do meio não liga.
    expect(avaliar(s, e(400, BOM, (LIMITES.zoomEntra + LIMITES.zoomSai) / 2))).toBe(s);
  });
  it('trocar de zoom não reinicia o tempo no nível', () => {
    const s = em('cheio', 500);
    expect(avaliar(s, e(900, BOM, 5)).desde).toBe(500);
  });
});

describe('avaliar: aba oculta', () => {
  it('oculta pausa e congela; ao voltar reinicia a espera no nível', () => {
    const s = em('economico', 0);
    const p = avaliar(s, e(50_000, RUIM, LONGE, false));
    expect(p).toEqual({ ...s, pausado: true });
    expect(avaliar(p, e(60_000, RUIM, 5, false))).toBe(p); // continua oculta: nada muda
    const v = avaliar(p, e(70_000, RUIM));
    expect(v).toEqual({ nivel: 'economico', zoom: false, desde: 70_000, pausado: false });
  });
});

describe('parametros', () => {
  it("'cheio' sem zoom = os valores de antes (pixelRatio 1,5, 8 telas, balão 40 m, passo 1 s, corte 0,25 s, sombra 1/3)", () => {
    const p = parametros('cheio', false, false);
    expect(p).toMatchObject({ pixelRatioMax: 1.5, telasTeto: 8, telasMult: 1, telasMultFora: 1, raioFoco: Infinity, balaoMax: 40, longe: Infinity, pessoaLongeCada: 1, passoMs: 1000, corteMs: 250, sombraCada: 3, cidadeAnima: true });
  });
  it('cada nível abaixo gasta menos ou igual em tudo', () => {
    const [a, b, c] = NIVEIS.map((n) => parametros(n, false, false));
    for (const [hi, lo] of [[a, b], [b, c]] as const) {
      expect(lo.pixelRatioMax).toBeLessThanOrEqual(hi.pixelRatioMax);
      expect(lo.telasTeto).toBeLessThanOrEqual(hi.telasTeto);
      expect(lo.telasMult).toBeGreaterThanOrEqual(hi.telasMult);
      expect(lo.balaoMax).toBeLessThanOrEqual(hi.balaoMax);
      expect(lo.longe).toBeLessThanOrEqual(hi.longe);
      expect(lo.pessoaForaCada).toBeGreaterThanOrEqual(hi.pessoaForaCada);
      expect(lo.pessoaLongeCada).toBeGreaterThanOrEqual(hi.pessoaLongeCada);
      expect(lo.passoMs).toBeGreaterThanOrEqual(hi.passoMs);
      expect(lo.corteMs).toBeGreaterThanOrEqual(hi.corteMs);
      expect(lo.sombraCada).toBeGreaterThanOrEqual(hi.sombraCada);
    }
  });
  it('zoom põe o resto em segundo plano sem mexer no que é do nível', () => {
    const sem = parametros('cheio', false, false);
    const com = parametros('cheio', true, false);
    expect(com.raioFoco).toBeLessThan(Infinity);
    expect(com.telasMultFora).toBeGreaterThan(1);
    expect(com.pessoaLongeCada).toBeGreaterThan(sem.pessoaLongeCada);
    expect(com.pixelRatioMax).toBe(sem.pixelRatioMax);
    expect(com.telasTeto).toBe(sem.telasTeto);
    // No mínimo, o zoom não afrouxa o que o nível já cortou.
    expect(parametros('minimo', true, false).pessoaLongeCada).toBe(parametros('minimo', false, false).pessoaLongeCada);
  });
  it('prefers-reduced-motion para os carros da cidade', () => {
    expect(parametros('cheio', false, true).cidadeAnima).toBe(false);
  });
});

describe('mediaMovel', () => {
  it('converge para a amostra e ignora amostra inválida', () => {
    let m = 16.7;
    for (let i = 0; i < 200; i++) m = mediaMovel(m, 40);
    expect(m).toBeCloseTo(40, 1);
    expect(mediaMovel(20, Number.NaN)).toBe(20);
    expect(mediaMovel(20, -5)).toBe(20);
    expect(mediaMovel(20, Infinity)).toBe(20);
  });
});

describe('amostraDeQuadro', () => {
  it('ritmo livre: vale o intervalo entre quadros (inclui a placa de vídeo)', () => {
    expect(amostraDeQuadro({ intervaloMs: 16.7, desenhoMs: 3, livre: true })).toBe(16.7);
    expect(amostraDeQuadro({ intervaloMs: 45, desenhoMs: 4, livre: true })).toBe(45); // máquina lenta de verdade
  });

  it('quadro com espera (30/s, 10/s) não conta como máquina lenta', () => {
    expect(amostraDeQuadro({ intervaloMs: 33.3, desenhoMs: 4, livre: false })).toBeUndefined();
    expect(amostraDeQuadro({ intervaloMs: 100, desenhoMs: 6, livre: false })).toBeUndefined();
  });

  it('desenho caro conta sempre, mesmo com espera', () => {
    expect(amostraDeQuadro({ intervaloMs: 100, desenhoMs: 48, livre: false })).toBe(48);
    expect(amostraDeQuadro({ intervaloMs: 100, desenhoMs: 900, livre: false })).toBe(250);
  });

  it('navegador segurando o laço (intervalo enorme, desenho barato) não derruba o nível', () => {
    expect(amostraDeQuadro({ intervaloMs: 1000, desenhoMs: 5, livre: true })).toBeUndefined();
    // 60 s de quadros a 30/s e depois 60 s com o laço seguro a 1/s: o nível continua cheio.
    let media = 1000 / 60;
    let estado = estadoInicial(0);
    for (let t = 0; t < 120_000; t += t < 60_000 ? 33 : 1000) {
      const a = amostraDeQuadro({ intervaloMs: t < 60_000 ? 33 : 1000, desenhoMs: 5, livre: t >= 60_000 });
      if (a !== undefined) media = mediaMovel(media, a);
      estado = avaliar(estado, { agora: t, msQuadro: media, distAlvo: 80, visivel: true });
    }
    expect(estado.nivel).toBe('cheio');
  });
});
