// Testes da vida social (parte A): determinismo, entrada, guerra com histerese, trabalho e saída.
// Vitest + `agora` controlado (sem Date.now()/Math.random()).

import { describe, expect, it } from 'vitest';
import { CARENCIA_DONE_MS, CARENCIA_IDLE_MS, Vida, decideSaida, decideTrabalho, hashFNV1a } from './social';
import type { AlocacaoPessoa } from './agenda';
import { iniciarAgenda } from './agenda';
import type { PessoaId } from './tipos';
import { MIN, PERMANENCIA_APOS_CONCLUIR, ENTRADA_MAX } from './tipos';

const T0 = 1_000_000_000_000; // epoch de referência (ms)

// Fábrica de pessoa: sobrepõe o que o teste precisa.
function pessoa(p: Partial<PessoaId> & Pick<PessoaId, 'chave'>): PessoaId {
  return {
    nome: p.chave,
    nomeAutomatico: true,
    papel: 'iris',
    roomId: 'repo-a',
    provider: 'claude',
    sessionId: 'chat-1',
    agenteIds: [],
    contagem: 1,
    estado: 'working',
    entrouEm: T0,
    semente: 42,
    ...p,
  };
}

describe('vida social: determinismo', () => {
  it('mesma semente e `agora` → saída idêntica, em duas instâncias e re-passo', () => {
    const pessoas = [pessoa({ chave: 'a' }), pessoa({ chave: 'b', sessionId: 'chat-2' })];

    const vidaA = new Vida(1234);
    const vidaB = new Vida(1234);
    const rA = vidaA.passo(pessoas, T0);
    const rB = vidaB.passo(pessoas, T0);
    for (const chave of ['a', 'b']) {
      expect(rA.get(chave)).toEqual(rB.get(chave));
    }

    // Rodar o mesmo passo de novo na mesma instância não muda a saída (idempotente em estado estável).
    const rA2 = vidaA.passo(pessoas, T0);
    for (const chave of ['a', 'b']) {
      expect(rA2.get(chave)).toEqual(rA.get(chave));
    }
  });

  it('o hash depende de (semente, chave, balde): outro balde, outra escolha', () => {
    const mesmo = hashFNV1a(42, 'a', 'mesa') === hashFNV1a(42, 'a', 'mesa');
    const baldeDif = hashFNV1a(42, 'a', 'mesa') !== hashFNV1a(42, 'a', 'entrada');
    expect(mesmo).toBe(true);
    expect(baldeDif).toBe(true);
    expect(hashFNV1a(42, 'a', 'x') < 2 ** 32).toBe(true); // 32 bits unsigned
  });
});

describe('vida social: entrada (regra 1)', () => {
  it('começa na rua e chega ao andar em até 8 s; depois vai à mesa se working', () => {
    const vida = new Vida(7);
    const p = [pessoa({ chave: 'a', entrouEm: T0 })];

    // No instante da chegada: fase rua.
    const naRua = vida.passo(p, T0).get('a')!;
    expect(naRua.destino).toBe('entrada');
    expect(naRua.fase).toBe('rua');

    // Com ENTRADA_MAX exatos, qualquer que seja o hash, já está no andar.
    const noAndar = vida.passo(p, T0 + ENTRADA_MAX).get('a')!;
    expect(noAndar.destino).not.toBe('entrada');
    expect(noAndar.destino).toBe('mesa'); // working → mesa (guerra desligada: só 1)
  });

  it('a transição rua → andar pode ocorrer antes de 8 s (hash menor)', () => {
    const vida = new Vida(99);
    const p = [pessoa({ chave: 'z', entrouEm: T0 })];
    const atraso = hashFNV1a(99, 'z', 'entrada') % 8_000;
    expect(vida.passo(p, T0 + atraso).get('z')!.destino).toBe('mesa');
    expect(vida.passo(p, T0).get('z')!.fase).toBe('rua');
  });
});

describe('vida social: sala de guerra (regra 3)', () => {
  function turma(n: number, sessao?: Partial<PessoaId>): PessoaId[] {
    const base = { roomId: 'repo-a', sessionId: 'chat-1', semente: 11 };
    return Array.from({ length: n }, (_, i) =>
      pessoa({ chave: `g${i}`, estado: 'working', ...base, ...sessao }),
    );
  }

  it('3 working na mesma sessão → slots 0..2 de guerra; 2 nunca acende → mesa', () => {
    const vida = new Vida(5);
    const r3 = vida.passo(turma(3), T0 + 30_000);
    expect(r3.get('g0')!.destino).toBe('guerra');
    expect(r3.get('g1')!.destino).toBe('guerra');
    expect(r3.get('g2')!.destino).toBe('guerra');
    expect([r3.get('g0')!.slot, r3.get('g1')!.slot, r3.get('g2')!.slot].sort()).toEqual([0, 1, 2]);

    // 2 working em sala que nunca acendeu (vida nova): mesa — a histerese só prolonga queda.
    const vida2 = new Vida(5);
    const r2 = vida2.passo(turma(2), T0 + 40_000);
    expect(r2.get('g0')!.destino).toBe('mesa');
    expect(r2.get('g1')!.destino).toBe('mesa');
  });

  it('histerese: com 2 working a guerra segue acesa por até 20 s e só então devolve à mesa', () => {
    const vida = new Vida(5);
    vida.passo(turma(3), T0 + 30_000); // acende
    const queda = vida.passo(turma(2), T0 + 35_000); // 2 working: queda observada em T0+35s
    expect(queda.get('g0')!.destino).toBe('guerra');

    // Ainda dentro da histerese (menos de 20 s da queda): segue na guerra.
    const dentro = vida.passo(turma(2), T0 + 54_000);
    expect(dentro.get('g0')!.destino).toBe('guerra');

    // Completados os 20 s da queda: mesa de volta.
    const fora = vida.passo(turma(2), T0 + 55_000);
    expect(fora.get('g0')!.destino).toBe('mesa');

    // 3 de novo → guerra acesa na hora (sem histerese na entrada).
    const religou = vida.passo(turma(3), T0 + 56_000);
    expect(religou.get('g0')!.destino).toBe('guerra');
  });

  it('teto: 13 pessoas working → 12 na guerra, 1 na mesa', () => {
    const vida = new Vida(3);
    const r = vida.passo(turma(13), T0 + 30_000);
    const naGuerra = [...r.values()].filter((i) => i.destino === 'guerra');
    const naMesa = [...r.values()].filter((i) => i.destino === 'mesa');
    expect(naGuerra).toHaveLength(12);
    expect(naMesa).toHaveLength(1);
    expect([...naGuerra.map((i) => i.slot)].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 12 }, (_, i) => i),
    );
  });

  it('a guerra é por sessão: 1 working por cada uma em 3 sessões não acende', () => {
    const vida = new Vida(5);
    const r = vida.passo(
      [
        pessoa({ chave: 's1', sessionId: 'c1' }),
        pessoa({ chave: 's2', sessionId: 'c2' }),
        pessoa({ chave: 's3', sessionId: 'c3' }),
      ],
      T0 + 30_000,
    );
    for (const chave of ['s1', 's2', 's3']) expect(r.get(chave)!.destino).toBe('mesa');
  });
});

describe('vida social: trabalho (regra 4)', () => {
  it('working sem guerra fica na mesa; o slot de mesa é estável entre passos', () => {
    const vida = new Vida(8);
    const p = [pessoa({ chave: 'a', entrouEm: T0 })];
    const a1 = vida.passo(p, T0 + 30_000).get('a')!;
    const a2 = vida.passo(p, T0 + 60_000).get('a')!;
    expect(a1.destino).toBe('mesa');
    expect(a1.slot).toBe(a2.slot); // mesma escolha do hash
  });
});

describe('vida social: saída (regra 8)', () => {
  it('concluída → agenda ociosa durante a janela de 30 min; some aos 30 min exatos', () => {
    const vida = new Vida(8);
    const p = [pessoa({ chave: 'a', estado: 'done', concluidoEm: T0 + 5 * MIN })];

    // Dentro da janela: a concluída circula na agenda ociosa (4.2), não na "saida".
    const dentro = vida.passo(p, T0 + 5 * MIN).get('a')!;
    expect(dentro.destino).not.toBe('saida');

    // 29 min após a conclusão: ainda no prédio, ainda na agenda.
    expect(vida.passo(p, T0 + 5 * MIN + 29 * MIN).get('a')!.destino).not.toBe('saida');

    // Aos exatos 30 min a identidade a remove do snapshot: `passo` não a mais conhece.
    const vazio = vida.passo([], T0 + 5 * MIN + PERMANENCIA_APOS_CONCLUIR);
    expect(vazio.has('a')).toBe(false);
  });

  it('decideSaida posiciona a saída em T+30 a partir do concluído', () => {
    const i = decideSaida(pessoa({ chave: 'a', estado: 'done', concluidoEm: T0 + 5 * MIN }), T0 + 6 * MIN);
    expect(i.destino).toBe('saida');
    expect(i.ate - i.desde).toBe(PERMANENCIA_APOS_CONCLUIR);
  });

  it('quem some do snapshot é removido da memória da Vida (limpeza)', () => {
    const vida = new Vida(8);
    vida.passo([pessoa({ chave: 'a' }), pessoa({ chave: 'b' })], T0 + 30_000);
    const r = vida.passo([pessoa({ chave: 'a' })], T0 + 60_000);
    expect(r.has('a')).toBe(true);
    expect(r.has('b')).toBe(false);
  });
});

describe('vida social: ocosas (S7b — agenda ociosa e mesa)', () => {
  it('waiting/shell → mesa com o MESMO hash do trabalho (estável, não entra na guerra)', () => {
    const vida = new Vida(8);
    const p = [pessoa({ chave: 'w', estado: 'waiting' }), pessoa({ chave: 's', estado: 'shell' })];
    const r = vida.passo(p, T0 + 30_000);
    expect(r.get('w')!.destino).toBe('mesa');
    expect(r.get('w')!.slot).toBe(decideTrabalho(8, 'w'));
    expect(r.get('s')!.destino).toBe('mesa');
    expect(r.get('s')!.slot).toBe(decideTrabalho(8, 's'));
    // Estável entre passos: a mesa não muda.
    const r2 = vida.passo(p, T0 + 60_000);
    expect(r2.get('w')!.slot).toBe(r.get('w')!.slot);
    expect(r2.get('s')!.slot).toBe(r.get('s')!.slot);
  });

  it('idle → destino da agenda ociosa (não mais lounge slot 0)', () => {
    const vida = new Vida(8);
    const p = [pessoa({ chave: 'i', estado: 'idle' })];
    // Carência: recém-ocioso segue na mesa (ainda está em uso).
    const t = T0 + 30_000;
    const logo = vida.passo(p, t).get('i')!;
    expect(logo.destino).toBe('mesa');
    expect(logo.slot).toBe(decideTrabalho(8, 'i'));
    expect(vida.passo(p, t + CARENCIA_IDLE_MS - 1_000).get('i')!.destino).toBe('mesa');
    // Passada a carência: agenda ociosa.
    const r = vida.passo(p, t + CARENCIA_IDLE_MS + 1_000).get('i')!;
    expect(r.destino).not.toBe('mesa');
    expect(r.destino).not.toBe('guerra');
    expect(r.destino).not.toBe('entrada');
  });

  it('done circula depois da carência curta: na mesa só nos primeiros minutos da conclusão', () => {
    const vida = new Vida(8);
    const p = [pessoa({ chave: 'd', estado: 'done', concluidoEm: T0 + 5 * MIN })];
    expect(vida.passo(p, T0 + 5 * MIN + 30_000).get('d')!.destino).toBe('mesa');
    expect(vida.passo(p, T0 + 5 * MIN + CARENCIA_DONE_MS + 1_000).get('d')!.destino).not.toBe('mesa');
  });

  it('done → agenda durante a janela de 30 min (determinístico)', () => {
    const vida = new Vida(8);
    const p = [pessoa({ chave: 'd', estado: 'done', concluidoEm: T0 + 5 * MIN })];
    const r = vida.passo(p, T0 + 10 * MIN).get('d')!;
    expect(r.destino).not.toBe('saida');
    expect(r.slot).toBeGreaterThanOrEqual(0);
    // Repete-se na segunda instância com a mesma semente (determinismo).
    const vida2 = new Vida(8);
    const r2 = vida2.passo(p, T0 + 10 * MIN).get('d')!;
    expect(r2).toEqual(r);
  });

  it('volta a working → mesa (agenda zerada; idle de novo reabre a agenda)', () => {
    const vida = new Vida(8);
    const t = T0 + 30_000;
    vida.passo([pessoa({ chave: 'a', estado: 'idle' })], t);
    // Volta a trabalhar: mesa pelo hash de trabalho.
    const working = vida.passo([pessoa({ chave: 'a', estado: 'working' })], t + 1_000).get('a')!;
    expect(working.destino).toBe('mesa');
    expect(working.slot).toBe(decideTrabalho(8, 'a'));
    // Ficou idle de novo: agenda reaberta — `desde` zera no passo da transição.
    const idleDeNovo = vida.passo([pessoa({ chave: 'a', estado: 'idle' })], t + 2_000).get('a')!;
    expect(idleDeNovo.destino).toBe('mesa'); // carência recomeça
    expect(vida.passo([pessoa({ chave: 'a', estado: 'idle' })], t + 2_000 + CARENCIA_IDLE_MS + 1_000).get('a')!.desde).toBe(t + 2_000 + CARENCIA_IDLE_MS);
  });

  it('invariante: nunca 2 pessoas no mesmo (destino, lugar) — exceto par e excedente em pé', () => {
    // Lote de 40 pessoas ociosas no mesmo instante: checa a invariante 4.2.
    const vida = new Vida(2026);
    const lotes: PessoaId[] = Array.from({ length: 40 }, (_, i) =>
      pessoa({ chave: `p${String(i).padStart(2, '0')}`, estado: i % 4 === 0 ? 'done' : 'idle' }),
    );
    vida.passo(lotes, T0 + 30_000); // abre a carência
    const r = vida.passo(lotes, T0 + 30_000 + CARENCIA_IDLE_MS + 1_000);
    checaInvariante(
      Array.from(r.values()).map((i) => ({ chave: i.chave, destino: i.destino, lugar: i.slot, conversaCom: i.conversaCom })),
    );
  });

  it('determinístico: mesma semente → mesma sequência em duas instâncias paralelas', () => {
    const semente = 999;
    const vidaA = new Vida(semente);
    const vidaB = new Vida(semente);
    const base: PessoaId[] = Array.from({ length: 12 }, (_, i) =>
      pessoa({ chave: `q${i}`, estado: i % 3 === 0 ? 'working' : 'idle' }),
    );
    for (let m = 0; m < 3; m++) {
      const agora = T0 + 30_000 + m * 2 * MIN;
      const pA: PessoaId[] = base.map((p) => ({ ...p, estado: m === 2 && p.estado === 'idle' ? 'working' : p.estado }));
      const rA = vidaA.passo(pA, agora);
      const rB = vidaB.passo(pA, agora);
      for (const [chave, ia] of rA) expect(ia, `passo ${m}, ${chave}`).toEqual(rB.get(chave));
    }
  });
});

// Ping-pong: a mesa é UMA, com 2 lados — cabe um único par. Antes, `alocar(desejos, {})`
// dava 2 lugares (2 pares) e o 2º par caía em cima do 1º na cena (predio usa os lados).
describe('vida social: ping-pong comporta um par só', () => {
  it('4 pessoas querendo ping-pong → no máximo 1 par; o excedente recua sem duplicar ninguém', () => {
    const semente = 2026;
    // Chaves cujo 1º segmento da agenda é `pingpong` (busca determinística, função pura).
    const chaves: string[] = [];
    for (let i = 0; chaves.length < 4 && i < 5000; i++) {
      const chave = `pp${i}`;
      if (iniciarAgenda(semente, chave, T0 + 30_000 + CARENCIA_IDLE_MS, 0).destino === 'pingpong') chaves.push(chave);
    }
    expect(chaves).toHaveLength(4);
    const vida = new Vida(semente);
    const gente = chaves.map((chave) => pessoa({ chave, estado: 'idle' }));
    vida.passo(gente, T0 + 30_000); // abre a carência
    const r = vida.passo(gente, T0 + 30_000 + CARENCIA_IDLE_MS + 1_000);
    const noPingPong = [...r.values()].filter((i) => i.destino === 'pingpong');
    expect(noPingPong.length).toBeLessThanOrEqual(2);
    expect(new Set(noPingPong.map((i) => i.slot)).size).toBeLessThanOrEqual(1); // um lugar só (o par)
    expect(r.size).toBe(4); // cada pessoa tem exatamente uma intenção (ninguém some nem duplica)
    checaInvariante([...r.values()].map((i) => ({ chave: i.chave, destino: i.destino, lugar: i.slot, conversaCom: i.conversaCom })));
  });
});

// Invariante 4.2: nunca duas pessoas no mesmo (destino, lugar), exceto o par de
// conversa/ping-pong (2 no mesmo lugar) — o excedente em pé do lounge tem lugar único.
// `AlocacaoPessoa` serve: o shape ({chave, destino, lugar, conversaCom}) é o mesmo.
function checaInvariante(resultados: Array<Pick<AlocacaoPessoa, 'chave' | 'lugar' | 'conversaCom'> & { destino: string }>): void {
  const porPar = new Map<string, string[]>();
  for (const item of resultados) {
    const chavePar = `${item.destino}:${item.lugar}`;
    const lista = porPar.get(chavePar);
    if (lista) lista.push(item.chave);
    else porPar.set(chavePar, [item.chave]);
  }
  for (const [chavePar, chaves] of porPar) {
    if (chaves.length === 1) continue;
    const [destino] = chavePar.split(':');
    const excecao = destino === 'conversa' || destino === 'pingpong';
    expect(excecao, `sobreposição inesperada em ${chavePar}: ${chaves.join(', ')}`).toBe(true);
  }
}
