// Ritmo de redesenho: parado não desenha, vida à vista a 30, sem foco a 10, mexendo todo quadro.
import { describe, expect, it } from 'vitest';
import { decidir, intervaloDeDesenho, passosDeSimulacao, RITMO, type EntradaRitmo } from './ritmo';

const base: EntradaRitmo = { agora: 10_000, ultimoDesenho: 10_000, ultimaSimulacao: 10_000, foco: true, mexendo: false, vida: false };

/** Simula `ms` de chamadas do navegador a `hz` e conta o que foi feito. */
function rodar(e: Omit<EntradaRitmo, 'agora' | 'ultimoDesenho' | 'ultimaSimulacao'>, ms: number, hz = 60) {
  let ultimoDesenho = 0, ultimaSimulacao = 0, desenhos = 0, simulacoes = 0;
  for (let i = 1; i <= Math.round((ms * hz) / 1000); i++) {
    const agora = i * (1000 / hz);
    const passo = decidir({ ...e, agora, ultimoDesenho, ultimaSimulacao });
    if (passo === 'desenhar') { desenhos++; ultimoDesenho = ultimaSimulacao = agora; }
    else if (passo === 'simular') { simulacoes++; ultimaSimulacao = agora; }
  }
  return { desenhos, simulacoes };
}

describe('ritmo', () => {
  it('parado (nada vivo à vista, câmera quieta) não desenha nenhum quadro', () => {
    expect(intervaloDeDesenho({ foco: true, mexendo: false, vida: false })).toBe(Infinity);
    expect(intervaloDeDesenho({ foco: false, mexendo: false, vida: false })).toBe(Infinity);
    const r = rodar({ foco: true, mexendo: false, vida: false }, 10_000);
    expect(r.desenhos).toBe(0);
    // ...mas a simulação segue em passo lento, para notar quem entra em cena.
    expect(r.simulacoes).toBeGreaterThanOrEqual(36);
    expect(r.simulacoes).toBeLessThanOrEqual(41);
  });

  it('câmera mexendo: todo quadro, a 60 e a 120 Hz', () => {
    expect(rodar({ foco: true, mexendo: true, vida: false }, 1000, 60).desenhos).toBe(60);
    expect(rodar({ foco: true, mexendo: true, vida: true }, 1000, 120).desenhos).toBe(120);
  });

  it('só a vida à vista: 30 quadros/s, em tela de 60 e de 120 Hz', () => {
    expect(rodar({ foco: true, mexendo: false, vida: true }, 1000, 60).desenhos).toBe(30);
    expect(rodar({ foco: true, mexendo: false, vida: true }, 1000, 120).desenhos).toBe(30);
  });

  it('janela sem foco: no máximo 10 quadros/s, mesmo com a câmera mexendo', () => {
    for (const mexendo of [true, false]) {
      const { desenhos } = rodar({ foco: false, mexendo, vida: true }, 1000, 60);
      expect(desenhos).toBeLessThanOrEqual(10);
      expect(desenhos).toBeGreaterThanOrEqual(9);
    }
    expect(RITMO.semFocoMs).toBeGreaterThanOrEqual(100);
  });

  it('quem desenha não simula em separado; quem está fora do prazo não faz nada', () => {
    expect(decidir({ ...base, agora: 10_010, vida: true })).toBe('nada');
    expect(decidir({ ...base, agora: 10_034, vida: true })).toBe('desenhar');
    expect(decidir({ ...base, agora: 10_100 })).toBe('nada');
    expect(decidir({ ...base, agora: 10_250 })).toBe('simular');
  });

  it('passos de simulação: no máximo 0,1 s cada, somando o tempo decorrido até 0,5 s', () => {
    expect(passosDeSimulacao(0.016)).toEqual([0.016]);
    const p = passosDeSimulacao(0.25);
    expect(p.length).toBe(3);
    expect(Math.max(...p)).toBeLessThanOrEqual(0.1);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(0.25, 6);
    expect(passosDeSimulacao(30).reduce((a, b) => a + b, 0)).toBeCloseTo(0.5, 6); // volta de pausa longa
    expect(passosDeSimulacao(0)).toEqual([]);
    expect(passosDeSimulacao(-1)).toEqual([]);
  });
});
