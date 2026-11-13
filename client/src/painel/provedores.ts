// Selo do provedor da faixa "Contas · uso".
// Puro: SVG inline 16×16 sem DOM e sem dado do usuário (string estática — a
// injeção via innerHTML é segura porque o conteúdo não tem input externo).
// Formas: Claude = estrela de 8 raios laranja · Codex = nó/hexágono cobalto · OpenCode = "O" em verde.
// Cores da identidade do painel (laranja #f4682a, cobalto #2e7fd4); o verde
// do OpenCode é um acento neutro (a identidade não tem token de verde).
import type { Provider } from '../../../shared/types';

/**
 * Estrela laranja do Claude: 8 raios de ponta redonda saindo do centro, os
 * diagonais mais curtos (lembra a faísca da marca sem copiar o desenho).
 * Traço 1.6 em grade de 16 → nítido a 12–14 px.
 */
function seloClaude(): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="#f4682a" stroke-width="1.6" stroke-linecap="round">' +
    '<path d="M8 8V1.6M8 8v6.4M8 8h6.4M8 8H1.6M8 8l3.8-3.8M8 8l-3.8 3.8M8 8l3.8 3.8M8 8 4.2 4.2"/>' +
    '</svg>'
  );
}

/** Nó/hexágono cobalto do Codex: hex contornado + ponto central. */
function seloCodex(): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="#2e7fd4" stroke-width="1.3" stroke-linejoin="round">' +
    '<path d="M8 1.6 13.6 4.8v6.4L8 14.4 2.4 11.2V4.8L8 1.6z"/>' +
    '<circle cx="8" cy="8" r="1.7" fill="#2e7fd4" stroke="none"/>' +
    '</svg>'
  );
}

/** "O" em quadrado verde do OpenCode: quadrado arredondado contornado + anel. */
function seloOpenCode(): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="#3fae7a" stroke-width="1.3">' +
    '<rect x="1.8" y="1.8" width="12.4" height="12.4" rx="3"/>' +
    '<circle cx="8" cy="8" r="3.2" stroke-width="1.5"/>' +
    '</svg>'
  );
}

/** "π" em quadrado roxo do Pi: quadrado arredondado contornado + a letra em traço. */
function seloPi(): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="#8f7ae0" stroke-width="1.3" stroke-linecap="round">' +
    '<rect x="1.8" y="1.8" width="12.4" height="12.4" rx="3"/>' +
    '<path d="M4.6 6h6.8M6.4 6v4.6M9.6 6v3.4c0 .8.4 1.2 1.1 1.2" stroke-width="1.5"/>' +
    '</svg>'
  );
}

/**
 * Selo quadrado do provedor (o chamador decide o tamanho via CSS).
 * `aria-hidden`: o nome do provedor já vem no texto ao lado. Determinístico:
 * mesmo provedor → mesmo SVG.
 */
export function seloDoProvedor(provedor: Provider): string {
  switch (provedor) {
    case 'claude':
      return seloClaude();
    case 'codex':
      return seloCodex();
    case 'opencode':
      return seloOpenCode();
    case 'pi':
      return seloPi();
  }
}
