// Regras puras da sala de descanso que o Predio usa por intenção/quadro (sem three nem DOM, para testar).
// Fonte única: o predio.ts chama estas funções; nada aqui tem relógio global nem aleatório.
import type { Intencao } from '../vida/tipos';
import { GOL_A_PARTIR, LANCE_MS } from '../telas/programas';
import { ITENS } from './layout';

// Destinos sociais da sala (só andar 1): quem entra ou sai deles passa pelo corredor de `VIA`.
// O lounge NÃO entra: fica fora da sala (z ≈ −10), e o desvio por VIA o faria atravessá-la sem motivo.
export const SALA_SOCIAL = new Set<string>(['tv', 'fliperama', 'pingpong', 'estante']);

// Caminho entre a estante e `VIA` (da estante para `VIA`; na chegada, ao contrário): a mesa de ping-pong
// fica no meio da reta, então a rota contorna pelo lado norte (z −0,5, entre a mesa e os fliperamas).
export const ESTANTE_LADO_PINGPONG: ReadonlyArray<{ x: number; z: number }> = [{ x: 21.5, z: -0.5 }, { x: 19.0, z: -0.5 }];

// Item do ping-pong em ITENS (fonte única): as raquetes descansam em `x ∓ 0,45` dele.
export const PP_ITEM = ITENS.find((v) => v.id === 'pingpong')!;
// Raquete na mão: afastada 0,3 m do jogador na direção da mesa e +1,0 m acima da base.
export const RAQUETE_AFASTAR = 0.3;
export const RAQUETE_ALTURA = 1.0;

/** Onde a rota precisa de um ponto em `VIA`: na saída de um lugar da sala (ida E volta) e/ou na chegada
 *  a um (sem repetir quando sala → sala, que já passou na saída). */
export function viaNaRota(andarAtual: number, origem: string, andarDestino: number, destino: string | undefined): { saida: boolean; chegada: boolean } {
  const saida = andarAtual === 1 && SALA_SOCIAL.has(origem);
  const chegada = andarDestino === 1 && !!destino && SALA_SOCIAL.has(destino) && !saida;
  return { saida, chegada };
}

/** Lado do par no ping-pong (0 oeste, 1 leste): a agenda põe os 2 parceiros no MESMO slot, então vale a
 *  menor chave. Sem parceiro, a paridade do slot (sempre o mesmo). */
export function ladoPingpong(chave: string, slot: number, intencoes: Map<string, Intencao>): 0 | 1 {
  let parceiro: string | null = null;
  for (const [c, i2] of intencoes) {
    if (c !== chave && i2.destino === 'pingpong' && i2.slot === slot) {
      if (parceiro === null || c < parceiro) parceiro = c;
    }
  }
  if (parceiro !== null) return chave < parceiro ? 0 : 1;
  return (slot % 2) as 0 | 1;
}

/** Chave que decide se a intenção mudou. O lado do ping-pong entra nela: o parceiro trocar vira o lado
 *  sem mudar o slot, e sem isto os dois acabavam no mesmo lado (bolinha nunca aparecia). */
export function chaveDaIntencao(it: Pick<Intencao, 'destino' | 'slot' | 'conversaCom'>, lado: number): string {
  return `${it.destino}:${it.slot}:${it.conversaCom ?? ''}:${it.destino === 'pingpong' ? lado : ''}`;
}

/** GOL da TV no quadro: a mesma conta de `lanceFutebol(agora, 0).gol`, sem criar objeto. */
export function golNoQuadro(agora: number): boolean {
  return (agora % LANCE_MS) / LANCE_MS >= GOL_A_PARTIR;
}

/** Posição da raquete do lado: na mão de quem joga (deslocada para a mesa) ou em repouso no tampo. */
export function posicaoRaquete(jogador: { x: number; y: number; z: number } | null, lado: 0 | 1, yAndar: number): { x: number; y: number; z: number } {
  if (jogador) return { x: jogador.x + Math.sign(PP_ITEM.x - jogador.x) * RAQUETE_AFASTAR, y: jogador.y + RAQUETE_ALTURA, z: jogador.z };
  return { x: PP_ITEM.x + (lado === 0 ? -0.45 : 0.45), y: yAndar + 0.76, z: PP_ITEM.z };
}
