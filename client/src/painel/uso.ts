// Adaptado de marmottajr/habblaud@faa1a01 ui/usage.ts + ui/format.ts (MIT)
// Faixa "Contas · uso" sob a barra superior: cada conta com número vira um cartão
// legível — logo, nome, PLANO em etiqueta, duas medidas (5 h e semana) com barra de
// 4 px e % tabular, e "reinicia em" visível para a janela mais apertada; o cartão
// assume o nível dessa janela (crítico salta, ok fica calmo). Contas sem número
// encolhem para chips no fim. Não coube: a fileira rola na horizontal com as bordas
// esmaecidas (nunca corta seco, nunca muda de altura). ABERTA por padrão, recolhível
// a uma linha de ~28 px com o pior % de 5 h e de semana (chevron da faixa + botão
// "Contas · uso" da barra; estado em localStorage).
// Lógica pura (agrupar por provedor, estado da conta, vista da janela, resumo
// compacto) fica exportada e testada em uso.test.ts; aqui só o DOM. Strings em
// texto.ts; estilo em uso-faixa.css (tokens em identidade.css --ia-*).
// Posição: a faixa lê --barra-h (publicada por barra.ts via ResizeObserver) para
// ficar logo abaixo da barra; nada lê a altura da faixa (não há observer aqui).
// Cortado do original: tip com dl/diálogo longo, janelas Opus/Sonnet e o widget de chip grande.
import type { AccountInfo, Provider, UsageWindow } from '../../../shared/types';
import { seloDoProvedor } from './provedores';
import { texto } from './texto';
import './uso-faixa.css';

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

/** Janelas que a faixa mostra (as de Opus/Sonnet foram cortadas). */
export const JANELA_5H_MS = 5 * HORA;
export const JANELA_SEMANA_MS = 7 * DIA;

/** Chave do estado aberto/recolhido no localStorage (escolha de Frente A; sem storage → aberta). */
export const CHAVE_USO_ABIERTO = 'buildagent.usoAberto';

/**
 * Contas agrupadas por provedor, na ordem fixa Claude → Codex → OpenCode → Pi.
 * `provider` ausente = 'claude' (regra do protocolo em shared/types.ts).
 */
export function agruparPorProvedor(
  contas: AccountInfo[] | undefined,
): Array<{ provedor: Provider; contas: AccountInfo[] }> {
  const grupos: Record<Provider, AccountInfo[]> = { claude: [], codex: [], opencode: [], pi: [] };
  for (const a of contas ?? []) grupos[a.provider ?? 'claude'].push(a);
  return (['claude', 'codex', 'opencode', 'pi'] as const)
    .map((provedor) => ({ provedor, contas: grupos[provedor] }))
    .filter((g) => g.contas.length > 0);
}

/**
 * Estado efetivo da conta (regra idêntica à cardState do projeto de origem):
 * "sem cota" vem antes — a leitura não traz janelas, mas não é "sem dados";
 * leitura sem nenhuma das janelas vale como "sem dados".
 */
export type EstadoConta = 'dados' | 'stale' | 'sem-dados' | 'sem-cota';

export function estadoDaConta(a: Pick<AccountInfo, 'usage' | 'usageStatus'>): EstadoConta {
  if (a.usage?.noQuota) return 'sem-cota';
  const temJanelas = !!a.usage && !!(a.usage.fiveHour || a.usage.sevenDay);
  if (!temJanelas) return 'sem-dados';
  return a.usageStatus === 'ok' ? 'dados' : 'stale';
}

/**
 * Apresentação de uma janela de uso (5 h ou semana), já considerando a idade
 * dos números: sem horário de reinício, leitura mais velha que a duração da
 * janela não vale mais (a janela certamente renovou) — e renovada (por
 * `resetsAt` no passado ou por idade) nunca inventa percentual.
 */
export interface VistaJanela {
  /** Percentual 0–100; null quando a janela renovou depois da leitura. */
  pct: number | null;
  /** A janela já reiniciou desde que os números foram lidos. */
  renovada: boolean;
  /** "em 30 min" / "em 1 h 30 min" / "em 2 d"; '' sem `resetsAt`. */
  reset: string;
}

export function vistaJanela(
  win: UsageWindow | undefined,
  fetchedAt: number,
  agora: number,
  windowMs: number,
): VistaJanela | null {
  if (!win) return null;
  const resetsAt = win.resetsAt !== undefined && Number.isFinite(win.resetsAt) ? win.resetsAt : undefined;
  const renovada = resetsAt !== undefined ? resetsAt <= agora : agora - fetchedAt >= windowMs;
  if (renovada) return { pct: null, renovada: true, reset: '' };
  const pct = Math.round(Math.min(100, Math.max(0, win.utilization)));
  if (resetsAt === undefined) return { pct, renovada: false, reset: '' };
  const diff = resetsAt - agora;
  if (diff < HORA) return { pct, renovada: false, reset: `em ${Math.max(1, Math.ceil(diff / MIN))} min` };
  if (diff < DIA) {
    const h = Math.floor(diff / HORA);
    const m = Math.floor((diff % HORA) / MIN);
    return { pct, renovada: false, reset: m ? `em ${h} h ${m} min` : `em ${h} h` };
  }
  return { pct, renovada: false, reset: `em ${Math.ceil(diff / DIA)} d` };
}

/**
 * Faixa de cor do uso (régua da faixa refinada): cobalto < 70%, laranja 70–89%,
 * vermelho ≥ 90%. Frio enquanto há folga; o quente só aparece quando aperta.
 */
export function nivelDoUso(pct: number): 'ok' | 'warn' | 'crit' {
  if (pct >= 90) return 'crit';
  if (pct >= 70) return 'warn';
  return 'ok';
}

/** Trecho compacto de uma conta na linha recolhida: `5h 32% · sem 62%`. */
export interface TrechoUso {
  /** `5h 32%`; `5h —` sem dado. Vazio com `semLimite`. */
  janela5h: string;
  /** `sem 62%`; `sem —` sem dado. Vazio com `semLimite`. */
  semana: string;
  /** OpenCode sem dados: a linha mostra "sem limite de uso informado" (texto vem de texto.ts). */
  semLimite: boolean;
}

/** Ponto de resumo compacto de uma janela para a linha recolhida: só o pct. */
function pontoJanela(v: VistaJanela | null): number | null {
  return v ? v.pct : null;
}

/**
 * Resumo compacto de uma conta (modo recolhido da faixa): "5h 32% · sem 62%".
 * Puro: sem DOM. Sem número (janela ausente, renovada ou sem leitura) → '—';
 * OpenCode sem dados não tem conceito de limite: `semLimite` (a UI mostra o texto).
 */
export function resumoCompactoUso(a: Pick<AccountInfo, 'provider' | 'usage' | 'usageStatus'>, agora: number): TrechoUso {
  const estado = estadoDaConta(a);
  const semLimite = (a.provider === 'opencode' || a.provider === 'pi') && estado !== 'dados' && estado !== 'stale';
  const mostra = (estado === 'dados' || estado === 'stale') && !!a.usage;
  let cinco: string;
  let semana: string;
  if (!mostra || !a.usage) {
    cinco = '5h —';
    semana = 'sem —';
  } else {
    const u = a.usage;
    const p5 = pontoJanela(vistaJanela(u.fiveHour, u.fetchedAt, agora, JANELA_5H_MS));
    const p7 = pontoJanela(vistaJanela(u.sevenDay, u.fetchedAt, agora, JANELA_SEMANA_MS));
    cinco = p5 === null ? '5h —' : `5h ${p5}%`;
    semana = p7 === null ? 'sem —' : `sem ${p7}%`;
  }
  if (semLimite) {
    cinco = '';
    semana = '';
  }
  return { janela5h: cinco, semana, semLimite };
}

/** Conta tem números para cartão (barras) — o resto vira chip compacto no fim da faixa. */
export function temNumeros(a: Pick<AccountInfo, 'usage' | 'usageStatus'>): boolean {
  const e = estadoDaConta(a);
  return e === 'dados' || e === 'stale';
}

/**
 * Ordem da faixa: cartões com número primeiro — o mais apertado na frente (crítico → atenção →
 * ok), para que a conta perto do limite nunca fique escondida atrás da rolagem — e chips sem
 * número no fim. Empates: ordem fixa de provedor (Claude → Codex → OpenCode → Pi) e a do snapshot.
 */
export function ordemDaFaixa<T extends Pick<AccountInfo, 'provider' | 'usage' | 'usageStatus'>>(contas: T[] | undefined, agora: number): T[] {
  const ordemProv: Record<Provider, number> = { claude: 0, codex: 1, opencode: 2, pi: 3 };
  const pesoNivel = { crit: 3, warn: 2, ok: 1 } as const;
  // Peso: 0 = sem número (chip); 1–3 = nível da janela mais apertada.
  const peso = (c: T): number => {
    if (!temNumeros(c)) return 0;
    const ap = janelaMaisApertada(c, agora);
    return ap ? pesoNivel[nivelDoUso(ap.pct)] : 1;
  };
  return (contas ?? [])
    .map((c, i) => ({ c, i, p: peso(c) }))
    .sort((x, y) => y.p - x.p || ordemProv[x.c.provider ?? 'claude'] - ordemProv[y.c.provider ?? 'claude'] || x.i - y.i)
    .map((x) => x.c);
}

/** A janela mais apertada de uma conta: a de maior % (empate → a que tem reinício conhecido; depois a de 5 h). */
export interface JanelaApertada {
  qual: '5h' | 'semana';
  pct: number;
  /** "em 2 h 14 min"; '' sem `resetsAt` (a interface omite o "reinicia"). */
  reset: string;
}

export function janelaMaisApertada(a: Pick<AccountInfo, 'usage'>, agora: number): JanelaApertada | null {
  const u = a.usage;
  if (!u) return null;
  const v5 = vistaJanela(u.fiveHour, u.fetchedAt, agora, JANELA_5H_MS);
  const v7 = vistaJanela(u.sevenDay, u.fetchedAt, agora, JANELA_SEMANA_MS);
  const c5 = v5 && v5.pct !== null ? { qual: '5h' as const, pct: v5.pct, reset: v5.reset } : null;
  const c7 = v7 && v7.pct !== null ? { qual: 'semana' as const, pct: v7.pct, reset: v7.reset } : null;
  // Empate de %: vale a janela cujo reinício se conhece (é a que dá para mostrar); senão a de 5 h.
  if (c5 && c7) return c7.pct > c5.pct || (c7.pct === c5.pct && !c5.reset && !!c7.reset) ? c7 : c5;
  return c5 ?? c7;
}

/** Uma pílula do resumo recolhido: uma conta com limite e a janela mais apertada DELA. */
export interface PilulaResumo {
  id: string;
  conta: string;
  provedor: Provider;
  pct: number;
  nivel: 'ok' | 'warn' | 'crit';
  qual: '5h' | 'semana';
  reset: string;
}

/**
 * Resumo da faixa recolhida: uma pílula por conta com número (nunca mistura janelas de contas
 * diferentes), da mais apertada para a mais folgada; empate mantém a ordem do snapshot.
 * Conta sem limite ou sem dados não entra — não há número para resumir.
 */
export function resumoPorConta(
  contas: Pick<AccountInfo, 'id' | 'name' | 'provider' | 'usage' | 'usageStatus'>[] | undefined,
  agora: number,
): PilulaResumo[] {
  const r: PilulaResumo[] = [];
  for (const a of contas ?? []) {
    if (!temNumeros(a)) continue;
    const ap = janelaMaisApertada(a, agora);
    if (!ap) continue; // números todos renovados depois da leitura: nada a mostrar
    r.push({ id: a.id, conta: a.name, provedor: a.provider ?? 'claude', pct: ap.pct, nivel: nivelDoUso(ap.pct), qual: ap.qual, reset: ap.reset });
  }
  return r.map((p, i) => [p, i] as const).sort((x, y) => y[0].pct - x[0].pct || x[1] - y[1]).map(([p]) => p);
}

export interface ApiUso {
  /** Elemento raiz da faixa (anexada ao body por montarUso). */
  raiz: HTMLElement;
  /** Recolhe/abre a faixa (o botão "Contas · uso" da barra chama isto). */
  alternar(): void;
  /** Repinta os cartões com as contas de um snapshot novo (a cada snapshot do stream). */
  atualizar(contas: AccountInfo[] | undefined, agora: number): void;
  /** Remove a faixa (e o diálogo) do DOM. */
  fecha(): void;
}

/** Uma medida (5 h ou semana): só as partes que mudam a cada pintura. */
interface RefsMedida {
  raiz: HTMLElement;
  preench: HTMLElement;
  pct: HTMLElement;
  /** Nome longo da janela ("5 h" / "Semana") para a dica, o leitor de tela e o "reinicia". */
  nomeLongo: string;
}

/** Partes de uma conta. O mesmo elemento vira cartão (com números) ou chip compacto (sem). */
interface RefsConta {
  nome: HTMLElement;
  /** Etiqueta do plano ("Max", "Plus"); some sem `plan`. */
  plano: HTMLElement;
  /** Pontinho de leitura antiga (estado 'stale'); dica no title. */
  pontoAntigo: HTMLElement;
  /** Número-herói: o % da janela mais apertada, o maior elemento do cartão. */
  heroi: HTMLElement;
  heroiPct: HTMLElement;
  /** "semana · reinicia em 2 d" ao lado do herói: qual janela é e quando zera (sem reinício, só a janela). */
  heroiLegenda: HTMLElement;
  m5: RefsMedida;
  m7: RefsMedida;
  /** Chip: "sem dados" / "sem cota" / "sem limite". */
  msg: HTMLElement;
  /** Chip: "?" que abre o "Como ativar" (só onde ativar faz sentido). */
  btnComo: HTMLButtonElement;
}

/** Lê o estado aberto/recolhido do localStorage (falta storage = aberta por padrão). */
function lerAberto(): boolean {
  try {
    const v = localStorage.getItem(CHAVE_USO_ABIERTO);
    // '0' é recolhido; ausente/valor estranho → aberta.
    return v === null || v !== '0';
  } catch {
    return true;
  }
}

/** Grava o estado (sem storage = só vale pra sessão; não pode quebrar a UI). */
function gravarAberto(aberto: boolean): void {
  try {
    localStorage.setItem(CHAVE_USO_ABIERTO, aberto ? '1' : '0');
  } catch {
    // storage indisponível (modo privado/cheio): estado só em memória.
  }
}

/**
 * Folga (px) a acrescentar no fim da fileira para a rolagem TERMINAR com um cartão alinhado à
 * esquerda. Sem ela, o fim natural parava no meio de um cartão (metade das barras, sem o nome da
 * conta). `inicios` são as posições de início dos cartões no conteúdo; `recuo` é o scroll-padding.
 * Devolve 0 quando tudo cabe ou quando o fim natural já coincide com uma parada.
 */
export function folgaFinalDaFaixa(inicios: number[], larguraConteudo: number, larguraVisivel: number, recuo: number): number {
  const fimNatural = larguraConteudo - larguraVisivel; // o quanto dá para rolar sem folga
  if (!(fimNatural > 1)) return 0;
  // Paradas de alinhamento: o início de cada cartão, menos o recuo (o primeiro para em 0).
  const parada = inicios.map((x) => Math.max(0, x - recuo)).find((x) => x >= fimNatural - 1);
  return parada === undefined ? 0 : Math.max(0, parada - fimNatural);
}

export function montarUso(): ApiUso {
  const t = texto.uso;

  // ---------- esqueleto do DOM: [cartões que rolam] [resumo recolhido] [chevron] + diálogo ----------
  const raiz = document.createElement('div');
  raiz.className = 'painel-uso painel';
  raiz.setAttribute('role', 'region');
  raiz.setAttribute('aria-label', t.tituloPainel);

  // Cartões lado a lado; quando não cabem, a fileira rola na horizontal (um cartão por vez, com
  // snap), a borda com conta escondida esmaece (rola-ini/rola-fim, ver medirRolagem) e as setas
  // ‹ › aparecem numa coluna própria à direita, FORA da área que rola — nunca cobrem um cartão.
  // As duas setas reservam o lugar juntas (a largura não pula ao rolar); a do lado sem mais
  // conta fica desabilitada e invisível.
  const trilhoFaixa = document.createElement('div');
  trilhoFaixa.className = 'painel-uso-trilho';
  const corpo = document.createElement('div');
  corpo.className = 'painel-uso-corpo';
  /** Seta de rolagem (SVG estático): só aparece no lado em que ainda há conta escondida. */
  const criarSeta = (lado: 'ini' | 'fim', rotulo: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `painel-uso-seta painel-uso-seta-${lado}`;
    b.title = rotulo;
    b.setAttribute('aria-label', rotulo);
    b.innerHTML =
      lado === 'ini'
        ? '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 3 4.5 6l3 3"/></svg>'
        : '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 3 3 3-3 3"/></svg>';
    b.disabled = true;
    b.addEventListener('click', () => rolarUmCartao(lado === 'fim'));
    return b;
  };
  const setaIni = criarSeta('ini', t.contasAnteriores);
  const setaFim = criarSeta('fim', t.maisContas);
  const setas = document.createElement('div');
  setas.className = 'painel-uso-setas';
  setas.hidden = true; // só existe quando a fileira transborda
  setas.append(setaIni, setaFim);
  trilhoFaixa.append(corpo, setas);
  const vazio = document.createElement('p');
  vazio.className = 'painel-uso-vazio';
  vazio.textContent = t.vazio;
  // Resumo da faixa recolhida: uma pílula por conta com limite, da mais apertada à mais folgada (resumoPorConta, puro).
  const resumo = document.createElement('div');
  resumo.className = 'painel-uso-resumo';
  const btnRecolher = document.createElement('button');
  btnRecolher.type = 'button';
  btnRecolher.className = 'painel-uso-recolher';
  // Chevron em SVG estático (sem dado externo): gira 180° no modo recolhido via CSS.
  btnRecolher.innerHTML =
    '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5 6 4.5l3 3"/></svg>';
  raiz.append(trilhoFaixa, resumo, btnRecolher);

  // Diálogo "Como ativar": <dialog> + showModal (mesmo padrão de ajuda.ts) —
  // clique no fundo fecha, Esc já fecha; o botão "✕" fecha também.
  const dialog = document.createElement('dialog');
  dialog.className = 'painel-uso-dialogo painel';
  const dialogCab = document.createElement('div');
  dialogCab.className = 'painel-uso-dialogo-cab';
  const dialogTitulo = document.createElement('h2');
  dialogTitulo.id = 'painel-uso-dialogo-titulo';
  dialogTitulo.textContent = t.dialogo.titulo;
  const dialogFechar = document.createElement('button');
  dialogFechar.type = 'button';
  dialogFechar.className = 'painel-botoes';
  dialogFechar.title = t.dialogo.fechar;
  dialogFechar.setAttribute('aria-label', t.dialogo.fechar);
  dialogFechar.textContent = '✕';
  dialogCab.append(dialogTitulo, dialogFechar);
  const dialogCorpo = document.createElement('div');
  dialogCorpo.className = 'painel-uso-dialogo-corpo';
  for (const paragrafo of t.dialogo.corpo) {
    const par = document.createElement('p');
    par.textContent = paragrafo;
    dialogCorpo.append(par);
  }
  dialog.append(dialogCab, dialogCorpo);
  dialog.setAttribute('aria-labelledby', 'painel-uso-dialogo-titulo');
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialogFechar.addEventListener('click', () => dialog.close());
  const abrirDialogo = (): void => {
    if (!dialog.open) dialog.showModal();
  };

  // ---------- construção das contas ----------
  const cartoes = new Map<string, HTMLElement>(); // id da conta → elemento (cartão ou chip)
  const refs = new WeakMap<HTMLElement, RefsConta>();

  /** Medida: rótulo curto · trilho de 6 px · % tabular. role=meter fala "5 h, 34%, reinicia em 2 h". */
  function criarMedida(rotuloCurto: string, nomeLongo: string): RefsMedida {
    const m = document.createElement('div');
    m.className = 'painel-uso-medida';
    m.setAttribute('role', 'meter');
    m.setAttribute('aria-label', nomeLongo);
    m.setAttribute('aria-valuemin', '0');
    m.setAttribute('aria-valuemax', '100');
    const rot = document.createElement('span');
    rot.className = 'painel-uso-medida-rot';
    rot.setAttribute('aria-hidden', 'true');
    rot.textContent = rotuloCurto;
    const trilho = document.createElement('span');
    trilho.className = 'painel-uso-medida-trilho';
    trilho.setAttribute('aria-hidden', 'true');
    const preench = document.createElement('span');
    preench.className = 'painel-uso-medida-preench';
    trilho.append(preench);
    const pct = document.createElement('span');
    pct.className = 'painel-uso-medida-pct';
    pct.setAttribute('aria-hidden', 'true');
    m.append(rot, trilho, pct);
    return { raiz: m, preench, pct, nomeLongo };
  }

  function criarConta(provedor: Provider): [HTMLElement, RefsConta] {
    const el = document.createElement('div');
    el.className = 'painel-uso-cartao';

    // Logo do provedor (SVG inline via provedores.ts; conteúdo estático).
    const logo = document.createElement('span');
    logo.className = 'painel-uso-logo';
    logo.innerHTML = seloDoProvedor(provedor);

    // Coluna de identidade: [logo nome · PLANO] em cima; embaixo o herói — o % da janela mais
    // apertada em display grande — com a legenda "semana · reinicia em 2 d" (+ "leitura antiga").
    const id = document.createElement('div');
    id.className = 'painel-uso-id';
    const topo = document.createElement('div');
    topo.className = 'painel-uso-id-topo';
    const nome = document.createElement('span');
    nome.className = 'painel-uso-nome';
    const plano = document.createElement('span');
    plano.className = 'painel-uso-plano';
    topo.append(logo, nome, plano);
    const heroi = document.createElement('div');
    heroi.className = 'painel-uso-heroi';
    const heroiPct = document.createElement('span');
    heroiPct.className = 'painel-uso-heroi-pct';
    heroiPct.setAttribute('aria-hidden', 'true'); // as medidas (role=meter) já falam os números
    const heroiLegenda = document.createElement('span');
    heroiLegenda.className = 'painel-uso-heroi-legenda';
    // Leitura antiga (estado 'stale') em palavra, não em ponto: um ponto de cor ao lado do nome
    // era lido como "cor da conta". A dica diz como atualizar.
    const pontoAntigo = document.createElement('span');
    pontoAntigo.className = 'painel-uso-antigo';
    pontoAntigo.textContent = t.leituraAntiga;
    pontoAntigo.title = t.dicaAntigo;
    heroi.append(heroiPct, heroiLegenda, pontoAntigo);
    id.append(topo, heroi);

    // Medidas empilhadas: 5 h e semana (some a janela que a conta não informa).
    const m5 = criarMedida(t.janela5hCurta, t.janela5h);
    const m7 = criarMedida(t.janelaSemanaCurta, t.janelaSemana);
    const medidas = document.createElement('div');
    medidas.className = 'painel-uso-medidas';
    medidas.append(m5.raiz, m7.raiz);

    // Chip (conta sem número): "sem dados" + "?" de Como ativar / "sem cota" / "sem limite".
    const msg = document.createElement('span');
    msg.className = 'painel-uso-msg';
    const btnComo = document.createElement('button');
    btnComo.type = 'button';
    btnComo.className = 'painel-uso-como';
    btnComo.textContent = '?';
    btnComo.addEventListener('click', abrirDialogo);

    el.append(id, medidas, msg, btnComo);
    return [el, { nome, plano, pontoAntigo, heroi, heroiPct, heroiLegenda, m5, m7, msg, btnComo }];
  }

  function pintarMedida(m: RefsMedida, v: VistaJanela | null): void {
    m.raiz.classList.remove('nivel-ok', 'nivel-warn', 'nivel-crit', 'dim');
    // Janela que a conta não informa: some (nunca um "—" sem contexto).
    m.raiz.hidden = !v;
    if (!v) return;
    if (v.pct === null) {
      // Renovada depois da leitura: trilho vazio e "—" com a dica dizendo por quê — nunca inventa número.
      m.raiz.classList.add('dim');
      m.preench.style.transform = 'scaleX(0)';
      m.pct.textContent = t.semJanela;
      m.raiz.removeAttribute('aria-valuenow');
      m.raiz.setAttribute('aria-valuetext', t.renovada);
      m.raiz.title = `${m.nomeLongo} · ${t.renovada}`;
      return;
    }
    m.raiz.classList.add(`nivel-${nivelDoUso(v.pct)}`);
    // scaleX em vez de width: a mudança de valor anima só na GPU (sem reflow).
    m.preench.style.transform = `scaleX(${v.pct / 100})`;
    m.pct.textContent = `${v.pct}%`;
    const reinicio = v.reset ? `${t.reinicia} ${v.reset}` : '';
    m.raiz.setAttribute('aria-valuenow', String(v.pct));
    m.raiz.setAttribute('aria-valuetext', reinicio ? `${v.pct}%, ${reinicio}` : `${v.pct}%`);
    m.raiz.title = reinicio ? `${m.nomeLongo} · ${v.pct}% · ${reinicio}` : `${m.nomeLongo} · ${v.pct}%`;
  }

  function atualizarConta(el: HTMLElement, a: AccountInfo, agora: number): void {
    const r = refs.get(el)!;
    r.nome.textContent = a.name;
    // Plano como etiqueta quando conhecido; sem plano a etiqueta some (nada de placeholder).
    r.plano.textContent = a.plan ?? '';
    r.plano.hidden = !a.plan;
    // Dica do elemento: nome · plano/e-mail (texto puro em atributo, sem HTML).
    const sub = a.plan ?? a.email ?? '';
    el.title = sub ? `${a.name} · ${sub}` : a.name;

    const estado = estadoDaConta(a);
    const comNumeros = temNumeros(a);
    r.pontoAntigo.hidden = estado !== 'stale';
    el.classList.toggle('antigo', estado === 'stale');
    el.classList.toggle('chip', !comNumeros);
    el.classList.remove('nivel-ok', 'nivel-warn', 'nivel-crit');

    if (comNumeros && a.usage) {
      const u = a.usage; // 'dados'/'stale' implica leitura com ao menos uma janela
      pintarMedida(r.m5, vistaJanela(u.fiveHour, u.fetchedAt, agora, JANELA_5H_MS));
      pintarMedida(r.m7, vistaJanela(u.sevenDay, u.fetchedAt, agora, JANELA_SEMANA_MS));
      // Uma janela só: o herói já diz o número e a janela — a barra fica sozinha, sem repetir o
      // "94%" nem o rótulo. Com duas, a tabelinha 5h/semana mantém os dois números.
      el.classList.toggle('uma-janela', r.m5.raiz.hidden !== r.m7.raiz.hidden);
      // O cartão inteiro assume o nível da janela mais apertada: crítico salta, ok fica calmo.
      const ap = janelaMaisApertada(a, agora);
      if (ap) el.classList.add(`nivel-${nivelDoUso(ap.pct)}`);
      // Herói: o % da janela mais apertada + "semana · reinicia em 2 d" (reinício só se conhecido;
      // nenhuma projeção de esgotamento — o servidor não entrega isso e número não se inventa).
      r.heroi.hidden = !ap;
      if (ap) {
        r.heroiPct.textContent = `${ap.pct}%`;
        const nomeJanela = ap.qual === 'semana' ? t.janelaSemanaCurta : t.janela5hCurta;
        r.heroiLegenda.textContent = ap.reset ? `${nomeJanela} · ${t.reinicia} ${ap.reset}` : nomeJanela;
      }
      r.msg.hidden = true;
      r.btnComo.hidden = true;
      return;
    }
    // Chip: OpenCode/Pi não expõem cota ("sem limite", sem ação); Codex sem créditos = "sem cota";
    // o resto é "sem dados" com o "?" que explica como ligar a fonte de uso.
    const semConceitoDeCota = a.provider === 'opencode' || a.provider === 'pi';
    r.msg.hidden = false;
    r.msg.textContent = semConceitoDeCota ? t.semLimiteCurto : estado === 'sem-cota' ? t.semCota : t.semDadosCurto;
    r.msg.title = semConceitoDeCota ? t.semLimite : estado === 'sem-cota' ? t.semCota : t.semDados;
    r.btnComo.hidden = estado === 'sem-cota' || semConceitoDeCota;
    const rotuloComo = t.ariaComoAtivar.replace('{0}', a.name);
    r.btnComo.title = rotuloComo;
    r.btnComo.setAttribute('aria-label', rotuloComo);
    r.heroi.hidden = true;
    el.classList.remove('uma-janela');
  }

  // Resumo recolhido: uma pílula por conta com limite — "[logo] Codex 94% semana" —, da mais
  // apertada à mais folgada, % na cor do nível. Conta sem limite/sem dados não entra.
  function pintarResumo(contas: AccountInfo[], agora: number): void {
    const pilulas = resumoPorConta(contas, agora);
    resumo.replaceChildren();
    if (!pilulas.length) {
      const s = document.createElement('span');
      s.className = 'painel-uso-resumo-vazio';
      s.textContent = contas.length ? t.resumoVazio : t.vazio;
      resumo.append(s);
      return;
    }
    for (const p of pilulas) {
      const s = document.createElement('span');
      s.className = `painel-uso-resumo-pilula nivel-${p.nivel}`;
      const logo = document.createElement('span');
      logo.className = 'painel-uso-resumo-logo';
      logo.setAttribute('aria-hidden', 'true');
      logo.innerHTML = seloDoProvedor(p.provedor); // SVG estático de provedores.ts
      const nome = document.createElement('span');
      nome.className = 'painel-uso-resumo-conta';
      nome.textContent = p.conta;
      const pct = document.createElement('span');
      pct.className = 'painel-uso-resumo-pct';
      pct.textContent = `${p.pct}%`;
      const janela = document.createElement('span');
      janela.className = 'painel-uso-resumo-rot';
      janela.textContent = p.qual === 'semana' ? t.janelaSemanaCurta : t.janela5hCurta;
      s.append(logo, nome, pct, janela);
      const nomeLongo = p.qual === 'semana' ? t.janelaSemana : t.janela5h;
      s.title = `${p.conta} · ${nomeLongo} ${p.pct}%${p.reset ? ` · ${t.reinicia} ${p.reset}` : ''}`;
      resumo.append(s);
    }
  }

  // Estrutura só muda quando o conjunto, a ordem ou o tipo (cartão × chip) muda; a cada
  // snapshot repinta em cima, sem recriar o DOM (o diálogo, se aberto, sobrevive).
  let ultimaEstrutura = '';
  function assinatura(contas: AccountInfo[]): string {
    return contas.map((c) => `${c.id}:${temNumeros(c) ? 1 : 0}`).join('|');
  }
  function aplicarEstrutura(contas: AccountInfo[]): void {
    ultimaEstrutura = assinatura(contas);
    cartoes.clear();
    corpo.replaceChildren();
    if (!contas.length) {
      corpo.append(vazio);
      return;
    }
    for (const a of contas) {
      const [el, r] = criarConta(a.provider ?? 'claude');
      el.dataset.cartao = a.id;
      refs.set(el, r);
      cartoes.set(a.id, el);
      corpo.append(el);
    }
  }

  // Esmaecido + seta: só no lado em que ainda há cartão escondido (lido da rolagem real).
  function medirRolagem(): void {
    // Folga no fim: a última parada da rolagem alinha um cartão (ver folgaFinalDaFaixa).
    const els = Array.from(corpo.children) as HTMLElement[];
    const estilo = getComputedStyle(corpo);
    const caixa = corpo.getBoundingClientRect();
    const inicios = els.map((el) => el.getBoundingClientRect().left - caixa.left + corpo.scrollLeft);
    const ultimo = els[els.length - 1];
    const conteudo = ultimo ? inicios[inicios.length - 1] + ultimo.getBoundingClientRect().width : 0;
    const folga = Math.round(folgaFinalDaFaixa(inicios, conteudo, corpo.clientWidth, parseFloat(estilo.scrollPaddingLeft) || 0));
    if (Math.abs((parseFloat(corpo.style.paddingRight) || 0) - folga) > 0.5) corpo.style.paddingRight = folga ? `${folga}px` : '';
    const sobra = corpo.scrollWidth - corpo.clientWidth;
    const ini = sobra > 1 && corpo.scrollLeft > 1;
    const fim = sobra > 1 && corpo.scrollLeft < sobra - 1;
    corpo.classList.toggle('rola-ini', ini);
    corpo.classList.toggle('rola-fim', fim);
    // Coluna das setas só quando transborda; a seta do lado sem mais conta desabilita (e some
    // pelo CSS) — se o foco estava nela, passa para a outra (nunca cai no body).
    const focoIni = document.activeElement === setaIni;
    const focoFim = document.activeElement === setaFim;
    setas.hidden = sobra <= 1;
    setaIni.disabled = !ini;
    setaFim.disabled = !fim;
    if (focoIni && !ini && fim) setaFim.focus();
    if (focoFim && !fim && ini) setaIni.focus();
  }
  /**
   * Rola um cartão: para a frente, alinha à esquerda o primeiro cartão que ainda não começou
   * visível; para trás, o cartão anterior ao primeiro visível. O scroll-padding do CSS deixa
   * a pontinha do cartão de trás aparecendo sob o esmaecido da esquerda (a pista de que há mais).
   */
  function rolarUmCartao(paraFrente: boolean): void {
    const els = Array.from(corpo.children) as HTMLElement[];
    if (!els.length) return;
    const folga = parseFloat(getComputedStyle(corpo).scrollPaddingLeft) || 0;
    const base = corpo.getBoundingClientRect().left + folga;
    // Posição de cada cartão relativa ao ponto de alinhamento atual (0 = já alinhado).
    const pos = els.map((el) => el.getBoundingClientRect().left - base);
    const alvo = paraFrente ? pos.find((x) => x > 2) : [...pos].reverse().find((x) => x < -2);
    if (alvo === undefined) return;
    const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
    corpo.scrollBy({ left: alvo, behavior: reduzido ? 'auto' : 'smooth' });
  }
  corpo.addEventListener('scroll', medirRolagem, { passive: true });
  // Roda vertical do mouse vira rolagem horizontal quando a fileira transborda (sem isto, só trackpad rolava).
  corpo.addEventListener(
    'wheel',
    (e) => {
      if (corpo.scrollWidth <= corpo.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      corpo.scrollLeft += e.deltaY;
      e.preventDefault();
    },
    { passive: false },
  );
  // A largura disponível muda com a lista, a gaveta de detalhe e a janela: remede quando o corpo muda.
  const observador = typeof ResizeObserver === 'function' ? new ResizeObserver(medirRolagem) : null;
  observador?.observe(corpo);

  // Recolher/abrir: aberto por padrão (Frente A), estado em localStorage.
  let aberto = lerAberto();
  function aplicarAberto(): void {
    raiz.classList.toggle('recolhido', !aberto);
    // A dica diz o que o clique FAZ (aberta → "Recolher"); aria-expanded diz o estado.
    const dica = aberto ? t.dicaRecolher : t.dicaAbrir;
    btnRecolher.title = dica;
    btnRecolher.setAttribute('aria-label', `${dica} · ${t.tituloPainel}`);
    btnRecolher.setAttribute('aria-expanded', String(aberto));
    if (aberto) requestAnimationFrame(medirRolagem);
  }
  function alternar(): void {
    aberto = !aberto;
    gravarAberto(aberto);
    aplicarAberto();
  }
  aplicarAberto();
  btnRecolher.addEventListener('click', alternar);

  document.body.append(raiz, dialog);

  return {
    raiz,
    alternar,
    atualizar(contas, agora) {
      const lista = ordemDaFaixa(contas, agora);
      if (assinatura(lista) !== ultimaEstrutura) aplicarEstrutura(lista);
      for (const a of lista) atualizarConta(cartoes.get(a.id)!, a, agora);
      pintarResumo(lista, agora);
      medirRolagem();
    },
    fecha() {
      observador?.disconnect();
      raiz.remove();
      if (dialog.open) dialog.close();
      dialog.remove();
    },
  };
}
