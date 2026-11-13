// Testes de `programas.ts`.
// CtxMin falso grava [cor,x,y,w,h]; checam: periodicidade de 7000 ms de
// `lanceFutebol`, `gol` só a partir de 0,8, placar zerando a cada 4 lances,
// bordas #ffd84d no GOL, "KO" da luta no fim do round e limites/NaN nos 3
// desenhos (limites, 96×54, 32×24, 48×28; t 0, 12345, 1,8e12).

import { describe, expect, it } from 'vitest';
import type { CtxMin } from './desenho';
import { GOL_A_PARTIR, LANCE_MS, corrida, futebol, lanceFutebol, luta } from './programas';

// CtxMin de teste: grava cada fillRect num array pré-alocado (mesma receita
// de desenho.test.ts — sem alocação além de 1 entrada por retângulo).
type Retangulo = [string, number, number, number, number];

class CtxFalso implements CtxMin {
  fillStyle = '';
  linhas: Retangulo[] = [];
  private n = 0;
  fillRect(x: number, y: number, w: number, h: number): void {
    if (this.n >= this.linhas.length) this.linhas.push([this.fillStyle, x, y, w, h]);
    else this.linhas[this.n] = [this.fillStyle, x, y, w, h];
    this.n++;
  }
  get tam(): number { return this.n; }
}

// Desenha e devolve os retângulos do quadro (para inspeção de cores).
function quadro(fn: (ctx: CtxMin, t: number, seed: number, w: number, h: number) => void, t: number, seed: number, w: number, h: number): Retangulo[] {
  const ctx = new CtxFalso();
  fn(ctx, t, seed, w, h);
  return ctx.linhas.slice(0, ctx.tam);
}

describe('lanceFutebol — periodicidade de ' + LANCE_MS + ' ms', () => {
  it('lance sobe a cada ' + LANCE_MS + ' ms; progresso vai de 0 a 1 dentro do lance', () => {
    for (let k = 0; k < 3; k++) {
      const l = lanceFutebol(k * LANCE_MS, 7);
      expect(l.lance).toBe(k); // fronteira: lance k começa agora
      expect(l.progresso).toBe(0);
      const ultimo = lanceFutebol(k * LANCE_MS + LANCE_MS - 1, 7);
      expect(ultimo.lance).toBe(k); // mesma conta até o fim do lance
      expect(ultimo.progresso).toBeLessThan(1);
      expect(ultimo.progresso).toBeCloseTo(1, 2);
      expect(ultimo.direita).toBe(l.direita); // lado fixo no lance inteiro
      const prox = lanceFutebol((k + 1) * LANCE_MS, 7);
      expect(prox.lance).toBe(k + 1); // rolou
    }
  });
  it('determinístico, sem Math.random: mesma entrada → mesma saída', () => {
    const a = lanceFutebol(1234, 5);
    const b = lanceFutebol(1234, 5);
    expect(a.direita).toBe(b.direita);
    expect(a.lance).toBe(b.lance);
  });
});

describe('lanceFutebol — gol', () => {
  it('gol é falso antes de ' + GOL_A_PARTIR + ' e verdadeiro a partir dela', () => {
    expect(lanceFutebol(4000, 1).gol).toBe(false); // progresso 0,571
    expect(lanceFutebol(1000, 1).gol).toBe(false); // progresso 0,143
    expect(lanceFutebol(6500, 1).gol).toBe(true);  // progresso 0,928
    expect(lanceFutebol(0, 1).gol).toBe(false);
    expect(lanceFutebol(Math.floor(LANCE_MS * 0.8), 1).gol).toBe(true); // fronteira exata
  });
});

describe('futebol — placar zera a cada 4 lances', () => {
  // O placar soma só os gols do ciclo atual (lances 4·c .. 4·c+3). O lance
  // 4 reinicia o ciclo do 0 → os dígitos mudam quando a janela rola, mesmo
  // sem placar "acumulado". Confere pelo retângulo do dígito (col 4, 1 px)
  // num t no meio do lance, com sem fixas.
  function dígitoDe(seed: number, lance: number): string {
    const seq = quadro(futebol, lance * LANCE_MS + 1000, seed, 96, 54);
    // dígitos brancos na linha 1 a 5, col 4 a 13
    const d = seq.filter((r) => r[0] === '#ffffff' && r[2] >= 1 && r[2] <= 5 && r[1] >= 4 && r[1] < 14);
    expect(d.length).toBeGreaterThan(0);
    return d.map((r) => String(r[1]) + ',' + String(r[2])).join(' ');
  }
  it('o ciclo de 4 lances zera: os dígitos do lance 4 voltam aos do lance 0', () => {
    const p0 = dígitoDe(11, 0);
    const p4 = dígitoDe(11, 4);
    expect(p0).toBe(p4); // no lance 4 a janela reinicia — placar zerado
    // e o placar roda dentro do ciclo (não é estático entre lances jogados)
    const p1 = dígitoDe(11, 1);
    expect(p1).not.toBe(p0);
  });
});

describe('futebol — bordas do GOL', () => {
  it('no GOL há retângulos #ffd84d nas 4 bordas; fora do GOL, nenhum', () => {
    const noGol = quadro(futebol, 6500, 1, 96, 54); // progresso 0,93 → gol
    // borda de 1 px: r = [cor, x, y, larg, alt]; w/h = 96/54
    const bordas = noGol.filter((r) => r[0] === '#ffd84d');
    const topo = bordas.filter((r) => r[2] === 0 && r[4] === 1 && r[3] > 1);
    const base = bordas.filter((r) => r[2] === 53 && r[4] === 1 && r[3] > 1);
    const esq = bordas.filter((r) => r[1] === 0 && r[3] === 1 && r[4] > 1);
    const dir = bordas.filter((r) => r[1] === 95 && r[3] === 1 && r[4] > 1);
    expect(topo.length).toBeGreaterThan(0);
    expect(base.length).toBeGreaterThan(0);
    expect(esq.length).toBeGreaterThan(0);
    expect(dir.length).toBeGreaterThan(0);
    const fora = quadro(futebol, 2000, 1, 96, 54); // progresso 0,28 → sem gol
    expect(fora.some((r) => r[0] === '#ffd84d')).toBe(false);
  });
});

describe('luta — KO nos 18% finais do round', () => {
  it('mostra KO (tinta) no fim do round de 9000 ms, não antes', () => {
    const noFim = quadro(luta, 9000 * 2 + 9000 * 0.9, 1, 32, 24);
    const antes = quadro(luta, 9000 * 2 + 9000 * 0.5, 1, 32, 24);
    const tinta = (seq: Retangulo[]) => seq.filter((r) => r[0] === '#ffffff').length;
    expect(tinta(noFim)).toBeGreaterThan(tinta(antes));
  });
});

describe('futebol/corrida/luta — retângulos dentro de [0,w]×[0,h], sem NaN', () => {
  const CASOS: Array<[string, (ctx: CtxMin, t: number, seed: number, w: number, h: number) => void]> = [
    ['futebol', futebol],
    ['corrida', corrida],
    ['luta', luta],
  ];
  const TENS = [0, 12345, 1.8e12];
  const TAM = [[96, 54], [32, 24], [48, 28]];
  for (const [nome, fn] of CASOS) {
    for (const [w, h] of TAM) {
      for (const t of TENS) {
        it(nome + ' em ' + w + '×' + h + ' @ t=' + t + ': dentro de [0,w]×[0,h], sem NaN, ≤ 200 retângulos', () => {
          const seq = quadro(fn, t, 1, w, h);
          expect(seq.length).toBeLessThanOrEqual(200);
          for (const [cor, x, y, rw, rh] of seq) {
            expect(Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(rw) || Number.isNaN(rh)).toBe(false);
            expect(x).toBeGreaterThanOrEqual(0);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(x + rw).toBeLessThanOrEqual(w);
            expect(y + rh).toBeLessThanOrEqual(h);
          }
        });
      }
    }
  }
});
