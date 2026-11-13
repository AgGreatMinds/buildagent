// Regras da chegada ao prédio, puras (sem Three.js) para serem testadas sozinhas.
// 1) Fila da calçada: quem chega junto não entra amontoado — cada pessoa parte um intervalo depois da anterior.
// 2) Pouso direto: quem já estava no prédio quando a página abriu aparece no lugar, sem refazer a entrada.

// Intervalo entre duas partidas da calçada (ms): dá uns 3 m de distância entre as pessoas na porta.
export const INTERVALO_ENTRADA_MS = 1400;

// Hora em que a próxima pessoa pode sair da calçada. `proxima` é a vaga livre seguinte da fila
// (-Infinity = fila vazia). Devolve a partida desta pessoa e a vaga que sobra para a seguinte.
// Fila longa (muita gente nova de uma vez, ou a aba voltou depois de horas): a partir de FILA_CHEIA pessoas
// esperando, o intervalo aperta — ninguém fica meio minuto parado na rua. 500 ms ainda dá ~1 m entre duas pessoas.
export const FILA_CHEIA = 8;
export const INTERVALO_APERTADO_MS = 500;
export function partidaNaFila(agora: number, proxima: number, intervalo = INTERVALO_ENTRADA_MS): { partida: number; proxima: number } {
  const partida = Math.max(agora, proxima);
  const cheia = partida - agora >= FILA_CHEIA * intervalo;
  return { partida, proxima: partida + (cheia ? Math.min(intervalo, INTERVALO_APERTADO_MS) : intervalo) };
}

// Fila indiana dentro do prédio: espera (ms) de quem é o n-ésimo a receber rota nova no mesmo passo.
// Os primeiros FILA_CHEIA saem a cada `espaco`; os seguintes, a cada `apertado` (mesma razão da calçada).
export function esperaNaFila(n: number, espaco: number, apertado = 350): number {
  return Math.min(n, FILA_CHEIA) * espaco + Math.max(0, n - FILA_CHEIA) * Math.min(espaco, apertado);
}

// Elevador em mão dupla: entra-se pela direita da porta e sai-se pela esquerda, FAIXA_ELEV para cada lado.
// Antes a pessoa aparecia no andar novo, andava até o fundo e voltava pela mesma linha — de frente para quem
// vinha logo atrás (os dois se atravessavam).
export const FAIXA_ELEV = 0.55;
export interface PontoXZ { x: number; z: number }
export interface PassoDoElevador { x: number; y: number; z: number; troca?: number }
// `porta` = ponto diante da porta; `fundo` = dentro do vão do elevador. Quatro passos: chega pela faixa de
// entrada, entra, troca de andar já na faixa de saída e sai andando para a frente.
export function passosDoElevador(porta: PontoXZ, fundo: PontoXZ, yDe: number, yPara: number, andarPara: number): PassoDoElevador[] {
  return [
    { x: porta.x + FAIXA_ELEV, y: yDe, z: porta.z },
    { x: fundo.x + FAIXA_ELEV, y: yDe, z: fundo.z },
    { x: fundo.x - FAIXA_ELEV, y: yPara, z: fundo.z, troca: andarPara },
    { x: porta.x - FAIXA_ELEV, y: yPara, z: porta.z },
  ];
}

// Um passo de rota, só com o que o pouso precisa (o tipo completo vive em predio.ts).
export interface PassoDeRota {
  troca?: number; // troca de andar dentro do elevador
}

// Pouso direto: de uma rota inteira, fica só o ponto final e o andar em que ela termina
// (a última troca de andar da rota, ou o andar de partida se a rota não usa o elevador).
export function pousoDireto<P extends PassoDeRota>(fila: P[], andarAtual: number): { fim: P; andar: number } | null {
  if (!fila.length) return null;
  let andar = andarAtual;
  for (const s of fila) if (s.troca !== undefined) andar = s.troca;
  return { fim: fila[fila.length - 1], andar };
}
