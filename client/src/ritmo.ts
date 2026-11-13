// Ritmo de redesenho (puro, sem WebGL nem relógio global): decide, a cada chamada do navegador, se o quadro
// precisa ser desenhado. Antes o laço desenhava a cena inteira ~60×/s mesmo com tudo parado; agora:
//   - câmera ou tela mexendo (arraste, zoom, transição, dado novo): todo quadro, como antes;
//   - só a vida do prédio à vista (pessoas e telas vivas, carros na cidade): 30 quadros/s;
//   - janela sem foco (o usuário está em outro app): no máximo 10 quadros/s;
//   - nada vivo à vista e câmera parada: não desenha.
// Sem desenhar, a simulação segue em passo lento (4×/s) para notar quando alguém entra em cena.
// Aba oculta é outro caso: o main para o laço inteiro (visibilitychange).

/** Intervalos em ms (um lugar só). */
export const RITMO = {
  vidaMs: 1000 / 30, // pessoas/telas à vista com a câmera parada
  semFocoMs: 100, // janela sem foco: 10 quadros/s
  simulacaoMs: 250, // passo da simulação quando nada é desenhado
  ativoMs: 400, // depois de um gesto (clique, roda, tecla, câmera) segue em ritmo cheio por este tempo
  aquecimentoMs: 5000, // logo após abrir: modelos e texturas ainda chegando, desenha sempre
  folgaMs: 4, // o navegador chama com oscilação; sem folga, 30 quadros/s viraria 20 numa tela de 60 Hz
} as const;

export type Passo = 'desenhar' | 'simular' | 'nada';

export interface EntradaRitmo {
  agora: number; // ms monotônico (performance.now)
  ultimoDesenho: number; // instante do último quadro desenhado
  ultimaSimulacao: number; // instante da última simulação (desenhada ou não)
  foco: boolean; // document.hasFocus(): a janela é a ativa
  mexendo: boolean; // câmera em movimento, transição, gesto recente ou dado novo: precisa do quadro já
  vida: boolean; // alguma pessoa ou tela viva à vista (medido no passo anterior), ou a cidade andando
}

/** Menor intervalo entre dois quadros desenhados; 0 = todo quadro; Infinity = não desenha. */
export function intervaloDeDesenho(e: Pick<EntradaRitmo, 'foco' | 'mexendo' | 'vida'>): number {
  if (!e.mexendo && !e.vida) return Infinity;
  if (!e.foco) return RITMO.semFocoMs;
  return e.mexendo ? 0 : RITMO.vidaMs;
}

/** O que fazer nesta chamada: desenhar (simula e desenha), só simular, ou nada. */
export function decidir(e: EntradaRitmo): Passo {
  if (e.agora - e.ultimoDesenho >= intervaloDeDesenho(e) - RITMO.folgaMs) return 'desenhar';
  if (e.agora - e.ultimaSimulacao >= RITMO.simulacaoMs - RITMO.folgaMs) return 'simular';
  return 'nada';
}

/**
 * Divide o tempo decorrido em passos de simulação de no máximo `maxPasso` s (o limite que as pessoas já
 * usavam por quadro), até `maxTotal` s: depois de 250 ms sem simular, a pessoa anda os 250 ms, e não só
 * os primeiros 100. Tempo acima do total é descartado (volta de uma pausa longa não teleporta ninguém).
 */
export function passosDeSimulacao(decorrido: number, maxPasso = 0.1, maxTotal = 0.5): number[] {
  const passos: number[] = [];
  let resto = Math.min(Math.max(decorrido, 0), maxTotal);
  while (resto > 1e-6) {
    const d = Math.min(resto, maxPasso);
    passos.push(d);
    resto -= d;
  }
  return passos;
}
