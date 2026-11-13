// Peças de DOM do acabamento da gaveta de detalhe.
// Regra do módulo: builders sem estado — todo dado de agente entra por parâmetro e
// sai do DOM só por `textContent`; zero string literal visível aqui (tudo de
// `texto.detalhe.ui` / `texto.provedor`, decididos pelo chamador em detalhe.ts).
// O SVG do rosto (rosto.ts) entra por DOMParser + importNode — nunca por HTML
// interpretado, para dado do agente nunca virar DOM injetado.

import type { AccountInfo, Activity, AgentInfo, AgentStatus } from '../../../shared/types';
import { agoraDoAgente, grupoDaAcao, haTempo, inicialDoNome } from './detalhe-formato';
import { rostoSvg } from './rosto';
import { texto } from './texto';

/** Grupo de textos da gaveta — as peças leem rótulos só daqui. */
type T = (typeof texto)['detalhe'];

/** Ações opcionais da gaveta (passo 3 do plano, decisão 7): `main.ts` não liga
 *  nada por enquanto — sem `opcoes`, os botões simplesmente não existem no DOM. */
export interface AcoesDetalhe {
  /** "Seguir": liga/desliga o acompanhamento do agente na câmera (id + novo estado). */
  aoSeguir?: (id: string, ligado: boolean) => void;
  /** "Centralizar": aponta a câmera para o agente. */
  aoCentralizar?: (id: string) => void;
}

/* (1) Barra fixa da gaveta (spec 2.2): h2 "Detalhes" + espaço + ✕ com
 *     aria-label. Criada uma vez em `montarDetalhe`; o chamador liga o botão
 *     e o Esc — a peça só monta o DOM. */
export function barra(t: T): HTMLElement {
  const bar = document.createElement('header');
  bar.className = 'painel-det-barra';
  const h2 = document.createElement('h2');
  h2.className = 'painel-det-barra-titulo';
  h2.textContent = t.ui.tituloBarra;
  const spacer = document.createElement('span');
  spacer.className = 'grow';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'painel-botoes painel-det-fechar';
  btn.title = t.dicaFechar;
  btn.setAttribute('aria-label', t.dicaFechar);
  btn.textContent = '✕';
  bar.append(h2, spacer, btn);
  return bar;
}

/* (2) Hero (spec 2.3): avatar 64 px com o rosto pixel-art da `seed` (ou o
 *     inicial do nome como fallback), bloco nome/papel/sala, título (só fora
 *     do modo conteúdo) e selos de provedor·conta. `nome`/`salaRotulo` já
 *     chegam exibíveis (o chamador aplica `nomeExibido` e a sala — nome do
 *     room registrado, senão o `roomId`); `conta` pode não existir. */
export function hero(p: {
  a: AgentInfo;
  /** Nome exibível (o chamador aplica nomeExibido: genérico no modo conteúdo). */
  nome: string;
  /** Rótulo da sala: nome do room quando registrado, senão o `roomId` (spec 3). */
  salaRotulo: string;
  /** Conta registrada; ausente quando o `account` não tem registro. */
  conta?: AccountInfo;
  /** Título do agente; `undefined` oculta a linha (modo conteúdo ou sem título). */
  titulo?: string;
  /** Rótulo do selo de provedor (chamador decide: ausente no dado = claude). */
  seloProvedor: string;
  /** Status exibido no avatar: `offline` quando sumido (spec 3: avatar neutro). */
  status: AgentStatus;
  t: T;
}): HTMLElement {
  const { a, nome, salaRotulo, conta, titulo, seloProvedor, status, t } = p;
  const s = document.createElement('section');
  s.className = 'painel-det-hero';

  // Avatar: o rosto SVG entra por DOMParser + importNode (nunca por HTML
  // interpretado); `data-status` dá à borda/fundo a cor do estado.
  const avatar = document.createElement('div');
  avatar.className = 'painel-det-avatar';
  avatar.dataset.status = status;
  let svg: Element | null = null;
  try {
    svg = new DOMParser().parseFromString(rostoSvg(a.seed, a.parts, a.look), 'image/svg+xml').querySelector('svg');
  } catch {
    svg = null; // seed anômala: cai no fallback de inicial abaixo
  }
  if (svg) {
    avatar.append(document.importNode(svg, true));
  } else {
    const ini = document.createElement('span');
    ini.textContent = inicialDoNome(nome);
    avatar.append(ini);
  }

  // Bloco de identificação: nome (h3, reticências via CSS), papel e sala
  // (sala sem registro mostra o rótulo genérico de ui, não o id cru).
  const id = document.createElement('div');
  id.className = 'painel-det-id';
  const h3 = document.createElement('h3');
  h3.className = 'painel-det-nome';
  h3.textContent = nome;
  h3.title = nome;
  const papel = document.createElement('p');
  papel.className = 'painel-det-papel';
  papel.textContent = a.role;
  const salaEl = document.createElement('p');
  salaEl.className = 'painel-det-sala';
  salaEl.textContent = salaRotulo;
  salaEl.title = salaRotulo;
  id.append(h3, papel, salaEl);
  s.append(avatar, id);

  if (titulo) {
    const tt = document.createElement('p');
    tt.className = 'painel-det-titulo';
    tt.textContent = titulo;
    tt.title = titulo;
    s.append(tt);
  }

  // Selos: provedor (rótulo do chamador) + conta (com ponto de cor quando a
  // conta tem `color` válido — `CSS.supports` protege; inválido cai em apoio).
  const selos = document.createElement('div');
  selos.className = 'painel-det-selos';
  const seloProv = document.createElement('span');
  seloProv.className = 'painel-det-selo';
  seloProv.textContent = seloProvedor;
  seloProv.title = seloProvedor;
  const seloConta = document.createElement('span');
  seloConta.className = 'painel-det-selo';
  const dot = document.createElement('i');
  dot.className = 'painel-det-selo-ponto';
  const rotuloConta = conta?.name ?? a.account;
  if (conta?.color && CSS.supports('color', conta.color)) {
    seloConta.style.setProperty('--det-conta', conta.color); // ponto usa var(--det-conta, apoio)
  }
  seloConta.append(dot, document.createTextNode(rotuloConta));
  seloConta.title = rotuloConta;
  selos.append(seloProv, seloConta);
  s.append(selos);
  return s;
}

/* (3) Estado + ações (spec 2.4): selo de status (pulsa só em `working`),
 *     tempo no status (`data-epoch`/`data-modo="status"` para a repintura do
 *     passo 7), botões Seguir/Centralizar (só quando o chamador passou
 *     `opcoes`) e o aviso do agente sumido. Sumido = tratado como offline. */
export function estado(p: {
  a: AgentInfo;
  /** Agente fora do snapshot: selo vira offline, botões ficam disabled, aviso entra. */
  sumido: boolean;
  agora: number;
  t: T;
  opcoes?: AcoesDetalhe;
}): HTMLElement {
  const { a, sumido, agora, t, opcoes } = p;
  const div = document.createElement('div');
  div.className = 'painel-det-estado';

  const status = sumido ? 'offline' : a.status;
  const selo = document.createElement('span');
  selo.className = 'painel-det-estado-selo';
  selo.dataset.status = status;
  selo.textContent = t.ui.selos[status];

  // Tempo no status: vazio quando sumido (o último `statusSince` já não vale);
  // `haTempo` resolve o "no status há agora" (D6).
  const tempo = document.createElement('span');
  tempo.className = 'painel-det-estado-tempo';
  tempo.dataset.epoch = String(a.statusSince);
  tempo.dataset.modo = 'status';
  tempo.textContent = sumido ? '' : haTempo(a.statusSince, agora, t.ui.noStatusHa, t.ui.quandoAgora);
  div.append(selo, tempo);

  // Botões só entram no DOM se o chamador ligou as ações (const capturadas
  // para o narrowing sobreviver ao closure do clique).
  const seg = opcoes?.aoSeguir;
  const cent = opcoes?.aoCentralizar;
  if (seg || cent) {
    const ac = document.createElement('div');
    ac.className = 'painel-det-estado-acoes';
    if (seg) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'painel-det-btn';
      b.textContent = t.ui.aoSeguir;
      b.setAttribute('aria-label', t.ui.ariaSeguir);
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        const ligado = b.getAttribute('aria-pressed') === 'true';
        b.setAttribute('aria-pressed', String(!ligado));
        seg(a.id, !ligado);
      });
      ac.append(b);
    }
    if (cent) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'painel-det-btn';
      b.textContent = t.ui.aoCentralizar;
      b.setAttribute('aria-label', t.ui.ariaCentralizar);
      b.addEventListener('click', () => cent(a.id));
      ac.append(b);
    }
    if (sumido) {
      // Fora do prédio: seguir/centralizar não têm alvo — botões desabilitados.
      for (const b of Array.from(ac.querySelectorAll('button'))) b.disabled = true;
    }
    div.append(ac);
  }

  if (sumido) {
    const av = document.createElement('p');
    av.className = 'painel-det-aviso';
    av.textContent = t.ui.sumidoAviso;
    div.append(av);
  }
  return div;
}

/* (4) Cartão "Agora" (spec 2.5): conteúdo decidido por `agoraDoAgente` (função
 *     pura do passo 2) — cada ramo do union vira a composição da spec:
 *     acao → linha de ícone + texto (só quando a ação existe; sem ação vira
 *     o rótulo de processamento, como `espera`/`concluido`); espera → motivo
 *     (waitingFor em PT, sem arquivo — pode aparecer no modo conteúdo);
 *     shell → "Esperando o shell" + meta com o rótulo do 1º shell (+N);
 *     ocioso → "Aguardando…" + última ação com tempo; concluido → texto fixo.
 *     `encerrado` (sumido/offline) devolve null: o chamador não desenha.
 *     O chamador decide a máscara (modo conteúdo: texto de ação/shell vira
 *     `acaoMascarada`) e passa `mascarado`; `sumido` entra direto. */
export function cartaoAgora(p: {
  /** Agente (tipos de `agoraDoAgente`: status/activity/waitingFor/shells/recent). */
  a: AgentInfo;
  /** Agente fora do snapshot (card não é desenhado — ver acima). */
  sumido: boolean;
  /** Data "agora" (ms) para os tempos relativos — o timer passa o `Date.now()`. */
  agora: number;
  /** Modo conteúdo: texto de ação/rótulo de shell mascarado (spec 2.5). */
  mascarado: boolean;
  /** Data "agora" (ms) para os tempos relativos — o timer passa o `Date.now()`. */
  t: T;
}): HTMLElement | null {
  const { a, sumido, agora, mascarado, t } = p;
  const ag = agoraDoAgente(a, sumido);
  if (ag.tipo === 'encerrado') return null;

  const s = document.createElement('section');
  s.className = 'painel-det-agora';
  s.dataset.status = sumido ? 'offline' : a.status;
  const rot = document.createElement('p');
  rot.className = 'painel-det-agora-rot';
  rot.textContent = t.ui.agoraRotulo;
  s.append(rot);

  /** Linha principal sem ícone (tipos `espera`/`shell`/`ocioso`/`concluido`
   *  e `acao` sem atividade — spec 2.5: a linha de ícone é só no `acao`
   *  com ação). */
  const texto = (txt: string): void => {
    const pEl = document.createElement('p');
    pEl.className = 'painel-det-agora-texto';
    pEl.textContent = txt;
    s.append(pEl);
  };
  const meta = (txt: string): void => {
    const m = document.createElement('p');
    m.className = 'painel-det-agora-meta';
    m.textContent = txt;
    s.append(m);
  };
  /** Texto de ação no modo conteúdo vira o rótulo mascarado (spec 2.5/3). */
  const acaoTexto = (at: Activity): string =>
    mascarado ? t.acaoMascarada : at.text;

  switch (ag.tipo) {
    case 'acao':
      if (ag.acao) {
        const at = ag.acao;
        // Linha com ícone colorido (`data-grupo` já marcado; a cor por grupo
        // e as classes `-agora-ico` do spec entram com a linha do tempo,
        // passo 6 — a classe `painel-det-ico` é a mesma de lá).
        const linha = document.createElement('div');
        linha.className = 'painel-det-agora-linha';
        const ico = document.createElement('span');
        ico.className = 'painel-det-ico';
        ico.dataset.grupo = grupoDaAcao(at.kind, at.error);
        ico.setAttribute('aria-hidden', 'true');
        ico.textContent = at.icon || '·';
        const pEl = document.createElement('p');
        pEl.className = 'painel-det-agora-texto';
        pEl.textContent = acaoTexto(at);
        pEl.title = mascarado ? '' : at.detail ?? at.text;
        linha.append(ico, pEl);
        s.append(linha);
        meta(haTempo(at.at, agora, t.ha, t.ui.quandoAgora)); // "há 2 m" / "agora"
      } else {
        // `working` sem atividade ainda (primeiros instantes do turno).
        texto(t.ui.agoraProcessando);
      }
      break;
    case 'espera':
      // `waitingFor` é motivo em PT e pode aparecer no modo conteúdo (spec 2.5).
      texto(ag.motivo ?? t.ui.agoraEspera);
      break;
    case 'shell': {
      texto(t.ui.agoraShell);
      // Meta: rótulo do 1º shell (+N em segundo plano); mascarado no modo
      // conteúdo (rótulo de shell traz comando — mesmo regra do texto de ação).
      const partes: string[] = [];
      if (mascarado) partes.push(t.acaoMascarada);
      else if (ag.rotulo) partes.push(ag.rotulo);
      if (ag.extra > 0) partes.push(t.ui.agoraShellExtra.replace('{0}', String(ag.extra)));
      if (partes.length) meta(partes.join(' '));
      break;
    }
    case 'ocioso':
      texto(t.ui.agoraOcioso);
      if (ag.ultima) {
        const at = ag.ultima;
        meta(
          t.ui.agoraUltimaAcao
            .replace('{0}', acaoTexto(at))
            .replace('{1}', haTempo(at.at, agora, t.ha, t.ui.quandoAgora)),
        );
      }
      break;
    case 'concluido':
      texto(t.ui.agoraConcluido);
      break;
  }
  return s;
}

/* (5) Botão de copiar (spec 2.6): ícone SVG 14×14 por `createElementNS` —
 *     nenhum HTML interpretado (dado de agente não pode virar DOM injetado).
 *     Ícone de cópia: `rect` + dente do papel; ícone de ok: tick. O estado
 *     "copiado até T" vive no closure do chamador; `copiado === true` entra
 *     com a classe `.is-ok` (ícone de ok + a CSS revela o botão) e o botão
 *     não captura clique enquanto copiado. A escrita no clipboard e o
 *     anúncio `aria-live` ("Copiado" 1400 ms / "Não foi possível copiar")
 *     são do chamador — ele passa `aoCopiar` só quando ainda há o que copiar. */
export function botaoCopiar(p: {
  /** Valor copiado por este botão — vai ao `title` (completo, sem abreviar). */
  valor: string;
  /** Rótulo acessível (de `texto.detalhe.ui.ariaCopiar`). */
  rotulo: string;
  /** `true` quando este botão está no estado "copiado até agora" (closure). */
  copiado: boolean;
  /** Callback do chamador (clipboard + anúncio); omitido quando `copiado`. */
  aoCopiar?: () => void;
}): HTMLButtonElement {
  const { valor, rotulo, copiado, aoCopiar } = p;
  const NS = 'http://www.w3.org/2000/svg';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'painel-det-copiar' + (copiado ? ' is-ok' : '');
  btn.title = valor;
  btn.setAttribute('aria-label', rotulo);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 14 14');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (copiado) {
    // Tick de sucesso (mesmas bordas de traço do ícone de cópia).
    const tick = document.createElementNS(NS, 'path');
    tick.setAttribute('d', 'M3 7.5 5.5 10 11 4.5');
    svg.append(tick);
  } else {
    // Ícone de cópia: papel traseiro (rect) + folha à frente (path em L).
    const folha = document.createElementNS(NS, 'path');
    folha.setAttribute('d', 'M9.5 4.5V3A1.5 1.5 0 0 0 8 1.5H3A1.5 1.5 0 0 0 1.5 3v5A1.5 1.5 0 0 0 3 9.5h1.5');
    const papel = document.createElementNS(NS, 'rect');
    papel.setAttribute('x', '4.5');
    papel.setAttribute('y', '4.5');
    papel.setAttribute('width', '7');
    papel.setAttribute('height', '7');
    papel.setAttribute('rx', '1.5');
    svg.append(papel, folha);
    btn.addEventListener('click', () => aoCopiar?.());
  }
  btn.append(svg);
  return btn;
}

/* (6) Grade "Identificação" (spec 2.6): `dl` de linhas `dt → dd`, cada valor
 *     é um `span.painel-det-valor` (`display:block` corrige o truncamento em
 *     inline do diagnóstico D2; `--mono` troca a fonte; `--vazio` fica na
 *     cor de rótulo para "não informado", sem botão de copiar). Botões de
 *     copiar entram no `dd` (revelados no hover da linha — CSS do mesmo passo).
 * (7) Seção recolhível (spec 2.7): cabeçalho-botão (aria-expanded/
 *     aria-controls/data-foco) + chip opcional + chevron em CSS; corpo
 *     `div.painel-det-sec-corpo` com `hidden` quando fechada. Estado aberto/
 *     fechado é do chamador (Set em detalhe.ts) — a peça só monta e alterna
 *     o próprio `hidden`/aria no clique.
 * (8) Cartão Subagente/Responsável (spec 2.8): `li > button.painel-det-sub`
 *     com avatar de inicial (cor do estado via data-status), nome/papel e
 *     selo de status; clique troca o agente da gaveta.
 * (9) Cartão de ação da linha do tempo (spec 2.9): `li.painel-det-acao`
 *     com ícone colorido por grupo, texto em 1 linha e tempo mono à direita. */
export function grade(p: {
  /** Linhas na ordem da spec 2.6 (Modelo → Caminho → Sessão). */
  linhas: {
    /** Rótulo da linha (de `texto.detalhe.ui`). */
    dt: string;
    /** Texto exibido — o chamador já aplicou `abreviarMeio` onde truncar. */
    valor: string;
    /** Valor completo, para o `title` do valor e do botão de copiar. */
    completo: string;
    /** Fonte mono (Modelo/Caminho/Sessão). */
    mono?: boolean;
    /** "Não informado": vira a classe `--vazio` (cor de rótulo). */
    vazio?: boolean;
    /** Inclui o botão de copiar (ver `aoCopiar`). */
    copiar?: boolean;
    /** Estado copiado deste botão (closure do chamador, spec 2.6). */
    copiado?: boolean;
    /** Executa a cópia (clipboard + anúncio) — só entra com `copiar`. */
    aoCopiar?: () => void;
  }[];
  t: T;
}): HTMLDListElement {
  const { linhas, t } = p;
  const dl = document.createElement('dl');
  dl.className = 'painel-det-grade';
  for (const l of linhas) {
    const linha = document.createElement('div');
    linha.className = 'painel-det-grade-linha';
    const dt = document.createElement('dt');
    dt.textContent = l.dt;
    const dd = document.createElement('dd');
    const v = document.createElement('span');
    v.className = 'painel-det-valor' + (l.mono ? ' painel-det-valor-mono' : '') + (l.vazio ? ' painel-det-valor-vazio' : '');
    v.textContent = l.valor;
    v.title = l.completo;
    dd.append(v);
    if (l.copiar) {
      // Enquanto copiado, o botão só mostra o tick — sem clique (o estado
      // expira sozinho pelo closure; a repintura reconstrói sem a classe).
      dd.append(botaoCopiar({ valor: l.completo, rotulo: t.ui.ariaCopiar, copiado: Boolean(l.copiado), aoCopiar: l.aoCopiar }));
    }
    linha.append(dt, dd);
    dl.append(linha);
  }
  return dl;
}

/* (7) Seção recolhível (spec 2.7): cabeçalho-botão com título, chip opcional e
 *     chevron (desenhado em CSS); o corpo recebe `hidden` quando fechada. O
 *     estado aberto/fechado é do chamador (`Set` em detalhe.ts, sobrevive à
 *     repintura de 1 s): a peça alterna `aria-expanded`/`hidden` no clique e
 *     devolve o novo estado por `aoAlternar`, para o closure atualizar o Set. */
export function secao(
  id: string,
  titulo: string,
  opcoes: {
    chip?: string;
    /** Peça extra no cabeçalho, depois do título (spec 2.11: selo "simulado" da Vida social). */
    extra?: HTMLElement;
    /** Sub-seção (spec 2.11: Extrato dentro da Vida social): sem `border-top`. */
    sub?: boolean;
    aberta: boolean;
    aoAlternar?: (aberta: boolean) => void;
  },
  corpo: HTMLElement,
): HTMLElement {
  const s = document.createElement('section');
  s.className = 'painel-det-sec' + (opcoes.sub ? ' painel-det-sec-sub' : '');
  s.dataset.sec = id;

  const cab = document.createElement('button');
  cab.type = 'button';
  cab.className = 'painel-det-sec-cab';
  cab.setAttribute('aria-expanded', String(opcoes.aberta));
  cab.setAttribute('aria-controls', `${id}-corpo`);
  cab.dataset.foco = `sec:${id}`;

  const tt = document.createElement('span');
  tt.className = 'painel-det-sec-titulo';
  tt.textContent = titulo;
  cab.append(tt);
  if (opcoes.extra) cab.append(opcoes.extra);
  if (opcoes.chip) {
    const chip = document.createElement('span');
    chip.className = 'painel-det-chip';
    chip.textContent = opcoes.chip;
    cab.append(chip);
  }
  const chevron = document.createElement('i');
  chevron.className = 'painel-det-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  cab.append(chevron);

  // `id` do corpo para o `aria-controls`; `classList` (não `className`) para
  // preservar a classe de conteúdo que o chamador já deu (ex.: estatísticas).
  corpo.id = `${id}-corpo`;
  corpo.classList.add('painel-det-sec-corpo');
  if (!opcoes.aberta) corpo.hidden = true;

  cab.addEventListener('click', () => {
    const nova = cab.getAttribute('aria-expanded') === 'false'; // fechada → abre
    cab.setAttribute('aria-expanded', String(nova));
    corpo.hidden = !nova;
    opcoes.aoAlternar?.(nova);
  });

  s.append(cab, corpo);
  return s;
}

/* (8) Cartão Subagente/Responsável (spec 2.8): `li > button.painel-det-sub`
 *     com avatar de inicial, nome/papel e selo de status; o clique troca o
 *     agente da gaveta. Rótulos de status vêm de `texto.status` (global,
 *     mesma regra da linha antiga). */
export function cartaoSubagente(p: {
  a: AgentInfo;
  /** Nome exibível (o chamador aplica `nomeExibido`). */
  nome: string;
  /** Troca o agente aberto ao clicar no cartão. */
  aoTrocar: () => void;
  /** Papel exibido no lugar do `a.role` (spec 2.11: rivais saem como "Rival"). */
  papel?: string;
}): HTMLElement {
  const { a, nome, aoTrocar, papel } = p;
  const li = document.createElement('li');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'painel-det-sub';
  btn.dataset.status = a.status;
  btn.dataset.foco = `sub:${a.id}`;

  const av = document.createElement('span');
  av.className = 'painel-det-sub-av';
  av.textContent = inicialDoNome(nome);

  const txt = document.createElement('span');
  txt.className = 'painel-det-sub-txt';
  const nomeEl = document.createElement('span');
  nomeEl.className = 'painel-det-sub-nome';
  nomeEl.textContent = nome;
  nomeEl.title = nome;
  const papelEl = document.createElement('span');
  papelEl.className = 'painel-det-sub-papel';
  const papelTxt = papel ?? a.role;
  papelEl.textContent = papelTxt;
  papelEl.title = papelTxt;
  txt.append(nomeEl, papelEl);

  const est = document.createElement('span');
  est.className = 'painel-det-sub-estado';
  est.textContent = texto.status[a.status];

  btn.append(av, txt, est);
  btn.addEventListener('click', aoTrocar);
  li.append(btn);
  return li;
}

/* (9) Cartão de ação da linha do tempo (spec 2.9): `li.painel-det-acao`
 *     (`.is-erro` quando `at.error`) com ícone colorido por grupo
 *     (`data-grupo` de `grupoDaAcao`), texto em 1 linha e tempo mono à
 *     direita. O tempo sai por `haTempo` (corrige o "há agora", D6) e fica
 *     marcado com `data-epoch`/`data-modo="ha"` para a repintura do passo 7. */
export function cartaoAcao(p: {
  at: Activity;
  /** Data "agora" (ms) — o timer passa o `Date.now()`. */
  agora: number;
  /** Rótulo do texto (o chamador aplica a máscara do modo conteúdo). */
  rotulo: string;
  /** `true` quando o texto veio mascarado (sem `title` de detalhe). */
  mascarado: boolean;
  t: T;
}): HTMLElement {
  const { at, agora, rotulo, mascarado, t } = p;
  const li = document.createElement('li');
  li.className = 'painel-det-acao' + (at.error ? ' is-erro' : '');

  const ico = document.createElement('span');
  ico.className = 'painel-det-ico';
  ico.dataset.grupo = grupoDaAcao(at.kind, at.error);
  ico.setAttribute('aria-hidden', 'true');
  ico.textContent = at.icon || '·';

  const txt = document.createElement('span');
  txt.className = 'painel-det-acao-texto';
  txt.textContent = rotulo;
  if (!mascarado) txt.title = at.detail ?? at.text;

  const tempo = document.createElement('time');
  tempo.className = 'painel-det-acao-tempo';
  tempo.dataset.epoch = String(at.at);
  tempo.dataset.modo = 'ha';
  tempo.textContent = haTempo(at.at, agora, t.ha, t.ui.quandoAgora);

  li.append(ico, txt, tempo);
  return li;
}

/* (10) Tiles de estatísticas (spec 2.10): `div.painel-det-tiles` em grade de 2
 *      colunas; cada tile tem o valor em destaque (700, grande) acima do
 *      rótulo (pequeno, com reticências via CSS) — nunca colados no mesmo
 *      bloco. O chamador decide os 4 pares (valores formatados em
 *      detalhe-estat.ts; rótulos de `texto.detalhe`). */
export function tiles(p: {
  /** 4 pares na ordem da spec: ferramentas, tokens de entrada, saída, subagentes. */
  blocos: { valor: string; rotulo: string }[];
}): HTMLElement {
  const div = document.createElement('div');
  div.className = 'painel-det-tiles';
  for (const b of p.blocos) {
    const tile = document.createElement('div');
    tile.className = 'painel-det-tile';
    const valor = document.createElement('div');
    valor.className = 'painel-det-tile-valor';
    valor.textContent = b.valor;
    const rot = document.createElement('div');
    rot.className = 'painel-det-tile-rot';
    rot.textContent = b.rotulo;
    rot.title = b.rotulo;
    tile.append(valor, rot);
    div.append(tile);
  }
  return div;
}

/* (11) Chip de traço da Vida social (spec 2.11): emoji (aria-hidden) +
 *      rótulo; a dica entra no `title` do chip. */
export function chipTraco(p: { emoji: string; rotulo: string; dica: string }): HTMLElement {
  const chip = document.createElement('span');
  chip.className = 'painel-det-traco';
  chip.title = p.dica;
  const emoji = document.createElement('span');
  emoji.className = 'painel-det-traco-emoji';
  emoji.setAttribute('aria-hidden', 'true');
  emoji.textContent = p.emoji;
  chip.append(emoji, document.createTextNode(p.rotulo));
  return chip;
}

/* (12) Bordão da Vida social (spec 2.11): `blockquote` com filete cobalto à
 *      esquerda; o chamador já escolheu a frase (hash estável da seed). */
export function bordao(frase: string): HTMLElement {
  const q = document.createElement('blockquote');
  q.className = 'painel-det-bordao';
  q.textContent = frase;
  q.title = frase;
  return q;
}

/* (13) Moedinhas da Vida social (spec 2.11): valor em destaque laranja +
 *      rótulo (reuso das strings `moedasRotulo`/`moedasDica` de texto.detalhe). */
export function moedas(p: { valor: string; rotulo: string }): HTMLElement {
  const div = document.createElement('div');
  div.className = 'painel-det-moedas';
  const valor = document.createElement('span');
  valor.className = 'painel-det-moedas-valor';
  valor.textContent = p.valor;
  const rot = document.createElement('span');
  rot.className = 'painel-det-moedas-rot';
  rot.textContent = p.rotulo;
  div.append(valor, rot);
  return div;
}

/* (14) Nota final da Vida social (spec 2.11): "Simulado, só pra diversão.
 *      Não vale nada." — texto direto do chamador (`texto.detalhe.ui`). */
export function notaFinal(txt: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'painel-det-notas';
  p.textContent = txt;
  return p;
}

/* (15) Linha do Extrato (spec 2.11): texto com reticências à esquerda + hora
 *      mono à direita; o ícone (🚪/✅) é opcional via `icone` (aria-hidden).
 *      Sem HTML interpretado — todo dado sai por `textContent`. */
export function linhaExtrato(p: { texto: string; hora: string; icone?: string }): HTMLElement {
  const div = document.createElement('div');
  div.className = 'painel-det-extrato-linha';
  if (p.icone) {
    const icone = document.createElement('span');
    icone.className = 'painel-det-extrato-icone';
    icone.setAttribute('aria-hidden', 'true');
    icone.textContent = p.icone;
    div.append(icone);
  }
  const txt = document.createElement('span');
  txt.className = 'painel-det-extrato-texto';
  txt.textContent = p.texto;
  const hora = document.createElement('span');
  hora.className = 'painel-det-extrato-hora';
  hora.textContent = p.hora;
  div.append(txt, hora);
  return div;
}
