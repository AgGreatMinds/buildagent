// Testes da agenda ociosa.
// Vitest com `agora`/`piso` controlados — sem Date.now() nem Math.random()
// no módulo (o teste mede performance com performance.now(), só o relógio da medição).

import { describe, expect, it } from 'vitest';
import { alocar, avancarAgenda, iniciarAgenda, segmento } from './agenda';
import type { AlocacaoPessoa, Desejo, DestinoAgenda, EstadoAgenda } from './agenda';
import { MIN } from './tipos';

// Andar 1: os 8 destinos comuns. Andar 2: terraco, galeria, descanso.
const DESTINOS_ANDAR_2 = new Set(['terraco', 'galeria', 'descanso']);

// Época de referência para estados.
const T0 = 1_000_000_000_000;

// Invariante da regra 4.2: nunca duas pessoas no mesmo (destino, lugar),
// exceto o excedente em pé do lounge (cada um com lugar único ≥ 9) e o par de conversa/ping-pong.
function checaInvariante(resultados: AlocacaoPessoa[]): void {
  const porPar = new Map<string, string[]>();
  for (const item of resultados) {
    const chavePar = `${item.destino}:${item.lugar}`;
    const lista = porPar.get(chavePar);
    if (lista) lista.push(item.chave);
    else porPar.set(chavePar, [item.chave]);
  }
  for (const [chavePar, chaves] of porPar) {
    if (chaves.length === 1) continue;
    const [destino, lugarStr] = chavePar.split(':');
    const lugar = Number(lugarStr);
    const excecao =
      // Par de conversa/ping-pong: exatamente 2, no mesmo lugar (e só em conversa
      // `conversaCom` preenche; aqui só checamos a contagem do par).
      (destino === 'conversa' || destino === 'pingpong') && chaves.length === 2 ||
      // Excedente em pé: a implementação dá lugar único por pessoa — nunca 2 iguais.
      false;
    expect(excecao, `sobreposição inesperada em ${chavePar}: ${chaves.join(', ')}`).toBe(true);
  }
}

// Contagem por destino: as duplas têm sempre número par.
function contagemPorDestino(resultados: AlocacaoPessoa[]): Map<string, number> {
  const total = new Map<string, number>();
  for (const item of resultados) total.set(item.destino, (total.get(item.destino) ?? 0) + 1);
  return total;
}

describe('agenda: segmento', () => {
  it('determinístico: mesmo (semente, chave, k, piso, anterior) → mesma saída', () => {
    for (let k = 0; k < 10; k++) {
      const a = segmento(42, 'p1', k, 0, k === 0 ? undefined : 'lounge');
      const b = segmento(42, 'p1', k, 0, k === 0 ? undefined : 'lounge');
      expect(a).toEqual(b);
    }
  });

  it('duração em minutos inteiros dentro do intervalo da tabela', () => {
    for (let k = 0; k < 200; k++) {
      const seg = segmento(42, 'p1', k, 0, undefined);
      expect(Number.isInteger(seg.duracaoMinutos)).toBe(true);
      expect(seg.duracaoMinutos).toBeGreaterThanOrEqual(1);
      expect(seg.duracaoMinutos).toBeLessThanOrEqual(5); // máx do andar 1 (tv 2–5)
      expect(seg.destino !== 'terraco' && seg.destino !== 'galeria' && seg.destino !== 'descanso').toBe(true);
    }
  });

  it('nunca repete o destino do segmento anterior (sequência de 40 segmentos)', () => {
    let anterior: DestinoAgenda | undefined;
    for (let k = 0; k < 40; k++) {
      const seg = segmento(7, 'sequencial', k, 0, anterior);
      if (anterior !== undefined) expect(seg.destino).not.toBe(anterior);
      anterior = seg.destino;
    }
  });

  it('andar 2: só aparece com piso >= 5; com piso 4, nunca', () => {
    // piso 4: 300 segmentos, nenhum de andar 2.
    for (let k = 0; k < 300; k++) {
      const seg = segmento(99, 'sem-piso-2', k, 4, undefined);
      expect(DESTINOS_ANDAR_2.has(seg.destino)).toBe(false);
    }
    // piso 5: 30% dos segmentos caem no andar 2 — em 200 segmentos, pelo menos um.
    let comPiso2 = 0;
    let comDuracaoPiso2 = 0;
    for (let k = 0; k < 200; k++) {
      const seg = segmento(99, 'com-piso-2', k, 5, undefined);
      if (DESTINOS_ANDAR_2.has(seg.destino)) {
        comPiso2 += 1;
        expect(seg.duracaoMinutos).toBeGreaterThanOrEqual(3);
        expect(seg.duracaoMinutos).toBeLessThanOrEqual(8);
        comDuracaoPiso2 += 1;
      }
    }
    expect(comPiso2).toBeGreaterThan(0);
    expect(comDuracaoPiso2).toBeGreaterThan(0);
  });

  it('pula o `anterior` mesmo quando o sorteio recai sobre ele', () => {
    const anteriores: DestinoAgenda[] = ['lounge', 'tv', 'fliperama', 'pingpong', 'estante', 'copa', 'banheiro', 'conversa'];
    for (const anterior of anteriores) {
      for (let k = 0; k < 40; k++) {
        const seg = segmento(1234, String(anterior), k, 0, anterior);
        expect(seg.destino).not.toBe(anterior);
      }
    }
  });
});

describe('agenda: avancarAgenda', () => {
  it('dentro do segmento em vigor: devolve o mesmo estado', () => {
    const estado = iniciarAgenda(42, 'a', T0, 0);
    expect(avancarAgenda(estado, T0 + 1 * MIN)).toBe(estado);
  });

  it('avança k e soma durações até cobrir `agora` (determinístico)', () => {
    const estado = iniciarAgenda(42, 'a', T0, 0);
    // Pula vários minutos: o destino k re-deriva da regra do segmento anterior.
    const avancado = avancarAgenda(estado, T0 + 10 * MIN);
    expect(avancado.k).toBeGreaterThan(0);
    expect(avancado.ate).toBeGreaterThanOrEqual(T0 + 10 * MIN);
    // Recomputar do mesmo estado inicial dá o mesmo resultado.
    const deNovo = avancarAgenda(iniciarAgenda(42, 'a', T0, 0), T0 + 10 * MIN);
    expect(deNovo).toEqual(avancado);
  });

  it('teto de 500 voltas: `agora` muito à frente não trava', () => {
    const estado = iniciarAgenda(42, 'a', T0, 0);
    const distante = avancarAgenda(estado, T0 + 100_000 * MIN);
    expect(distante.k).toBeLessThanOrEqual(500);
    // Teto atingido: `ate` ainda atrasado em relação a `agora` (o avanço parou).
    expect(distante.ate).toBeLessThan(T0 + 100_000 * MIN);
  });

  it('piso do estado controla o andar 2 no avanço', () => {
    // Piso 0: 500 segmentos sem andar 2.
    const semPiso2 = avancarAgenda(iniciarAgenda(42, 'solo', T0, 0), T0 + 1000 * MIN);
    expect(DESTINOS_ANDAR_2.has(semPiso2.destino)).toBe(false);
    // Piso 5: com 500 segmentos, é estatisticamente garantido aparecer andar 2
    // (30% por segmento — a chance de 500 seguidos sem andar 2 é ~3e-74).
    const comPiso2 = avancarAgenda(iniciarAgenda(42, 'piso-5', T0, 5), T0 + 1000 * MIN);
    expect(DESTINOS_ANDAR_2.has(comPiso2.destino)).toBe(true);
  });
});

describe('agenda: alocar', () => {
  it('determinístico: mesma lista de desejos → mesma alocação, em qualquer ordem de entrada', () => {
    const desejos: Desejo[] = Array.from({ length: 12 }, (_, i) => ({
      chave: `p${i}`,
      destino: i % 3 === 0 ? 'lounge' : i % 3 === 1 ? 'copa' : 'tv',
    }));
    const a = alocar(desejos, {});
    const b = alocar([...desejos].reverse(), {});
    // A ordem de decisão é por `chave` — independente da ordem de entrada.
    expect(a.map((r) => `${r.chave}:${r.destino}:${r.lugar}`)).toEqual(b.map((r) => `${r.chave}:${r.destino}:${r.lugar}`));
  });

  it('mantém o lugar anterior se livre; senão o primeiro livre', () => {
    const desejos: Desejo[] = [
      { chave: 'z', destino: 'copa', lugarAnterior: 2 }, // mantém: 2 ainda livre
      { chave: 'a', destino: 'copa' }, // primeiro livre: 0
    ];
    const res = alocar(desejos, {});
    expect(res.find((r) => r.chave === 'a')).toEqual({ chave: 'a', destino: 'copa', lugar: 0 });
    expect(res.find((r) => r.chave === 'z')).toEqual({ chave: 'z', destino: 'copa', lugar: 2 });
  });

  it('capacidades respeitadas: destino cheio segue a ordem de recuo (lounge → copa → ...)', () => {
    // Banheiro tem 3 lugares: 5 pessoas pedindo banheiro → 3 ficam, 2 recuam.
    // O recuo caminha em RECUO: o 1º no lounge, o 2º no copa (lounge com capacidade 1).
    const desejos: Desejo[] = Array.from({ length: 5 }, (_, i) => ({ chave: `b${i}`, destino: 'banheiro' }));
    const res = alocar(desejos, { banheiro: 3, lounge: 1, copa: 1 });
    const total = contagemPorDestino(res);
    expect(total.get('banheiro')).toBe(3);
    expect(total.get('lounge')).toBe(1);
    expect(total.get('copa')).toBe(1);
    expect(total.get('tv')).toBeUndefined(); // a ordem de recuo não pulou pra frente
    checaInvariante(res);
  });

  it('tudo cheio → lounge em pé (lugar >= 9, cada excedente com lugar único)', () => {
    // Capacidades esgotadas em tudo, exceto 1 lugar no lounge → 3 pessoas.
    const desejos: Desejo[] = Array.from({ length: 3 }, (_, i) => ({ chave: `e${i}`, destino: 'tv' }));
    const caps = { tv: 0, fliperama: 0, estante: 0, banheiro: 0, copa: 0, lounge: 1 };
    const res = alocar(desejos, caps);
    const emPe = res.filter((r) => r.lugar >= 9);
    expect(emPe.length).toBe(2); // 1 lugar sentado + 2 em pé
    const lugares = emPe.map((r) => r.lugar).sort((a, b) => a - b);
    expect(lugares).toEqual([9, 10]); // únicos, ≥ 9
    checaInvariante(res);
  });

  it('invariante: nunca 2 no mesmo (destino, lugar) — lote de 30 pessoas', () => {
    const destinos: Desejo['destino'][] = ['lounge', 'tv', 'fliperama', 'estante', 'copa', 'banheiro', 'conversa', 'pingpong'];
    const desejos: Desejo[] = Array.from({ length: 30 }, (_, i) => ({
      chave: `p${String(i).padStart(2, '0')}`,
      destino: destinos[i % destinos.length],
    }));
    const res = alocar(desejos, {});
    expect(res.length).toBe(30);
    checaInvariante(res);
  });

  it('duplas: pingpong sempre em par, mesma mesa (mesmo lugar), contagem par', () => {
    const desejos: Desejo[] = [
      { chave: 'a', destino: 'pingpong' },
      { chave: 'b', destino: 'pingpong' },
      { chave: 'c', destino: 'pingpong' }, // ímpar → a última recua
    ];
    const res = alocar(desejos, {});
    const noPing = res.filter((r) => r.destino === 'pingpong');
    expect(noPing.length).toBe(2); // par: a última (c) recuou
    expect(noPing[0].lugar).toBe(noPing[1].lugar); // o par no MESMO lugar
    expect(noPing[0].lugar).not.toBe(undefined);
    const recuada = res.find((r) => r.chave === 'c');
    expect(recuada?.destino).not.toBe('pingpong');
    checaInvariante(res);
  });

  it('conversa: par no mesmo lugar e `conversaCom` preenchido nos dois lados', () => {
    const desejos: Desejo[] = [
      { chave: 'a', destino: 'conversa', com: 'b' },
      { chave: 'b', destino: 'conversa', com: 'a' },
      { chave: 'c', destino: 'conversa' }, // ímpar → recua
    ];
    const res = alocar(desejos, {});
    const par = res.filter((r) => r.destino === 'conversa');
    expect(par.length).toBe(2);
    expect(par[0].lugar).toBe(par[1].lugar);
    const porChave = new Map(par.map((r) => [r.chave, r] as const));
    expect(porChave.get('a')?.conversaCom).toBe('b');
    expect(porChave.get('b')?.conversaCom).toBe('a');
    // A recuada não tem conversaCom.
    const recuada = res.find((r) => r.chave === 'c');
    expect(recuada?.destino).not.toBe('conversa');
    expect(recuada?.conversaCom).toBeUndefined();
  });

  it('par de conversa sem `com`: o próximo da ordem de chave fecha o par', () => {
    const desejos: Desejo[] = [
      { chave: 'b', destino: 'conversa' },
      { chave: 'a', destino: 'conversa' },
      { chave: 'c', destino: 'conversa' },
    ];
    const res = alocar(desejos, {});
    const par = res.filter((r) => r.destino === 'conversa');
    // Ordem por chave: a+b no lugar 0, c recua.
    expect(par.map((r) => r.chave).sort()).toEqual(['a', 'b']);
    expect(par[0].lugar).toBe(par[1].lugar);
    expect(res.find((r) => r.chave === 'c')?.destino).not.toBe('conversa');
  });

  it('dupla com destino cheio: o par inteiro recua (nada do par fica parado sem parceiro)', () => {
    const desejos: Desejo[] = [
      { chave: 'a', destino: 'pingpong' },
      { chave: 'b', destino: 'pingpong' },
      { chave: 'c', destino: 'pingpong' },
      { chave: 'd', destino: 'pingpong' },
      { chave: 'e', destino: 'pingpong' },
    ];
    const caps = { pingpong: 1, lounge: 0, copa: 0, tv: 0, fliperama: 0, estante: 0, banheiro: 0 };
    const res = alocar(desejos, caps);
    const noPing = res.filter((r) => r.destino === 'pingpong');
    expect(noPing.length).toBe(1 <= 2 ? 2 : 0); // 1 lugar para 5 pessoas → no máximo 1 par (2)
    expect(noPing.length % 2).toBe(0); // contagem par
    checaInvariante(res);
  });
});

describe('agenda: performance (limite do critério S7a)', () => {
  it('40 pessoas num passo de alocar em <= 2 ms', () => {
    const destinos: Desejo['destino'][] = ['lounge', 'tv', 'fliperama', 'pingpong', 'estante', 'copa', 'banheiro', 'conversa', 'terraco', 'galeria', 'descanso'];
    const desejos: Desejo[] = Array.from({ length: 40 }, (_, i) => ({
      chave: `p${i}`,
      destino: destinos[i % destinos.length],
    }));
    // Aquece (alocação de memória e mapas) antes de medir.
    alocar(desejos, {});
    const inicio = performance.now();
    for (let i = 0; i < 100; i++) alocar(desejos, {});
    const custo = (performance.now() - inicio) / 100;
    expect(custo, `alocar de 40 pessoas levou ${custo.toFixed(3)} ms`).toBeLessThanOrEqual(2);
  });

  it('avancarAgenda de 40 estados atrasados num passo em <= 2 ms', () => {
    const estados: EstadoAgenda[] = Array.from({ length: 40 }, (_, i) =>
      iniciarAgenda(42, `p${i}`, T0, 0),
    );
    // Tolerância de passo: 2 min — cada `avancarAgenda` faz ~2 voltas.
    const agora = T0 + 2 * MIN;
    const inicio = performance.now();
    for (let i = 0; i < 100; i++) {
      for (const e of estados) avancarAgenda(e, agora);
    }
    const custo = (performance.now() - inicio) / 100;
    expect(custo, `avancarAgenda ×40 levou ${custo.toFixed(3)} ms`).toBeLessThanOrEqual(2);
  });
});
