// Testes da cor de projeto compartilhada entre o prédio 3D e a lista do painel.
import { beforeEach, describe, expect, it } from 'vitest';
import { CORES_PROJETO, FILEIRA_APP, chaveDaFileira, corCssDaSala, corDaChave, corDoProjeto, limparCoresParaTeste, reservarCores, semente } from './cor-projeto';

describe('cor-projeto', () => {
  beforeEach(() => limparCoresParaTeste()); // o registro é da sessão: cada teste começa limpo

  it('semente é o FNV-1a de 32 bits (estável entre versões)', () => {
    expect(semente('')).toBe(2166136261);
    expect(semente('a')).toBe(0xe40c292c);
    expect(semente('/projetos/x')).toBe(semente('/projetos/x'));
  });

  it('a chave da fileira segue main.ts: sala de app senta na fileira do app', () => {
    expect(chaveDaFileira('/p/a')).toBe('/p/a');
    expect(chaveDaFileira('/p/a', 'openbot')).toBe(`${FILEIRA_APP}openbot`);
  });

  it('a cor CSS da sala é a mesma cor da fileira no 3D', () => {
    const id = '/projetos/buildagent';
    const esperado = `#${corDaChave(id).toString(16).padStart(6, '0')}`;
    // Primeira chave do registro: fica com a cor do próprio hash.
    expect(corDaChave(id)).toBe(corDoProjeto(semente(id)));
    expect(corCssDaSala(id)).toBe(esperado);
    expect(CORES_PROJETO.map((c) => `#${c.toString(16).padStart(6, '0')}`)).toContain(corCssDaSala(id));
    // Duas salas do mesmo app: mesma fileira, mesma cor.
    expect(corCssDaSala('/a', 'openbot')).toBe(corCssDaSala('/b', 'openbot'));
  });

  it('paleta: 10 cores distintas, nenhuma no vermelho/laranja/âmbar (matiz entre 55° e 345°)', () => {
    // Matiz HSL de um hex numérico, em graus.
    const matiz = (c: number): number => {
      const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
      const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    expect(new Set(CORES_PROJETO).size).toBe(10);
    for (const c of CORES_PROJETO) expect(matiz(c) > 55 && matiz(c) < 345).toBe(true);
  });

  // Registro da sessão: sem repetição enquanto houver cor livre.
  const chaves = Array.from({ length: 10 }, (_, i) => `/projetos/p${i}`);
  const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

  it('10 chaves quaisquer → 10 cores distintas', () => {
    reservarCores(chaves);
    expect(new Set(chaves.map(corDaChave)).size).toBe(10);
  });

  it('a chave mantém a cor depois que outras entram (e a 11ª repete sem quebrar)', () => {
    const primeira = corDaChave(chaves[3]);
    reservarCores(chaves);
    expect(corDaChave(chaves[3])).toBe(primeira);
    const onze = corDaChave('/projetos/onze');
    expect(onze).toBe(corDoProjeto(semente('/projetos/onze'))); // tudo ocupado: cai no índice do hash
    expect(CORES_PROJETO).toContain(onze);
    expect(corDaChave(chaves[3])).toBe(primeira);
  });

  it('reservarCores: a mesma lista em ordens diferentes dá as mesmas cores', () => {
    reservarCores(chaves);
    const a = chaves.map(corDaChave);
    limparCoresParaTeste();
    reservarCores([...chaves].reverse());
    expect(chaves.map(corDaChave)).toEqual(a);
    limparCoresParaTeste();
    reservarCores([chaves[5], ...chaves, chaves[0]]); // repetida não muda nada
    expect(chaves.map(corDaChave)).toEqual(a);
  });

  it('lista e 3D recebem a mesma cor para a mesma chave', () => {
    reservarCores(['/a', '/b', `${FILEIRA_APP}openbot`]);
    expect(corCssDaSala('/a')).toBe(hex(corDaChave(chaveDaFileira('/a')))); // trilho × fileira/crachá
    expect(corCssDaSala('/x', 'openbot')).toBe(hex(corDaChave(chaveDaFileira('/y', 'openbot'))));
  });
});
