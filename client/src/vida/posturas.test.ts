// Testes de posturas.ts.
// Determinismo, valores finitos dentro de ±3,2 rad, janelas de rebatida do ping-pong
// (lados 0 e 1 batem em instantes diferentes, nunca juntos) e limpeza ao valor de pé.

import { describe, expect, it } from 'vitest';
import { posturaAlvos } from './posturas';
import type { AlvosPostura } from './posturas';

// Repositório sem alocar: o chamador reutiliza o mesmo objeto a cada passo.
function novaSaida(): AlvosPostura {
  return {
    hipsY: 0, hipsZ: 0, spineX: 0, spineZ: 0, headX: 0,
    leftShoulderX: 0, rightShoulderX: 0, leftShoulderY: 0, rightShoulderY: 0,
    leftShoulderZ: 0, rightShoulderZ: 0, leftElbowX: 0, rightElbowX: 0,
    leftHipX: 0, rightHipX: 0, leftKneeX: 0, rightKneeX: 0,
  };
}

const T = 37.2; // instante de teste arbitrário (mesmo valor nas chamadas comparadas)
const F = 0.7; // fase própria da pessoa

// Valor de pé neutro (respiração zerada) — base contra a qual mede o "campo ausente = valor de pé".
function valorDePe(): AlvosPostura {
  const s = novaSaida();
  posturaAlvos(s, null, 0, 0); // sin(0) = 0 em todas as respirações: alvo neutro exato
  return s;
}

// Diferença campo a campo entre dois alvos (o baseline cobre as respirações sin(t,fase)).
function dif(a: AlvosPostura, b: AlvosPostura, campo: keyof AlvosPostura): number {
  return a[campo] - b[campo];
}

describe('posturaAlvos: determinismo', () => {
  it('mesma entrada (t, fase, lado) → mesma saída em dois objetos distintos', () => {
    for (const nome of ['sentado', 'assistindo', 'comemorar', 'fliperama', 'pingpong', 'ler', null] as const) {
      const s1 = novaSaida();
      const s2 = novaSaida();
      posturaAlvos(s1, nome, T, F, 0);
      posturaAlvos(s2, nome, T, F, 0);
      expect(s1).toEqual(s2);
    }
  });

  it('reusa o objeto: a mesma `saida` preenchida duas vezes é idêntica (sem aloc)', () => {
    const s = novaSaida();
    posturaAlvos(s, 'pingpong', T, F, 0);
    const r1 = JSON.stringify(s);
    posturaAlvos(s, 'pingpong', T, F, 0);
    const r2 = JSON.stringify(s);
    expect(r1).toBe(r2);
  });
});

describe('posturaAlvos: alcance e finitude', () => {
  it('todas as posturas × t, fase, lado: finitas e dentro de ±3,2 rad (exclui hipsY/hipsZ)', () => {
    for (const nome of ['sentado', 'assistindo', 'comemorar', 'fliperama', 'pingpong', 'ler', null] as const) {
      for (const t of [0, 0.3, 1.1, 37.2, 999.99]) {
        for (const fase of [0, 0.7, 6.1]) {
          for (const lado of [0, 1]) {
            const s = posturaAlvos(novaSaida(), nome, t, fase, lado);
            for (const campo of Object.keys(s) as Array<keyof AlvosPostura>) {
              expect(Number.isFinite(s[campo])).toBe(true);
              // hipsY/hipsZ são metros, não ângulos — o teto de rad vale só para rotações
              if (campo !== 'hipsY' && campo !== 'hipsZ') {
                expect(Math.abs(s[campo])).toBeLessThanOrEqual(3.2);
              }
            }
          }
        }
      }
    }
  });

  it('campo que a postura não sobrepõe fica no valor de pé', () => {
    // Base: postura null no mesmo (t=0, fase=0) — as respirações sin() zeram e sobra o neutro exato.
    const base = posturaAlvos(novaSaida(), null, 0, 0);
    const s = posturaAlvos(novaSaida(), 'sentado', 0, 0, 0);
    // A sentada só toca: hips, spineX, headX, coxas, joelhos, ombros X, cotovelos X.
    // O que ela NÃO toca herda o valor de pé: coluna lateral, ombros Y/Z, joelhos... (joelhos tocados)
    expect(dif(s, base, 'spineZ')).toBe(0);
    expect(dif(s, base, 'leftShoulderY')).toBe(0);
    expect(dif(s, base, 'rightShoulderY')).toBe(0);
    expect(dif(s, base, 'leftShoulderZ')).toBe(0);
    expect(dif(s, base, 'rightShoulderZ')).toBe(0);
  });
});

describe('posturaAlvos: ping-pong', () => {
  const R = 20; // radiação da janela em t (t/1.1 cobre vários ciclos)

  function janelaLado(lado: number, t: number): boolean {
    const f = (t / 1.1 + 0.5 * lado) - Math.floor(t / 1.1 + 0.5 * lado);
    return f < 0.22;
  }

  it('lado 0 e lado 1 batem em instantes diferentes', () => {
    const instantes0: number[] = [];
    const instantes1: number[] = [];
    for (let i = 0; i <= R * 20; i++) {
      const t = (i * R) / 20;
      if (janelaLado(0, t)) instantes0.push(t);
      if (janelaLado(1, t)) instantes1.push(t);
    }
    expect(instantes0.length).toBeGreaterThan(0);
    expect(instantes1.length).toBeGreaterThan(0);
    // A fase .5·lado desloca as janelas meio ciclo (0.55 s)
    expect(instantes0[0]).toBeLessThan(instantes1[0]);
  });

  it('nunca batem juntos: em nenhum instante as duas janelas abrem', () => {
    for (let i = 0; i <= R * 100; i++) {
      const t = (i * R) / 100;
      expect(janelaLado(0, t) && janelaLado(1, t)).toBe(false);
    }
  });

  it('o braço direito rebate só dentro da janela (ombro X fora do repouso só na janela)', () => {
    for (let i = 0; i <= R * 100; i++) {
      const t = (i * R) / 100;
      for (const lado of [0, 1]) {
        const s = posturaAlvos(novaSaida(), 'pingpong', t, 0, lado);
        const repouso = posturaAlvos(novaSaida(), null, t, 0); // valor de pé no mesmo t (respiração inclusa)
        const naJanela = janelaLado(lado, t);
        if (naJanela) {
          // dentro da janela: ombro X desce abaixo do repouso (pico -1.7 no meio)
          expect(s.rightShoulderX).toBeLessThan(repouso.rightShoulderX);
        } else {
          // fora da janela: ombro direito volta ao valor de pé
          expect(s.rightShoulderX).toBe(repouso.rightShoulderX);
        }
      }
    }
  });
});
