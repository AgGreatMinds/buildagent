import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { aparencia, modeloPessoa } from './people';
import { instalarPessoas, OSSOS } from './pessoa-glb';

// Em Node não há download: a malha é lida do arquivo que o navegador baixaria.
beforeAll(() => {
  const glb = readFileSync(new URL('../public/assets/people/pessoa.glb', import.meta.url));
  instalarPessoas(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer);
});

describe('pessoas procedurais', () => {
  it('mantém determinismo e diversidade em 500 sementes consecutivas', () => {
    const combinations = new Set<string>();
    const styles = new Set<number>();
    const skins = new Set<number>();
    const colors = new Set<number>();
    const outfits = new Set<number>();
    for (let seed = 1; seed <= 500; seed++) {
      const look = aparencia(seed);
      expect(aparencia(seed)).toEqual(look);
      combinations.add(JSON.stringify(look));
      styles.add(look.hair); skins.add(look.skin); colors.add(look.hairColor); outfits.add(look.outfit);
      expect(look.height).toBeGreaterThanOrEqual(0.94);
      expect(look.height).toBeLessThanOrEqual(1.06);
    }
    expect(combinations.size).toBe(500);
    expect(styles.size).toBe(10);
    expect(skins.size).toBeGreaterThanOrEqual(8);
    expect(colors.size).toBe(9);
    expect(outfits.size).toBe(8);
    console.log(`Variedade: ${combinations.size}/500 combinações`);
  });

  // A distribuição inclui todos os arquétipos, sem cor obrigatória por profissão.
  it('distribui pelo menos 16 cores e quatro padrões sem ultrapassar 12%', () => {
    const counts = new Map<number, number>();
    const patterns = new Set<number>();
    for (let seed = 1; seed <= 500; seed++) {
      const look = aparencia(seed);
      counts.set(look.color, (counts.get(look.color) ?? 0) + 1);
      patterns.add(look.pattern);
    }
    expect(counts.size).toBeGreaterThanOrEqual(16);
    expect(patterns.size).toBe(4);
    const largest = Math.max(...counts.values()) / 500;
    expect(largest).toBeLessThanOrEqual(0.12);
    console.log(`Cor mais frequente: ${(largest * 100).toFixed(1)}%`);
  });

  it('distingue cada par da amostra em pelo menos três atributos visuais', () => {
    const looks = Array.from({ length: 200 }, (_, i) => aparencia(i + 1));
    const keys = ['skin', 'hair', 'hairColor', 'outfit', 'color', 'build', 'feminine', 'trousers', 'shoes', 'headset', 'watch', 'backpack'] as const;
    for (let i = 0; i < looks.length; i++) for (let j = i + 1; j < looks.length; j++) {
      expect(keys.filter(key => looks[i][key] !== looks[j][key]).length).toBeGreaterThanOrEqual(3);
    }
  });

  // 500 corpos montados duas vezes: leva ~1 s sozinho, mas estoura os 5 s padrão em máquina carregada (CI de 2 núcleos).
  it('usa uma geometria sem grupos e até 6000 triângulos por corpo', { timeout: 30_000 }, () => {
    let maxTriangles = 0;
    let totalTriangles = 0;
    const bodies = new Set<string>();
    // Compara a geometria efetiva, além dos descritores de aparência.
    const fingerprint = (geometry: ReturnType<typeof modeloPessoa>['geometry']) => {
      const hash = createHash('sha256');
      for (const name of ['position', 'color', 'skinIndex', 'skinWeight']) {
        const array = geometry.getAttribute(name).array;
        hash.update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
      }
      return hash.digest('hex');
    };
    for (let seed = 1; seed <= 500; seed++) {
      const { geometry, rig, badgeRanges } = modeloPessoa(seed);
      const triangles = geometry.index!.count / 3;
      maxTriangles = Math.max(maxTriangles, triangles);
      totalTriangles += triangles;
      expect(triangles).toBeLessThanOrEqual(6000);
      expect(geometry.groups).toHaveLength(0);
      expect(badgeRanges.length).toBeGreaterThanOrEqual(1); // cordão do crachá, repintado por projeto
      // Cada vértice segue ossos que existem e os pesos somam 1 (malha deformável sem rasgar).
      const skinIndex = geometry.getAttribute('skinIndex');
      const skinWeight = geometry.getAttribute('skinWeight');
      if (seed <= 40) for (let v = 0; v < skinIndex.count; v++) {
        let sum = 0;
        for (let c = 0; c < 4; c++) {
          expect(skinIndex.getComponent(v, c)).toBeLessThan(OSSOS.length);
          sum += skinWeight.getComponent(v, c);
        }
        expect(sum).toBeCloseTo(1, 4);
      }
      const positions = geometry.getAttribute('position');
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
      const repeated = modeloPessoa(seed);
      const signature = fingerprint(geometry);
      expect(fingerprint(repeated.geometry)).toBe(signature);
      bodies.add(signature);
      repeated.geometry.dispose(); repeated.rig.skeleton.dispose();
      geometry.dispose(); rig.skeleton.dispose();
    }
    expect(bodies.size).toBe(500);
    console.log(`Maior corpo: ${maxTriangles} triângulos; média: ${totalTriangles / 500}; corpo + sprite: ${maxTriangles + 2}`);
  });
});

describe('aparencia — gênero do nome (look)', () => {
  it("look 'm' nunca gera aparência feminina e look 'f' sempre gera, para qualquer semente", () => {
    for (let seed = 1; seed < 400; seed++) {
      expect(aparencia(seed, undefined, 'm').feminine).toBe(false);
      expect(aparencia(seed, undefined, 'f').feminine).toBe(true);
    }
  });
  it('sem look vale o sorteio da semente (pessoa nomeada), igual ao comportamento anterior', () => {
    for (let seed = 1; seed < 100; seed++) expect(aparencia(seed).feminine).toBe(aparencia(seed, undefined, undefined).feminine);
  });
});
