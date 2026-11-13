// Testes da Frente A: selo do provedor (provedores.ts) — determinístico e
// sem DOM (string estática).
import { describe, expect, it } from 'vitest';
import { seloDoProvedor } from './provedores';

describe('seloDoProvedor', () => {
  it('cada provedor tem selo próprio: mesma entrada → mesmo SVG', () => {
    expect(seloDoProvedor('claude')).toBe(seloDoProvedor('claude'));
    expect(seloDoProvedor('codex')).not.toBe(seloDoProvedor('claude'));
    expect(seloDoProvedor('opencode')).not.toBe(seloDoProvedor('codex'));
  });

  it('selo é SVG 16×16 inline, sem input externo (string estática)', () => {
    for (const p of ['claude', 'codex', 'opencode'] as const) {
      const svg = seloDoProvedor(p);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('viewBox="0 0 16 16"');
      expect(svg).toContain('aria-hidden="true"');
    }
  });

  it('cores da identidade: laranja do Claude, cobalto do Codex, verde do OpenCode', () => {
    expect(seloDoProvedor('claude')).toContain('#f4682a');
    expect(seloDoProvedor('codex')).toContain('#2e7fd4');
    expect(seloDoProvedor('opencode')).toContain('#3fae7a');
  });
});
