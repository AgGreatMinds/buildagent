// Testes do ícone monocromático da atividade (lista de agentes): todo tipo do protocolo
// tem desenho, o traço segue a cor do CSS (currentColor) e a saída é determinística.
import { describe, expect, it } from 'vitest';
import { iconeDaAtividade } from './icone-atividade';
import type { ActivityKind } from '../../../shared/types';

const TIPOS: ActivityKind[] = [
  'prompt', 'think', 'respond', 'read', 'search', 'edit', 'write', 'run', 'test', 'git', 'web',
  'browser', 'plan', 'delegate', 'communicate', 'ask', 'mcp', 'skill', 'wait', 'error', 'compact', 'done', 'other',
];

describe('iconeDaAtividade', () => {
  it('todo tipo devolve um SVG 16×16 em currentColor, escondido do leitor de tela', () => {
    for (const t of TIPOS) {
      const svg = iconeDaAtividade(t);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('viewBox="0 0 16 16"');
      expect(svg).toContain('stroke="currentColor"');
      expect(svg).toContain('aria-hidden="true"');
    }
  });

  it('tipos irmãos dividem a forma; tipos diferentes não', () => {
    expect(iconeDaAtividade('edit')).toBe(iconeDaAtividade('write'));
    expect(iconeDaAtividade('web')).toBe(iconeDaAtividade('browser'));
    expect(iconeDaAtividade('read')).not.toBe(iconeDaAtividade('search'));
  });

  it('tipo desconhecido (protocolo novo) cai no ponto em vez de quebrar', () => {
    expect(iconeDaAtividade('novo' as ActivityKind)).toBe(iconeDaAtividade('other'));
  });
});
