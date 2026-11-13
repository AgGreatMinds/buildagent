// Testes da lógica pura do balão de atividade: truncamento, estados e modo conteúdo.
// Sprite/CanvasTexture ficam fora (exigem WebGL); só `textoCurto`/`textoBalao` são testáveis aqui.
import { describe, expect, it } from 'vitest';
import { LIMITE_TEXTO_BALAO, textoBalao, textoCurto } from './balao';

describe('textoCurto', () => {
  it('texto curto (≤ 24 chars) não é alterado', () => {
    expect(textoCurto('Lendo default.json')).toBe('Lendo default.json');
    expect(textoCurto('a'.repeat(LIMITE_TEXTO_BALAO))).toBe('a'.repeat(LIMITE_TEXTO_BALAO));
  });

  it('acima de 24 chars, corta em 24 e anexa "…"', () => {
    expect(textoCurto('x'.repeat(LIMITE_TEXTO_BALAO + 6))).toBe('x'.repeat(LIMITE_TEXTO_BALAO) + '…');
    expect(textoCurto('Buscando dependências do buildagent inteiro')).toBe('Buscando dependências do…');
    // Espaço na borda do corte é apertado antes de anexar o "…" (sem "… " solto no fim).
    expect(textoCurto('a b c d e f g h i j k l m n o p q r s t u')).toBe('a b c d e f g h i j k l…');
  });

  it('texto só com espaços → vazio', () => {
    expect(textoCurto('   ')).toBe('');
  });
});

describe('textoBalao', () => {
  it('working com título → título curto', () => {
    expect(textoBalao('working', 'Lendo default.json', 'mesa', false)).toBe('Lendo default.json');
    expect(textoBalao('working', 'Buscando dependências do buildagent inteiro', 'mesa', false)).toBe('Buscando dependências do…');
  });

  it('working sem título → "Pensando…"', () => {
    expect(textoBalao('working', '', 'mesa', false)).toBe('Pensando…');
  });

  it('modo conteúdo devolve o genérico (nunca o título)', () => {
    expect(textoBalao('working', 'Lendo default.json', 'mesa', true)).toBe('Trabalhando…');
    expect(textoBalao('working', '', 'mesa', true)).toBe('Trabalhando…');
  });

  it('waiting → "!" (mesmo no modo conteúdo — genérico já)', () => {
    expect(textoBalao('waiting', 'x', undefined, false)).toBe('!');
    expect(textoBalao('waiting', 'x', undefined, true)).toBe('!');
  });

  it('idle e done → "zZz" na copa', () => {
    expect(textoBalao('idle', '', 'copa', false)).toBe('zZz');
    expect(textoBalao('done', '', 'copa', false)).toBe('zZz');
  });

  it('idle e done → balão da vida social por destino (4.5)', () => {
    for (const estado of ['idle', 'done'] as const) {
      expect(textoBalao(estado, '', 'tv', false)).toBe('Assistindo');
      expect(textoBalao(estado, '', 'fliperama', false)).toBe('Fliperama');
      expect(textoBalao(estado, '', 'pingpong', false)).toBe('Ping-pong');
      expect(textoBalao(estado, '', 'estante', false)).toBe('Folheando um livro');
      // lounge e conversa (e demais destinos): sem balão.
      expect(textoBalao(estado, '', 'lounge', false)).toBe('');
      expect(textoBalao(estado, '', 'conversa', false)).toBe('');
      expect(textoBalao(estado, '', 'mesa', false)).toBe('');
      expect(textoBalao(estado, '', undefined, false)).toBe('');
    }
  });

  it('tv com gol → "GOOOL!" (só no destino tv)', () => {
    expect(textoBalao('idle', '', 'tv', false, true)).toBe('GOOOL!');
    expect(textoBalao('done', '', 'tv', false, true)).toBe('GOOOL!');
    expect(textoBalao('idle', '', 'fliperama', false, true)).toBe('Fliperama');
    // gol sem destino ou em destino sem balão não produz texto.
    expect(textoBalao('idle', '', undefined, false, true)).toBe('');
  });

  it('shell/offline → sem balão (shell cortado do escopo v1)', () => {
    expect(textoBalao('shell', 'x', undefined, false)).toBe('');
    expect(textoBalao('offline', 'x', undefined, false)).toBe('');
  });
});
