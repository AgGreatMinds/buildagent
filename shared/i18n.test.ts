// Portado de marmottajr/habblaud@faa1a01 shared/i18n.test.ts (MIT)
import { afterEach, describe, expect, it } from 'vitest';
// Cortado: shared/locales/{en,es,fr} não foram portados; testes de tradução e lacunas dos dicionários removidos junto.
import { getLocale, intlLocale, normalizeLocale, serverLocale, setLocale, tr } from './i18n';

describe('i18n', () => {
  afterEach(() => setLocale('pt-BR'));

  it('os testes rodam em PT, qualquer que seja o idioma da máquina', () => {
    expect(getLocale()).toBe('pt-BR');
  });

  it('reconhece os formatos de idioma do navegador e do sistema', () => {
    expect(normalizeLocale('fr')).toBe('fr');
    expect(normalizeLocale('fr-CA')).toBe('fr');
    expect(normalizeLocale('fr_FR.UTF-8')).toBe('fr');
    expect(normalizeLocale('pt')).toBe('pt-BR');
    expect(normalizeLocale('pt_PT')).toBe('pt-BR');
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('es_AR.UTF-8')).toBe('es');
    expect(normalizeLocale('de-DE')).toBeUndefined();
    expect(normalizeLocale('')).toBeUndefined();
    expect(normalizeLocale(null)).toBeUndefined();
  });

  it('em PT devolve o próprio texto, com as lacunas preenchidas', () => {
    expect(tr('Lendo {0}', ['app.ts'])).toBe('Lendo app.ts');
    expect(tr('Texto que ninguém traduziu')).toBe('Texto que ninguém traduziu');
  });

  it('em francês o texto de origem volta sem tradução (dicionários cortados)', () => {
    setLocale('fr');
    expect(tr('Lendo {0}', ['app.ts'])).toBe('Lendo app.ts');
    expect(tr('Texto que ninguém traduziu')).toBe('Texto que ninguém traduziu');
    expect(intlLocale()).toBe('fr-FR');
  });

  it('lacunas sem argumento ficam como estão (as nomeadas são preenchidas por quem chama)', () => {
    expect(tr('Ganhei de {a} a {b}! 🏆')).toBe('Ganhei de {a} a {b}! 🏆');
    expect(tr('{0} e {1}', ['um'])).toBe('um e {1}');
  });

  it('servidor: HABBLAUD_LANG vale para qualquer idioma; do sistema, o inglês não conta', () => {
    expect(serverLocale({ HABBLAUD_LANG: 'en' }, 'pt-BR')).toBe('en');
    expect(serverLocale({ HABBLAUD_LANG: 'es-MX', LANG: 'fr_FR.UTF-8' })).toBe('es');
    // Mac com LANG em inglês e o container sem LANG (Intl en-US): o escritório fica em português.
    expect(serverLocale({ LANG: 'en_US.UTF-8' }, 'en-US')).toBe('pt-BR');
    expect(serverLocale({}, 'en-US')).toBe('pt-BR');
    expect(serverLocale({ LANG: 'en_US.UTF-8' }, 'pt-BR')).toBe('pt-BR');
    expect(serverLocale({ LANG: 'fr_FR.UTF-8' })).toBe('fr');
    expect(serverLocale({ LC_ALL: 'es_ES.UTF-8', LANG: 'en_US.UTF-8' })).toBe('es');
    expect(serverLocale({}, 'es-AR')).toBe('es');
  });

  it('inglês e espanhol usam o formato de data do idioma', () => {
    setLocale('en');
    expect(intlLocale()).toBe('en-US');
    setLocale('es');
    expect(intlLocale()).toBe('es');
  });
});
