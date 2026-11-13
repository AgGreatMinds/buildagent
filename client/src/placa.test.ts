// Placa da fileira: o nome aparece inteiro sempre que cabe (uma linha, letra menor, duas linhas).
import { describe, expect, it } from 'vitest';
import { MAX_CARACTERES, NOME_DO_PREDIO, PLACA_CHEIA, PLACA_SOME, comporPlaca, limitar, nomeDoLetreiro, opacidadeDaPlaca, pontosDeQuebra, type Medir } from './placa';

// Medidor fixo: cada caractere mede 0,58 × o tamanho da letra (perto de uma sem-serifa em peso 600).
const medir: Medir = (t, px) => [...t].length * px * 0.58;
const inteiro = (nome: string) => comporPlaca(nome, medir).linhas.join(' ').replace(/\s+/g, '');

describe('placa', () => {
  it('nome curto: uma linha, letra cheia', () => {
    expect(comporPlaca('buildagent', medir)).toEqual({ linhas: ['buildagent'], fonte: 96, cortado: false });
    expect(comporPlaca('Pessoal', medir).linhas).toEqual(['Pessoal']);
  });

  it('nome médio: continua em uma linha, com a letra menor', () => {
    const c = comporPlaca('SISTEMA DE ESTOQUE', medir); // 18 caracteres
    expect(c.linhas).toEqual(['SISTEMA DE ESTOQUE']);
    expect(c.fonte).toBeLessThan(96);
    expect(c.fonte).toBeGreaterThanOrEqual(64);
    expect(c.cortado).toBe(false);
  });

  it('nome longo com separador: duas linhas, inteiro (o caso que antes virava "PROJETO-FINANCE…")', () => {
    const c = comporPlaca('PROJETO-FINANCEIRO-BR', medir);
    expect(c.cortado).toBe(false);
    expect(c.linhas.length).toBeLessThanOrEqual(2);
    expect(c.linhas.join('')).toBe('PROJETO-FINANCEIRO-BR');
    const d = comporPlaca('scratch-2026-11-12-0a4ae2', medir);
    expect(d.cortado).toBe(false);
    expect(d.linhas.join('')).toBe('scratch-2026-11-12-0a4ae2');
  });

  it('todo nome de até 28 caracteres aparece inteiro e cabe na placa', () => {
    const nomes = ['Site da padaria', 'SITE DA EMPRESA', 'meu_projeto_de_teste_numero_1', 'loja.online.checkout.v2', 'apiPagamentosInternacionais', 'a'.repeat(28), 'OpenBot', 'Agente 135a'];
    for (const nome of nomes.filter((n) => n.length <= MAX_CARACTERES)) {
      const c = comporPlaca(nome, medir);
      expect([nome, c.cortado]).toEqual([nome, false]);
      expect(inteiro(nome)).toBe(nome.replace(/\s+/g, ''));
      for (const linha of c.linhas) expect(medir(linha, c.fonte)).toBeLessThanOrEqual(940);
      expect(c.fonte).toBeGreaterThanOrEqual(48);
    }
  });

  it('só corta acima de 28 caracteres, com reticências', () => {
    expect(limitar('a'.repeat(28))).toEqual({ texto: 'a'.repeat(28), cortado: false });
    const l = limitar('um-nome-de-projeto-realmente-muito-comprido');
    expect(l.cortado).toBe(true);
    expect([...l.texto].length).toBeLessThanOrEqual(MAX_CARACTERES);
    expect(l.texto.endsWith('…')).toBe(true);
    const c = comporPlaca('um-nome-de-projeto-realmente-muito-comprido', medir);
    expect(c.cortado).toBe(true);
    for (const linha of c.linhas) expect(medir(linha, c.fonte)).toBeLessThanOrEqual(940);
  });

  it('nome vazio vira um traço; espaços repetidos são limpos; emoji não é partido', () => {
    expect(comporPlaca('   ', medir).linhas).toEqual(['—']);
    expect(comporPlaca('  meu   projeto ', medir).linhas).toEqual(['meu projeto']);
    expect(limitar('🚀'.repeat(40)).texto).toBe('🚀'.repeat(27) + '…');
  });

  it('letra muito larga: ainda cabe, cortando só no último recurso', () => {
    const largo: Medir = (t, px) => [...t].length * px * 1.4;
    const c = comporPlaca('nomesemseparadoralgum', largo);
    for (const linha of c.linhas) expect(largo(linha, c.fonte)).toBeLessThanOrEqual(940);
  });

  it('pontos de quebra: separadores e camelCase', () => {
    expect(pontosDeQuebra('meu-projeto novo')).toEqual([4, 12]);
    expect(pontosDeQuebra('apiPagamentos')).toEqual([3]);
    expect(pontosDeQuebra('semquebra')).toEqual([]);
  });
});

describe('nomeDoLetreiro', () => {
  it('sem nome válido, usa o padrão', () => {
    for (const v of [undefined, null, 42, '', '   ', 'ção'.replace(/./g, '\u0301')]) expect(nomeDoLetreiro(v)).toBe(NOME_DO_PREDIO);
  });
  it('tira acento e símbolo que a fonte 3D não desenha, e limpa espaços', () => {
    expect(nomeDoLetreiro('  Estúdio   Ação 🚀 ')).toBe('Estudio Acao');
  });
  it('corta nome comprido demais para a fachada', () => {
    expect(nomeDoLetreiro('A'.repeat(50))).toBe('A'.repeat(20));
  });
});

describe('placa no zoom', () => {
  it('colada na câmera some; longe fica inteira', () => {
    expect(opacidadeDaPlaca(0)).toBe(0);
    expect(opacidadeDaPlaca(PLACA_SOME)).toBe(0);
    expect(opacidadeDaPlaca(PLACA_CHEIA)).toBe(1);
    expect(opacidadeDaPlaca(80)).toBe(1);
  });

  it('entre os dois limites cresce sem salto', () => {
    let antes = 0;
    for (let d = PLACA_SOME; d <= PLACA_CHEIA; d += 0.1) {
      const o = opacidadeDaPlaca(d);
      expect(o).toBeGreaterThanOrEqual(antes);
      expect(o - antes).toBeLessThan(0.1);
      antes = o;
    }
  });

  it('distância inválida não deixa a placa na frente', () => {
    expect(opacidadeDaPlaca(Number.NaN)).toBe(0);
    expect(opacidadeDaPlaca(-3)).toBe(0);
  });
});
