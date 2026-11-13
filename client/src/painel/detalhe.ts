// Adaptado de marmottajr/habblaud@faa1a01 client/src/ui/drawer.ts (MIT)
// Gaveta de detalhes à direita: nome/papel, status + tempo no status,
// provedor/conta, modelo, projeto (nome + caminho), sessão, hierarquia
// (subagentes do principal / responsável do sub) e últimas ações (ícone +
// texto de `recent`). Fonte: o snapshot do /api/stream — o mesmo que a lista.
// Lógica de tempo em tempo.ts; strings em texto.ts (grupo `detalhe`);
// estilo em painel.css (base) + detalhe-acabamento.css (tokens --det-*).
//
// Nova seção Estatísticas (dados reais de
// `AgentInfo.stats` — formatadores puros em detalhe-estat.ts) e Vida social
// (brincadeira local calculada no cliente: a tela rotula "simulado, só pra
// diversão"). Nenhuma das duas toca shared/world nem envia nada ao servidor.
// Seções recolhíveis: Estatísticas e Linha do tempo abertas; extrato fechado.
//
// Estatísticas em 4 tiles + grade
// (spec 2.10) e Vida social com selo "simulado", traços/bordão/rivais/
// moedinhas/Extrato como sub-seção (spec 2.11). O refino visual da Frente C
// migrou para o CSS de acabamento; o arquivo antigo foi apagado.
//
// LACUNA: o servidor não expõe o texto da conversa da sessão (/api/session/:id
// devolve só o resumo das ações, sem conteúdo). A seção "Conversa recente" é
// por isso OMITIDA — markdown.ts (tokenizador testado + render) já está pronto para ela.
//
// Modo conteúdo: troca nome/título por genéricos (texto.generico) e mascara
// o texto das ações (que traz nomes de arquivo). Caminho do projeto fica
// visível: é nome de pasta, não prompt.
import type { AccountInfo, AgentInfo, Activity, OfficeSnapshot, RoomInfo } from '../../../shared/types';
import {
  dataHoraLocal,
  duracaoLegivel,
  extratoVidaSocial,
  formatarInt,
  formatarTokensCompacto,
  indexDoBorde,
  moedasPorWorking,
  ordenarRivais,
  tempoWorkingSessao,
  tracosDoAgente,
} from './detalhe-estat';
import { fatiaAcoes, abreviarMeio, haTempo } from './detalhe-formato';
import { barra, cartaoAcao, cartaoSubagente, cartaoAgora, bordao, chipTraco, estado, grade, hero, linhaExtrato, moedas, notaFinal, secao, tiles, type AcoesDetalhe } from './detalhe-pecas';
import { texto } from './texto';
import './painel.css';
// Acabamento: tokens --ia-* vêm de identidade.css
// (carregado por main.ts); o refino da Frente C migrou para este arquivo (D5).
import './detalhe-acabamento.css';

/** Teto de rivais da Vida social (plano: até 2 colegas da mesma sala). */
const MAX_RIVAIS = 2;

/**
 * Paginação da linha do tempo (spec 2.9): começa com 6 cartões visíveis;
 * "Mostrar mais N" soma 10 (N = min(10, restantes)); "Mostrar menos" volta a 6.
 */
const ACOES_INICIAIS = 6;
const ACOES_PASSO = 10;
/** Subagentes: cartões visíveis antes de "Mostrar mais N" (spec 2.8). */
const SUBS_INICIAIS = 5;

/** Ids das seções recolhíveis em padrão aberto (spec 2.7: todas abertas,
 *  exceto o extrato — fechado). O estado fechado vive no closure. */
const SECAO_EXTRATO = 'extrato';

export interface ApiDetalhe {
  /** Elemento raiz (anexado ao body por montarDetalhe). */
  raiz: HTMLDivElement;
  /** Abre a gaveta com o agente; repinta a partir do último snapshot. */
  abre(id: string): void;
  /** Esconde a gaveta. */
  fecha(): void;
  /** Alimenta a gaveta (mesmo snapshot da lista); com agente aberto, repinta. */
  atualizar(snapshot: Pick<OfficeSnapshot, 'rooms' | 'agents' | 'accounts'>, agora?: number): void;
  /** Modo conteúdo (privacidade): true troca nomes/títulos por genéricos. Padrão = desligado. */
  setModoConteudo(ligado: boolean): void;
}

export function montarDetalhe(opcoes?: AcoesDetalhe): ApiDetalhe {
  let abertoId: string | null = null;
  let visivel = false;
  let modoConteudo = false;
  /** Último estado conhecido do agente (permite o estado "sumido" quando ele sai do snapshot). */
  let ultimo: AgentInfo | null = null;
  let agentes: AgentInfo[] = [];
  let salas: RoomInfo[] = [];
  let contas: AccountInfo[] = [];
  /** Seções recolhíveis no estado FECHADO (spec 2.7; padrão: todas abertas,
   *  exceto o extrato). `Set` no closure: sobrevive à repintura de 1 s. */
  let secoesFechadas: Set<string> = new Set([SECAO_EXTRATO]);
  /** Cartões de subagente visíveis ("Mostrar mais", spec 2.8) — reseta na troca de agente. */
  let subsMostrados = SUBS_INICIAIS;
  /** Ações visíveis na linha do tempo (spec 2.9) — reseta na troca de agente. */
  let acoesMostradas = ACOES_INICIAIS;
  // Copiar (spec 2.6): o DOM da grade é repintado a cada segundo, então o
  // estado "copiado até T" vive aqui — `chave` liga o estado ao botão (modelo
  // não tem copiar; 'caminho' e 'sessao' têm), `ate` é o epoch de expiração
  // (1400 ms). A repintura lê a flag e re-constrói o botão já em `.is-ok`.
  let copiado: { chave: 'caminho' | 'sessao'; ate: number } | null = null;
  /** Região viva para o anúncio da cópia ("Copiado" / "Não foi possível copiar"). */
  const live = document.createElement('span');
  live.setAttribute('aria-live', 'polite');
  live.className = 'painel-live';
  live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)';

  // ---------- esqueleto do DOM (casca 2.2) ----------
  const raiz = document.createElement('div');
  raiz.className = 'painel-detalhe painel fechada';
  raiz.setAttribute('aria-label', texto.detalhe.tituloPainel);

  // Barra fixa: h2 + ✕ (peça sem estado; os listeners ficam aqui).
  const bar = barra(texto.detalhe);
  const btnFechar = bar.querySelector('button')!;
  // Corpo rolável > miolo (grid de seções): `pintar()` escreve no miolo.
  const corpo = document.createElement('div');
  corpo.className = 'painel-det-corpo';
  const miolo = document.createElement('div');
  miolo.className = 'painel-det-miolo';
  corpo.append(miolo);
  raiz.append(bar, corpo, live);
  document.body.append(raiz);

  /** Fecha a gaveta — reusado pelo ✕ e pelo Esc (spec 2.2). */
  function fechar(): void {
    visivel = false;
    abertoId = null;
    ultimo = null;
    raiz.classList.add('fechada');
    miolo.replaceChildren();
  }
  btnFechar.addEventListener('click', fechar);
  // Esc com foco DENTRO da gaveta fecha (gaveta fechada não recebe foco — fora do tab-order).
  raiz.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') fechar();
  });
  // Sombra na barra ao rolar (spec 2.2): listener passive no corpo alterna a classe.
  const aoRolar = (): void => {
    bar.classList.toggle('is-rolado', corpo.scrollTop > 0);
  };
  corpo.addEventListener('scroll', aoRolar, { passive: true });

  // ---------- peças de DOM (tudo de texto.detalhe; nenhum string solto aqui) ----------

  /** Nome exibido: genérico no modo conteúdo, real fora. */
  function nomeExibido(a: AgentInfo): string {
    return modoConteudo ? (a.kind === 'sub' ? texto.generico.subagente : texto.generico.principal) : a.name;
  }

  /** Rótulo do texto de ação: mascarado no modo conteúdo (o texto traz
   *  nome de arquivo/pedido); o `title` de detalhe é tratado pela peça via
   *  a flag `mascarado`. */
  function rotuloAcao(at: Activity): string {
    return modoConteudo ? texto.detalhe.acaoMascarada : at.text;
  }

  /** Estado aberto/fechado de uma seção (spec 2.7): inverte no Set do closure;
   *  a peça `secao` devolve o novo valor ao clicar no cabeçalho. */
  function alternaSecao(id: string, aberta: boolean): void {
    if (aberta) secoesFechadas.delete(id);
    else secoesFechadas.add(id);
  }

  /** Botão "Mostrar mais/menos" (specs 2.8/2.9): só aparece quando há o que
   *  esconder ou escondido; ao clicar, atualiza o contador e repinta já (sem
   *  esperar o relógio de 1 s). */
  function botaoMais(rotulo: string, aoMais: () => void): HTMLElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'painel-det-mais';
    b.textContent = rotulo;
    b.addEventListener('click', () => {
      aoMais();
      pintar(Date.now());
    });
    return b;
  }

  /* (Subagentes / Responsável — spec 2.8) Seção de hierarquia: até
   *  `subsMostrados` cartões de subagente (o clique troca o agente da gaveta),
   *  "Mostrar mais N" e estado vazio (`semSubagentes`/`paiSumido` — chip
   *  omitido no vazio, regra dos casos de borda da spec). */
  function secaoHierarquia(a: AgentInfo, sumido: boolean): HTMLElement {
    const t = texto.detalhe;
    const corpoSec = document.createElement('div');

    if (a.kind === 'main') {
      // Subagentes do principal (exclui offline; sumido → lista vazia),
      // ordenados por nome para a ordem estável da repintura.
      const subs = sumido ? [] : [...agentes.filter((s) => s.parentId === a.id && s.status !== 'offline')].sort((x, y) => x.name.localeCompare(y.name));
      if (!subs.length) {
        // Vazio: a nota entra direto no corpo (não pode virar item de `ul`).
        const vazio = document.createElement('p');
        vazio.className = 'painel-det-vazio';
        vazio.textContent = sumido ? t.paiSumido : t.semSubagentes;
        corpoSec.append(vazio);
      } else {
        const lista = document.createElement('ul');
        lista.className = 'painel-det-lista';
        for (const s of subs.slice(0, subsMostrados)) lista.append(cartaoSubagente({ a: s, nome: nomeExibido(s), aoTrocar: () => abre(s.id) }));
        corpoSec.append(lista);
      }
      const restantes = Math.max(0, subs.length - subsMostrados);
      if (restantes > 0) corpoSec.append(botaoMais(t.ui.mostrarMais.replace('{0}', String(restantes)), () => (subsMostrados += restantes)));
      const id = 'subagentes';
      return secao(id, t.subagentes, { chip: subs.length ? String(subs.length) : undefined, aberta: !secoesFechadas.has(id), aoAlternar: (ab) => alternaSecao(id, ab) }, corpoSec);
    }

    // Responsável do subagente: um cartão do pai (ou vazio quando sumido).
    const pai = sumido || !a.parentId ? null : agentes.find((x) => x.id === a.parentId);
    if (pai) {
      const lista = document.createElement('ul');
      lista.className = 'painel-det-lista';
      lista.append(cartaoSubagente({ a: pai, nome: nomeExibido(pai), aoTrocar: () => abre(pai.id) }));
      corpoSec.append(lista);
    } else {
      const vazio = document.createElement('p');
      vazio.className = 'painel-det-vazio';
      vazio.textContent = t.paiSumido;
      corpoSec.append(vazio);
    }
    const id = 'responsavel';
    return secao(id, t.responsavel, { aberta: !secoesFechadas.has(id), aoAlternar: (ab) => alternaSecao(id, ab) }, corpoSec);
  }

  // ---------- frente C: Estatísticas (dados reais de `AgentInfo.stats`) ----------

  /** Anúncio por leitores de tela da cópia (spec 2.6): "Copiado" por 1400 ms,
   *  ou a falha; a região `aria-live` fixa no fim do DOM não é destruída. */
  function anunciar(msg: string): void {
    live.textContent = msg;
    window.setTimeout(() => {
      if (live.textContent === msg) live.textContent = '';
    }, 1400);
  }

  /** Copia o valor completo ao clipboard (spec 2.6): `navigator.clipboard` em
   *  try/catch; sucesso marca o botão "copiado até T" no closure (a repintura
   *  reconstrói o ícone em `.is-ok`), falha anuncia a mensagem. */
  function copiar(chave: 'caminho' | 'sessao', completo: string): void {
    if (!completo) return; // linha vazia não tem botão de copiar
    const t = texto.detalhe;
    (async () => {
      try {
        await navigator.clipboard.writeText(completo);
        copiado = { chave, ate: Date.now() + 1400 };
        anunciar(t.copiado);
        // A repintura deixou de rodar a cada segundo (spec 2.12): o clique
        // de copiar é quem devolve a repintura — reconstrói o botão em `.is-ok`.
        pintar(Date.now());
      } catch {
        // Sem permissão/clipboard (file://, navigator ausente): anuncia a falha.
        anunciar(t.ui.copiaFalhou);
      }
    })();
  }

  /** Flag "copiado agora" por chave: true enquanto o epoch do estado não expirou. */
  function copiadoAgora(chave: 'caminho' | 'sessao'): boolean {
    return copiado?.chave === chave && copiado.ate > Date.now();
  }

  /** Estatísticas (spec 2.10): 4 tiles (ferramentas, tokens in/out,
   *  subagentes — formatadores puros de detalhe-estat.ts) em grade de 2
   *  colunas + grade `dl` com Permissões ("—" quando ausente), Início
   *  (dataHoraLocal) e Duração. Seção recolhível aberta por padrão (2.7). */
  function secaoEstatisticas(a: AgentInfo, agora: number): HTMLElement {
    const t = texto.detalhe;
    const corpoSec = document.createElement('div');
    // 4 blocos legíveis: valor grande acima do rótulo pequeno (nunca colados).
    corpoSec.append(
      tiles({
        blocos: [
          { valor: formatarInt(a.stats.toolCalls), rotulo: t.statFerramentas },
          { valor: formatarTokensCompacto(a.stats.tokensIn), rotulo: t.statTokensIn },
          { valor: formatarTokensCompacto(a.stats.tokensOut), rotulo: t.statTokensOut },
          { valor: formatarInt(a.stats.subagents), rotulo: t.statSubagentes },
        ],
      }),
      // Modelo/Sessão já saíram daqui (a grade "Identificação" 2.6 os traz);
      // "—" só para Permissões realmente ausentes.
      grade({
        linhas: [
          {
            dt: t.statPermissoes,
            valor: a.permissionMode ?? t.valorNaoInformado,
            completo: a.permissionMode ?? '',
            vazio: !a.permissionMode,
          },
          { dt: t.statInicio, valor: dataHoraLocal(a.startedAt), completo: dataHoraLocal(a.startedAt) },
          {
            dt: t.statDuracao,
            valor: duracaoLegivel(Math.max(0, agora - a.startedAt)),
            completo: '',
          },
        ],
        t,
      }),
    );
    const id = 'estatisticas';
    return secao(id, t.estatisticas, { aberta: !secoesFechadas.has(id), aoAlternar: (ab) => alternaSecao(id, ab) }, corpoSec);
  }

  // ---------- Vida social (brincadeira local — o cabeçalho diz "simulado") ----------

  /** Corpo do extrato: linhas (texto + hora) em detalhe-pecas.linhaExtrato. */
  function extratoCorpo(a: AgentInfo): HTMLElement {
    const t = texto.detalhe;
    const corpoSec = document.createElement('div');
    for (const item of extratoVidaSocial(a)) {
      const txt =
        item.tipo === 'chegou'
          ? t.extratoChegou
          : t.extratoConcluiu.replace('{0}', duracaoLegivel(item.duracaoMs ?? 0));
      corpoSec.append(linhaExtrato({ texto: txt, hora: dataHoraLocal(item.at), icone: item.tipo === 'chegou' ? '🚪' : '✅' }));
    }
    return corpoSec;
  }

  /** Seção da Vida social (spec 2.11): cabeçalho com selo "simulado"; corpo
   *  em ordem — traços (chips), bordão (filete cobalto), rivais (cartões de
   *  subagente com papel "Rival", clique troca o agente), moedinhas (valor
   *  laranja) — e o Extrato como sub-seção recolhível FECHADA, terminando na
   *  nota final "Simulado, só pra diversão. Não vale nada.". */
  function secaoVidaSocial(a: AgentInfo, agora: number): HTMLElement {
    const t = texto.detalhe;
    const sumido = sumidoDe(a);
    const corpoSec = document.createElement('div');
    corpoSec.className = 'painel-vidsocial';

    // Selo "simulado" no cabeçalho (spec 2.11): `span.painel-det-sim` com
    // `title` "simulado, só pra diversão".
    const sim = document.createElement('span');
    sim.className = 'painel-det-sim';
    sim.textContent = t.ui.simulado;
    sim.title = t.vidaSocialSimulado;

    // Traços: até 2 chips derivados do comportamento real (detalhe-estat.ts).
    const duracaoMs = Math.max(0, agora - a.startedAt);
    const tracoIds = tracosDoAgente({
      status: a.status,
      toolCalls: a.stats.toolCalls,
      duracaoMs,
      atividades: a.recent,
    });
    const tracos = document.createElement('div');
    tracos.className = 'painel-det-tracos';
    for (const id of tracoIds) {
      const tr = t.tracos[id as keyof typeof t.tracos];
      tracos.append(chipTraco({ emoji: tr.emoji, rotulo: tr.rotulo, dica: tr.dica }));
    }
    corpoSec.append(tracos);

    // Bordão: frase curta da lista, escolhida por hash estável da seed.
    const bordoes = t.bordoes;
    corpoSec.append(bordao(bordoes[indexDoBorde(a.seed, bordoes.length)] ?? bordoes[0]));

    // Rivalidades: até 2 colegas da MESMA sala, ordem estável por hash
    // (FNV reexportada em detalhe-estat). Reaproveita o cartão de subagente
    // com papel "Rival" — o clique troca o agente aberto. Sumido → vazio.
    const colegas = sumido ? [] : agentes.filter((c) => c.roomId === a.roomId && c.id !== a.id && c.kind === 'main' && c.status !== 'offline');
    const listaRivais = document.createElement('ul');
    listaRivais.className = 'painel-det-lista';
    if (!colegas.length) {
      const vazio = document.createElement('p');
      vazio.className = 'painel-det-vazio';
      vazio.textContent = t.rivaisVazio;
      corpoSec.append(vazio);
    } else {
      for (const id of ordenarRivais(a.seed, colegas).slice(0, MAX_RIVAIS)) {
        const r = colegas.find((c) => c.id === id);
        if (r) listaRivais.append(cartaoSubagente({ a: r, nome: nomeExibido(r), papel: t.ui.rival, aoTrocar: () => abre(r.id) }));
      }
      corpoSec.append(listaRivais);
    }

    // Moedinhas: 1 por minuto de `working` acumulado na sessão (tempo real).
    corpoSec.append(moedas({ valor: String(moedasPorWorking(tempoWorkingSessao(a, agora))), rotulo: `${t.moedasRotulo} · ${t.moedasDica}` }));

    // Extrato: sub-seção recolhível FECHADA (spec 2.11) dentro do corpo —
    // os eventos REAIS do agente (chegou ao escritório / concluiu em X).
    const exId = SECAO_EXTRATO;
    corpoSec.append(
      secao(exId, t.extratoTitulo, { sub: true, aberta: !secoesFechadas.has(exId), aoAlternar: (ab) => alternaSecao(exId, ab) }, extratoCorpo(a)),
    );

    // Nota final: a brincadeira se rotula sozinha (spec 2.11, item 6).
    corpoSec.append(notaFinal(t.ui.notaFinal));

    const id = 'vidasocial';
    return secao(id, t.vidaSocial, { extra: sim, aberta: !secoesFechadas.has(id), aoAlternar: (ab) => alternaSecao(id, ab) }, corpoSec);
  }

  /** Agente fora do snapshot: as seções continuam com os últimos dados conhecidos. */
  function sumidoDe(a: AgentInfo): boolean {
    return !agentes.some((x) => x.id === a.id);
  }

  // ---------- render ----------
  // Repintura estável (spec 2.12): `pintar()` só roda em eventos reais (abrir,
  // snapshot, modo conteúdo, cliques de seção/mostrar mais/copiar). Antes de
  // `replaceChildren`, guarda a rolagem do corpo e o `data-foco` do elemento
  // ativo e restaura ambos depois — a gaveta aberta por 10 s não perde foco
  // nem posição. O timer de 1 s não chama `pintar`: chama `atualizarRelogios`.
  function pintar(agora: number) {
    if (!visivel || !abertoId) return;
    const live = agentes.find((a) => a.id === abertoId) ?? null;
    if (live) ultimo = live;
    if (!ultimo) return; // ainda sem dados (agente nunca veio no snapshot)

    // Guarda o estado de navegação antes de reconstruir o miolo (spec 2.12).
    const rolagem = corpo.scrollTop;
    const ativo = document.activeElement;
    const chaveFoco = ativo instanceof HTMLElement ? ativo.dataset.foco : undefined;

    const t = texto.detalhe;
    const a = ultimo;
    const sumido = !live;
    miolo.replaceChildren();

    // Estado da gaveta no escopo do CSS (spec 2.1/3): `--det-st` da raiz;
    // sumido é tratado como offline na apresentação (a gaveta guarda o último
    // `a` conhecido, só o rótulo/selo mudam).
    raiz.dataset.status = sumido ? 'offline' : a.status;

    const sala = salas.find((r) => r.id === a.roomId);
    const conta = contas.find((c) => c.id === a.account);

    // Hero (spec 2.3): avatar + nome/papel/sala + título + selos provedor·conta.
    // Provedor ausente no dado = claude (mesma regra da grade antiga).
    const seloProvedor = texto.provedor[a.provider ?? 'claude'];
    miolo.append(
      hero({
        a,
        nome: nomeExibido(a),
        salaRotulo: sala?.name ?? a.roomId,
        conta,
        titulo: a.title && !modoConteudo ? a.title : undefined,
        seloProvedor,
        // Sumido: avatar neutro offline (tabela de estados, spec 3).
        status: sumido ? 'offline' : a.status,
        t,
      }),
    );

    // Card "Agora" (spec 2.5): logo após o hero, antes do selo de estado.
    // Conteúdo por `agoraDoAgente`; offline/sumido não tem card (o builder
    // devolve null e o chamador não desenha). No modo conteúdo, texto de
    // ação/rótulo de shell é mascarado.
    const agoraCard = cartaoAgora({ a, sumido, agora, mascarado: modoConteudo, t });
    if (agoraCard) miolo.append(agoraCard);

    // Estado + ações (spec 2.4): selo, tempo no status e aviso do sumido;
    // botões só existem se `opcoes` foram ligadas em montarDetalhe.
    miolo.append(estado({ a, sumido, agora, t, opcoes }));

    // Grade "Identificação" (spec 2.6): Modelo · Caminho · Sessão — substitui
    // as linhas mono antigas (bloco Projeto/Sessão). Caminho e Sessão abrem
    // com `abreviarMeio` (32 chars, cauda 0.35 / 22) e copiam o completo
    // (closure `copiar`; o estado "copiado até T" expira e a repintura
    // reconstrói o ícone sem a classe `.is-ok`).
    const caminhoCompleto = sala?.path ?? '';
    const sessaoCompleto = a.sessionId;
    const identCorpo = document.createElement('div');
    identCorpo.append(
      grade({
        linhas: [
          {
            dt: t.modelo,
            valor: a.model ?? t.ui.modeloNaoInformado,
            completo: a.model ?? '',
            mono: true,
            vazio: !a.model,
          },
          caminhoCompleto
            ? {
                dt: t.ui.caminho,
                valor: abreviarMeio(caminhoCompleto, 32, 0.35),
                completo: caminhoCompleto,
                mono: true,
                copiar: true,
                copiado: copiadoAgora('caminho'),
                aoCopiar: () => copiar('caminho', caminhoCompleto),
              }
            : {
                dt: t.ui.caminho,
                valor: t.ui.caminhoNaoInformado,
                completo: '',
                vazio: true,
              },
          {
            dt: t.sessao,
            valor: abreviarMeio(sessaoCompleto, 22),
            completo: sessaoCompleto,
            mono: true,
            copiar: true,
            copiado: copiadoAgora('sessao'),
            aoCopiar: () => copiar('sessao', sessaoCompleto),
          },
        ],
        t,
      }),
    );
    const identId = 'identificacao';
    miolo.append(secao(identId, t.ui.identificacao, { aberta: !secoesFechadas.has(identId), aoAlternar: (ab) => alternaSecao(identId, ab) }, identCorpo));

    // Hierarquia (2.8): principal → subagentes (5 + "Mostrar mais N");
    // sub → responsável (pai).
    miolo.append(secaoHierarquia(a, sumido));

    // Linha do tempo (spec 2.9): cartões da ação mais recente ("Mostrar mais N"
    // soma 10; "Mostrar menos" volta a 6). Vazio: `painel-det-vazio`.
    const { itens, restantes, total } = fatiaAcoes(a.recent, acoesMostradas);
    const acCorpo = document.createElement('div');
    if (!a.recent.length) {
      const vazio = document.createElement('p');
      vazio.className = 'painel-det-vazio';
      vazio.textContent = t.semAcoes;
      acCorpo.append(vazio);
    } else {
      const lista = document.createElement('ol');
      lista.className = 'painel-det-lista';
      for (const at of itens) {
        lista.append(cartaoAcao({ at, agora, rotulo: rotuloAcao(at), mascarado: modoConteudo, t }));
      }
      acCorpo.append(lista);
      if (restantes > 0) {
        // "Mostrar mais N": N = min(10, restantes) (teto da spec 2.9).
        acCorpo.append(botaoMais(t.ui.mostrarMais.replace('{0}', String(Math.min(ACOES_PASSO, restantes))), () => (acoesMostradas += ACOES_PASSO)));
      } else if (total > ACOES_INICIAIS) {
        // Tudo visível e mais que a página inicial: vira "Mostrar menos".
        acCorpo.append(botaoMais(t.ui.mostrarMenos, () => (acoesMostradas = ACOES_INICIAIS)));
      }
    }
    const acId = 'linhaDoTempo';
    miolo.append(secao(acId, t.acoes, { chip: total ? String(total) : undefined, aberta: !secoesFechadas.has(acId), aoAlternar: (ab) => alternaSecao(acId, ab) }, acCorpo));

    // Estatísticas (spec 2.10, aberta por padrão): 4 tiles + grade; a Vida
    // social (2.11) é o "divertido" — o Extrato vive DENTRO dela, como
    // sub-seção fechada (não sai mais como seção de topo do miolo).
    miolo.append(secaoEstatisticas(a, agora));
    miolo.append(secaoVidaSocial(a, agora));

    // Restaura rolagem e foco depois do replaceChildren (spec 2.12): o foco
    // volta ao nó marcado com o mesmo `data-foco` (seção `sec:<id>` /
    // subagente `sub:<id>`); sem nó (ex.: ✕ da barra), o foco era fora do
    // miolo e não é resturado para ele.
    corpo.scrollTop = rolagem;
    if (chaveFoco) miolo.querySelector<HTMLElement>(`[data-foco="${chaveFoco}"]`)?.focus({ preventScroll: true });

    // LACUNA: a seção "Conversa recente" (markdown simples, só leitura) ficou fora —
    // o servidor não expõe o texto da conversa da sessão (texto.detalhe.conversaLacuna).
  }

  /** Relógios (spec 2.12): reescreve SÓ o texto dos nós `[data-epoch]` (tempo
   *  do estado + cartões da linha do tempo) — não reconstrói o miolo, então
   *  rolagem, foco e seções recolhidas sobrevivem ao tick de 1 s. Prefixo
   *  por `data-modo`: "no status há X" (status) e "há X" (ha); o "agora"
   *  dos dois modos é `quandoAgora` (mesma string nos dois, por decisão da
   *  spec D6 — `mudouAgora` não existe em texto.ts, que está fora de escopo). */
  function atualizarRelogios(agora: number): void {
    const t = texto.detalhe;
    for (const no of Array.from(raiz.querySelectorAll<HTMLElement>('[data-epoch]'))) {
      const epoch = Number(no.dataset.epoch);
      const prefixo = no.dataset.modo === 'status' ? t.ui.noStatusHa : t.ha;
      no.textContent = haTempo(epoch, agora, prefixo, t.ui.quandoAgora);
    }
  }

  function abre(id: string) {
    if (abertoId !== id) {
      abertoId = id;
      const live = agentes.find((a) => a.id === id);
      ultimo = live ?? null;
      // Troca de agente: reinicia padrões de seção (só extrato fechada),
      // paginação dos subagentes e da linha do tempo (specs 2.8/2.9).
      secoesFechadas = new Set([SECAO_EXTRATO]);
      subsMostrados = SUBS_INICIAIS;
      acoesMostradas = ACOES_INICIAIS;
      miolo.replaceChildren();
      // Trocou de agente: volta o topo do corpo (spec 2.2) e limpa a sombra da barra.
      corpo.scrollTop = 0;
      bar.classList.remove('is-rolado');
      aoRolar();
    }
    visivel = true;
    raiz.classList.remove('fechada');
    pintar(Date.now());
  }

  // ---------- relógio (spec 2.12) ----------
  // Tick de 1 s só toca nos relógios (`data-epoch`) — não repinta o miolo,
  // então rolagem/foco/seções recolhidas não se perdem enquanto a gaveta abre.
  const timer = setInterval(() => {
    if (!visivel || !abertoId) return;
    atualizarRelogios(Date.now());
  }, 1000);

  return {
    raiz,
    abre,
    fecha() {
      clearInterval(timer);
      raiz.remove();
    },
    atualizar(snapshot, agora = Date.now()) {
      agentes = snapshot.agents;
      salas = snapshot.rooms;
      contas = snapshot.accounts;
      if (visivel && abertoId) pintar(agora);
    },
    setModoConteudo(ligado) {
      modoConteudo = ligado;
      if (visivel && abertoId) pintar(Date.now());
    },
  };
}
