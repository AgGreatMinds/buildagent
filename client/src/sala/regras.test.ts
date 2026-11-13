import { describe, expect, it } from 'vitest';
import { chaveDaIntencao, golNoQuadro, ladoPingpong, posicaoRaquete, PP_ITEM, viaNaRota } from './regras';
import { GOL_A_PARTIR, LANCE_MS, lanceFutebol } from '../telas/programas';
import type { Intencao } from '../vida/tipos';

const it_ = (destino: Intencao['destino'], slot: number): Intencao => ({ chave: 'x', destino, slot, desde: 0, ate: 1 });

describe('viaNaRota — VIA na ida e na volta da sala', () => {
  it('chega à sala vindo de fora: só passa na chegada', () => {
    expect(viaNaRota(1, 'mesa', 1, 'pingpong')).toEqual({ saida: false, chegada: true });
  });
  it('sai da sala para a mesa: só passa na saída', () => {
    expect(viaNaRota(1, 'tv', 1, 'mesa')).toEqual({ saida: true, chegada: false });
  });
  it('sala → sala: uma passagem só, na saída', () => {
    expect(viaNaRota(1, 'tv', 1, 'fliperama')).toEqual({ saida: true, chegada: false });
  });
  it('sai da sala para outro andar (elevador): passa pela saída', () => {
    expect(viaNaRota(1, 'estante', 0, undefined)).toEqual({ saida: true, chegada: false });
  });
  it('lounge e andar 0 não usam VIA', () => {
    expect(viaNaRota(1, 'lounge', 1, 'mesa')).toEqual({ saida: false, chegada: false });
    expect(viaNaRota(0, 'tv', 1, 'tv')).toEqual({ saida: false, chegada: true }); // origem no andar 0: não conta como saída
  });
});

describe('ladoPingpong — par no mesmo slot', () => {
  const m = (...e: Array<[string, Intencao]>) => new Map(e);
  it('com parceiro: a menor chave fica a oeste (0), a outra a leste (1)', () => {
    const intencoes = m(['ana', it_('pingpong', 0)], ['beto', it_('pingpong', 0)]);
    expect(ladoPingpong('ana', 0, intencoes)).toBe(0);
    expect(ladoPingpong('beto', 0, intencoes)).toBe(1);
  });
  it('troca de parceiro vira o lado sem o slot mudar', () => {
    const antes = m(['beto', it_('pingpong', 0)], ['carla', it_('pingpong', 0)]);
    const depois = m(['beto', it_('pingpong', 0)], ['ana', it_('pingpong', 0)]);
    expect(ladoPingpong('beto', 0, antes)).toBe(0);
    expect(ladoPingpong('beto', 0, depois)).toBe(1);
  });
  it('sem parceiro: paridade do slot; parceiro em outro slot não conta', () => {
    expect(ladoPingpong('ana', 0, m(['ana', it_('pingpong', 0)]))).toBe(0);
    expect(ladoPingpong('ana', 1, m(['ana', it_('pingpong', 1)], ['beto', it_('pingpong', 0)]))).toBe(1);
  });
  it('quem está em outro destino no mesmo slot não é parceiro', () => {
    expect(ladoPingpong('beto', 0, m(['ana', it_('fliperama', 0)], ['beto', it_('pingpong', 0)]))).toBe(0);
  });
});

describe('chaveDaIntencao', () => {
  it('lado do ping-pong muda a chave (aplicar não sai cedo); em outros destinos o lado é ignorado', () => {
    expect(chaveDaIntencao(it_('pingpong', 0), 0)).not.toBe(chaveDaIntencao(it_('pingpong', 0), 1));
    expect(chaveDaIntencao(it_('tv', 2), 0)).toBe(chaveDaIntencao(it_('tv', 2), 1));
  });
  it('slot e conversa também entram', () => {
    expect(chaveDaIntencao(it_('tv', 0), 0)).not.toBe(chaveDaIntencao(it_('tv', 1), 0));
    expect(chaveDaIntencao({ ...it_('conversa', 0), conversaCom: 'b' }, 0)).not.toBe(chaveDaIntencao(it_('conversa', 0), 0));
  });
});

describe('golNoQuadro', () => {
  it('bate com lanceFutebol(...).gol em todo o ciclo, nas bordas incluídas', () => {
    const base = 1_700_000_000_000 - (1_700_000_000_000 % LANCE_MS);
    for (let ms = 0; ms < LANCE_MS * 2; ms += 50) expect(golNoQuadro(base + ms)).toBe(lanceFutebol(base + ms, 0).gol);
    expect(golNoQuadro(base + LANCE_MS * GOL_A_PARTIR - 1)).toBe(false);
    expect(golNoQuadro(base + LANCE_MS * GOL_A_PARTIR)).toBe(true);
    expect(golNoQuadro(base + LANCE_MS)).toBe(false); // virou o ciclo
  });
});

describe('posicaoRaquete', () => {
  it('jogador a oeste: raquete 0,3 m à frente (rumo à mesa) e 1 m acima', () => {
    const q = posicaoRaquete({ x: PP_ITEM.x - 2, y: 6, z: 0.9 }, 0, 6);
    expect(q).toEqual({ x: PP_ITEM.x - 2 + 0.3, y: 7, z: 0.9 });
  });
  it('jogador a leste: desloca para oeste (rumo à mesa)', () => {
    expect(posicaoRaquete({ x: PP_ITEM.x + 2, y: 6, z: 0 }, 1, 6).x).toBeCloseTo(PP_ITEM.x + 2 - 0.3);
  });
  it('sem jogador: descansa no tampo, cada raquete do seu lado', () => {
    expect(posicaoRaquete(null, 0, 6)).toEqual({ x: PP_ITEM.x - 0.45, y: 6.76, z: PP_ITEM.z });
    expect(posicaoRaquete(null, 1, 6)).toEqual({ x: PP_ITEM.x + 0.45, y: 6.76, z: PP_ITEM.z });
  });
});
