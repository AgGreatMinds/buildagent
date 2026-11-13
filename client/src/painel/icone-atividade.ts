// Ícone monocromático da atividade de um agente (segunda linha da lista).
// O snapshot traz um emoji por atividade; na lista ele não serve: emoji não aceita a cor do
// estado, muda de desenho entre sistemas e grita mais que o texto. Aqui cada tipo de atividade
// (ActivityKind) vira um traço 16×16 em `currentColor` — a linha pinta na cor do estado.
// Puro: string SVG estática, sem DOM e sem dado do usuário (seguro para innerHTML).
import type { ActivityKind } from '../../../shared/types';

/** Traços (conteúdo do <svg>) por forma; vários tipos compartilham a mesma forma. */
const FORMAS = {
  // Balão de fala: responder, receber instrução, falar com outro agente.
  balao: '<path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5v5A1.5 1.5 0 0 1 11.5 11H7l-3 2.2V11h0A1 1 0 0 1 3 10z"/>',
  // Faísca de 4 pontas: pensando.
  faisca: '<path d="M8 2.5c.4 2.6 1.9 4.1 4.5 4.5-2.6.4-4.1 1.9-4.5 4.5-.4-2.6-1.9-4.1-4.5-4.5 2.6-.4 4.1-1.9 4.5-4.5z"/>',
  // Página com linhas: lendo.
  pagina: '<path d="M4.5 2.5h4.8L12 5.2v8.3H4.5z"/><path d="M6.5 8h3.5M6.5 10.5h3.5"/>',
  // Lupa: buscando.
  lupa: '<circle cx="7" cy="7" r="3.8"/><path d="m10 10 3 3"/>',
  // Lápis: editando/escrevendo arquivo.
  lapis: '<path d="m10.2 3.3 2.5 2.5-6.9 6.9-3.1.6.6-3.1z"/>',
  // Terminal ">_": comando no shell.
  terminal: '<path d="m3.5 5 3 3-3 3"/><path d="M8.5 11.5h4"/>',
  // Frasco: testes.
  frasco: '<path d="M6.3 2.8h3.4M7 3v3.6L3.8 12a1 1 0 0 0 .9 1.5h6.6a1 1 0 0 0 .9-1.5L9 6.6V3"/><path d="M5.3 9.8h5.4"/>',
  // Ramo do git: dois nós e a ligação.
  ramo: '<circle cx="5" cy="4" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="6" r="1.5"/><path d="M5 5.5v5M11 7.5c0 2-2 2.5-6 3"/>',
  // Globo: web e navegador.
  globo: '<circle cx="8" cy="8" r="5.3"/><path d="M2.7 8h10.6M8 2.7c1.6 1.5 2.3 3.3 2.3 5.3S9.6 11.8 8 13.3C6.4 11.8 5.7 10 5.7 8S6.4 4.2 8 2.7z"/>',
  // Lista com marcadores: planejamento/tarefas.
  lista: '<path d="M6.5 4.5h6M6.5 8h6M6.5 11.5h6"/><path d="M3.5 4.5h.01M3.5 8h.01M3.5 11.5h.01" stroke-width="2"/>',
  // Bifurcação: disparou subagente(s).
  bifurca: '<path d="M8 13.5V9m0 0L4 4.5M8 9l4-4.5"/><path d="M3 7V4h3M13 7V4h-3"/>',
  // Interrogação no círculo: pergunta ao usuário / espera resposta.
  pergunta: '<circle cx="8" cy="8" r="5.3"/><path d="M6.5 6.4a1.6 1.6 0 1 1 2.2 1.5c-.5.2-.7.6-.7 1.1v.3"/><path d="M8 11.2h.01" stroke-width="2"/>',
  // Relógio: esperando.
  relogio: '<circle cx="8" cy="8" r="5.3"/><path d="M8 5v3.2l2 1.3"/>',
  // Tomada: ferramenta MCP / skill.
  tomada: '<path d="M6 2.8v2.7M10 2.8v2.7M4.5 5.5h7v2a3.5 3.5 0 0 1-7 0z"/><path d="M8 11v2.5"/>',
  // Triângulo de alerta: erro.
  alerta: '<path d="M8 2.8 13.5 12.5h-11z"/><path d="M8 6.6v2.8"/><path d="M8 11h.01" stroke-width="2"/>',
  // Setas para dentro: compactação de contexto.
  compacta: '<path d="M3 6h3V3M13 6h-3V3M3 10h3v3M13 10h-3v3"/>',
  // Visto: terminou o turno.
  visto: '<path d="m3.5 8.3 2.8 2.8 6.2-6.2"/>',
  // Ponto: atividade sem tipo próprio.
  ponto: '<circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none"/>',
} as const;

/** Tipo de atividade → forma. Tipo novo no protocolo cai em `ponto` até ganhar desenho. */
const FORMA_DO_TIPO: Record<ActivityKind, keyof typeof FORMAS> = {
  prompt: 'balao',
  respond: 'balao',
  communicate: 'balao',
  think: 'faisca',
  read: 'pagina',
  search: 'lupa',
  edit: 'lapis',
  write: 'lapis',
  run: 'terminal',
  test: 'frasco',
  git: 'ramo',
  web: 'globo',
  browser: 'globo',
  plan: 'lista',
  delegate: 'bifurca',
  ask: 'pergunta',
  wait: 'relogio',
  mcp: 'tomada',
  skill: 'tomada',
  error: 'alerta',
  compact: 'compacta',
  done: 'visto',
  other: 'ponto',
};

/** SVG 16×16 do tipo de atividade, traço em currentColor (o CSS decide tamanho e cor). */
export function iconeDaAtividade(tipo: ActivityKind): string {
  const forma = FORMAS[FORMA_DO_TIPO[tipo] ?? 'ponto'];
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" ' +
    'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' +
    forma +
    '</svg>'
  );
}
