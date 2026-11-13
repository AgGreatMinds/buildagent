// Testes de prefs.ts (sem DOM): sanitização campo a campo + storage injetado.
// Mesmos casos do plano: padrão sem chave, JSON corrompido, volume fora de
// range, idioma inválido e flag desconhecida — tudo em node.
import { describe, expect, it } from 'vitest';
import { CHAVE_PREFS, gravarPrefs, lerPrefs, PREFS_PADRAO, sanitizarPrefs } from './prefs';

/** Storage falso em memória (a interface que lerPrefs/gravarPrefs aceitam). */
class FakeStorage {
  private map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, String(v));
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
}

describe('sanitizarPrefs', () => {
  it('nulo/ausente → padrão completo', () => {
    expect(sanitizarPrefs(null)).toEqual(PREFS_PADRAO);
    expect(sanitizarPrefs(undefined)).toEqual(PREFS_PADRAO);
    expect(sanitizarPrefs('x')).toEqual(PREFS_PADRAO);
  });

  it('idioma fora do enum → "pt"', () => {
    expect(sanitizarPrefs({ idioma: 'xx' })).toEqual(PREFS_PADRAO);
    expect(sanitizarPrefs({ idioma: 'en' }).idioma).toBe('en');
  });

  it('volume fora de range é clampado a 0–1; NaN → padrão', () => {
    expect(sanitizarPrefs({ volume: 3 }).volume).toBe(1);
    expect(sanitizarPrefs({ volume: -2 }).volume).toBe(0);
    expect(sanitizarPrefs({ volume: Number.NaN }).volume).toBe(PREFS_PADRAO.volume);
    expect(sanitizarPrefs({ volume: 0.4 }).volume).toBe(0.4);
  });

  it('booleano com valor errado (ex.: "true") → padrão do campo', () => {
    expect(sanitizarPrefs({ som: 'true' }).som).toBe(PREFS_PADRAO.som);
    expect(sanitizarPrefs({ modoConteudo: 1 }).modoConteudo).toBe(PREFS_PADRAO.modoConteudo);
  });

  it('flag de painel desconhecida no objeto → padrão dela, resto respeitado', () => {
    const p = sanitizarPrefs({ mostrarLista: false, painelFantasma: 'x' });
    expect(p.mostrarLista).toBe(false);
    expect(p.mostrarAtividade).toBe(PREFS_PADRAO.mostrarAtividade);
  });
});

describe('lerPrefs / gravarPrefs (storage injetado)', () => {
  it('sem chave → padrão', () => {
    expect(lerPrefs(new FakeStorage())).toEqual(PREFS_PADRAO);
  });

  it('JSON corrompido → padrão (sem exceção)', () => {
    const st = new FakeStorage();
    st.setItem(CHAVE_PREFS, '{"som":');
    expect(lerPrefs(st)).toEqual(PREFS_PADRAO);
  });

  it('gravar → ler respeita cada campo; chave única', () => {
    const st = new FakeStorage();
    const p = { ...PREFS_PADRAO, som: false, volume: 0.2, idioma: 'en' as const, mostrarLista: false };
    gravarPrefs(p, st);
    expect(st.getItem(CHAVE_PREFS)).not.toBeNull();
    expect(lerPrefs(st)).toEqual(p);
  });

  it('storage ausente (node sem localStorage) → padrão, sem exceção', () => {
    expect(lerPrefs(null)).toEqual(PREFS_PADRAO);
    expect(() => gravarPrefs(PREFS_PADRAO, null)).not.toThrow();
  });
});
