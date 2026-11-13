import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { letrasCaixa, LETREIRO_LARGURA_MAX } from './fachada';
import { MAX_LETREIRO, NOME_DO_PREDIO } from './placa';

// A fonte é lida do arquivo que o navegador baixaria.
const fonte = new FontLoader().parse(JSON.parse(readFileSync(new URL('../public/assets/fonts/helvetiker_bold.typeface.json', import.meta.url), 'utf8')));

describe('letreiro em letras-caixa', () => {
  it('monta o nome padrão em dois grupos (frentes e laterais), centrado e sem posição inválida', () => {
    const g = letrasCaixa(fonte, NOME_DO_PREDIO, 1.35, 0.28);
    expect(g.groups.map((x) => x.materialIndex)).toEqual([0, 1]);
    expect(g.groups[0].count).toBeGreaterThan(0);
    expect(g.groups[1].count).toBeGreaterThan(0);
    const pos = g.getAttribute('position');
    expect(g.groups[0].count + g.groups[1].count).toBe(pos.count); // nenhum vértice fora dos grupos
    expect(Array.from(pos.array).every(Number.isFinite)).toBe(true);
    g.computeBoundingBox();
    const caixa = g.boundingBox!;
    expect(Math.abs((caixa.min.x + caixa.max.x) / 2)).toBeLessThan(0.15); // centrado na fachada
    expect(caixa.max.x - caixa.min.x).toBeLessThanOrEqual((g.userData.largura as number) + 0.01);
    expect(caixa.max.z - caixa.min.z).toBeCloseTo(0.28, 5); // profundidade pedida
  });

  it('separa as letras: a soma das larguras das letras é menor que a largura do nome', () => {
    const junto = letrasCaixa(fonte, 'AA', 1.35, 0.28).userData.largura as number;
    const uma = letrasCaixa(fonte, 'A', 1.35, 0.28).userData.largura as number;
    expect(junto).toBeGreaterThan(uma * 2 + 0.05);
  });

  it('nome no limite de caracteres cabe na faixa depois da redução', () => {
    const g = letrasCaixa(fonte, 'W'.repeat(MAX_LETREIRO), 1.35, 0.28); // a letra mais larga, no máximo de caracteres
    const k = Math.min(1, LETREIRO_LARGURA_MAX / (g.userData.largura as number));
    expect(k).toBeLessThan(1);
    expect((g.userData.largura as number) * k).toBeLessThanOrEqual(LETREIRO_LARGURA_MAX + 1e-6);
  });

  it('espaço avança sem gerar geometria e símbolo que a fonte não tem não quebra', () => {
    const comEspaco = letrasCaixa(fonte, 'A B', 1.35, 0.28);
    const semEspaco = letrasCaixa(fonte, 'AB', 1.35, 0.28);
    expect(comEspaco.getAttribute('position').count).toBe(semEspaco.getAttribute('position').count);
    expect(comEspaco.userData.largura as number).toBeGreaterThan(semEspaco.userData.largura as number);
    expect(() => letrasCaixa(fonte, 'A~^B', 1.35, 0.28)).not.toThrow();
  });
});
