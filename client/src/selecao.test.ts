// Testes da lógica pura da seleção: escolha por distância (com limiar e empate),
// limiar de arraste e geometria da vista de cima inclinada. Sem WebGL (mesmo padrão de balao.test).
import { describe, expect, it } from 'vitest';
import { foiClique, maisPerto, vistaFocada } from './selecao';

describe('maisPerto', () => {
  it('escolhe o mais perto do ponto do clique', () => {
    const r = maisPerto({ x: 0, y: 0, z: 0 }, [
      { id: 'b', pos: { x: 10, y: 0, z: 0 } },
      { id: 'a', pos: { x: 2, y: 0, z: 0 } },
    ], 10);
    expect(r?.id).toBe('a');
  });

  it('empate de distância: desempata pelo id menor', () => {
    const r = maisPerto({ x: 0, y: 0, z: 0 }, [
      { id: 'zeta', pos: { x: 1, y: 0, z: 0 } },
      { id: 'alfa', pos: { x: -1, y: 0, z: 0 } },
    ]);
    expect(r?.id).toBe('alfa');
  });

  it('nada dentro do limiar → null (clique no vazio não seleciona)', () => {
    const r = maisPerto({ x: 0, y: 0, z: 0 }, [{ id: 'a', pos: { x: 100, y: 0, z: 0 } }], 1.6);
    expect(r).toBeNull();
  });

  it('lista vazia → null', () => {
    expect(maisPerto({ x: 0, y: 0, z: 0 }, [])).toBeNull();
  });
});

describe('foiClique', () => {
  it('movimento abaixo do limiar conta como clique', () => {
    expect(foiClique({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(true); // 5 px < 6
  });
  it('movimento acima do limiar é arraste (órbita), não clique', () => {
    expect(foiClique({ x: 0, y: 0 }, { x: 8, y: 0 })).toBe(false);
  });
  it('limiar customizado vale', () => {
    expect(foiClique({ x: 0, y: 0 }, { x: 5, y: 0 }, 4)).toBe(false);
  });
});

describe('vistaFocada', () => {
  it('alvo fica acima dos pés e a câmera acima e afastada, na direção atual', () => {
    const v = vistaFocada({ x: 2, y: 6, z: 3 }, { x: 0, y: 0, z: 8 }); // direção +Z normalizada
    expect(v.alvo).toEqual({ x: 2, y: 7.5, z: 3 }); // 6 + 1,5
    expect(v.pos.z).toBeGreaterThan(v.alvo.z);       // câmera do lado +Z (a olha para o boneco)
    expect(v.pos.y).toBeCloseTo(v.alvo.y + 7);       // altura da câmera = alvo + 7 m
    // distância horizontal câmera→alvo = 6
    expect(Math.hypot(v.pos.x - v.alvo.x, v.pos.z - v.alvo.z)).toBeCloseTo(6);
  });

  it('direção nula → padrão +Z (lado da fachada)', () => {
    const v = vistaFocada({ x: 0, y: 0, z: 0 }, null);
    expect(v.pos.z).toBeCloseTo(v.alvo.z + 6);
    expect(v.pos.x).toBeCloseTo(v.alvo.x);
  });

  it('andar da pessoa preserva a altura do alvo (não corta andar: o main só chama mover)', () => {
    const v1 = vistaFocada({ x: 0, y: 6, z: 0 }, { x: 1, y: 0, z: 0 });
    const v2 = vistaFocada({ x: 0, y: 12, z: 0 }, { x: 1, y: 0, z: 0 });
    expect(v2.alvo.y - v1.alvo.y).toBe(6); // sobe com o andar do boneco
  });
});
