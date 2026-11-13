// Adaptado de marmottajr/habblaud@faa1a01 client/src/ui/daystats.ts + ui/daystats-launcher.ts (MIT)
// Diálogo "Meu dia": para onde foi o dia — tempo esperando você, trabalhando,
// sessões, pedidos, tokens e custo; distribuição por hora em gráfico de barras SVG
// (escala comum a todas as colunas); por projeto; maiores esperas; e tabela alternativa
// acessível por cartão (toggle "Ver tabela").
// Lógica pura (destaques, escala, linhas, ordenação) em meudia-modelo.ts com testes;
// aqui só o DOM. Strings em texto.ts; estilo em painel.css (bloco .painel-meudia-*).
// Cortes da referência: modo demo/source, seletor de dias (só o dia de hoje),
// painel por conta, tooltip flutuante (o SVG usa <title> nativo) e legenda interativa.
import type { DayStats, DayStatsResponse } from '../../../shared/daystats';
import { totalMs } from '../../../shared/daystats';
import {
  colunasPorHora,
  deveAtualizar,
  destaques,
  ehDiaVazio,
  fusoLocal,
  formatarInt,
  formatarRelogio,
  formatarTempoAgente,
  formatarTokens,
  formatarUSD,
  linhasDeEspera,
  linhasPorProjeto,
  segmentosPorStatus,
  urlStats,
} from './meudia-modelo';
import { texto } from './texto';
import './painel.css';

/** O diálogo se atualiza sozinho a cada 30 s (só com o dia de hoje aberto — o que é sempre, aqui). */
const REFRESH_MS = 30_000;

// Dimensões do gráfico (viewBox; o CSS escala pela largura disponível).
const SVG_W = 520; // 520 (era 480): abre espaço para a margem dos rótulos sem estreitar as 24 colunas
const PLOT_H = 130; // altura do plot; o eixo X ocupa mais 16 abaixo
const MARGEM_ESQ = 60; // rótulos do eixo Y: cabe "1 h 15 min" (30 cortava até o "1" de "15 min" na borda do SVG)
const BARRA = 18; // largura de cada barra de hora

const SVGNS = 'http://www.w3.org/2000/svg';

/** Linhas da tabela alternativa do gráfico por hora (só horas com tempo). */
function linhasTabelaHoras(stats: DayStats): string[] {
  return stats.hours
    .filter((h) => totalMs(h.ms) > 0)
    .map((h) => {
      const partes = [
        h.ms.waiting > 0 ? `${texto.meudia.statusRotulos.waiting} ${formatarTempoAgente(h.ms.waiting)}` : null,
        h.ms.working > 0 ? `${texto.meudia.statusRotulos.working} ${formatarTempoAgente(h.ms.working)}` : null,
        h.ms.idle > 0 ? `${texto.meudia.statusRotulos.idle} ${formatarTempoAgente(h.ms.idle)}` : null,
        h.ms.shell > 0 ? `${texto.meudia.statusRotulos.shell} ${formatarTempoAgente(h.ms.shell)}` : null,
      ].filter(Boolean);
      return `${h.hour}h: ${partes.join(' · ')} · ${texto.meudia.total} ${formatarTempoAgente(totalMs(h.ms))}`;
    });
}

export interface ApiMeuDia {
  /** Elemento raiz (o diálogo; anexado ao body por montarMeuDia). */
  raiz: HTMLElement;
  abre(): void;
  fecha(): void;
  /** O botão "Meu dia" da barra chama isto. */
  alternar(): void;
}

/** Monta o diálogo, anexa ao body. O fetch acontece na primeira abertura. */
export function montarMeuDia(): ApiMeuDia {
  const t = texto.meudia;
  const tz = fusoLocal();
  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const dialog = document.createElement('dialog');
  dialog.className = 'painel-meudia painel';
  dialog.setAttribute('aria-labelledby', 'painel-meudia-titulo');

  const cab = document.createElement('div');
  cab.className = 'painel-meudia-cab';
  const titulo = document.createElement('h2');
  titulo.id = 'painel-meudia-titulo';
  titulo.textContent = t.titulo;
  const btnFechar = document.createElement('button');
  btnFechar.type = 'button';
  btnFechar.className = 'painel-botoes';
  btnFechar.title = t.fechar;
  btnFechar.textContent = '✕';
  cab.append(titulo, btnFechar);

  // Estado: "Carregando…"/"Atualizado às 14:30" + bloco de erro com "Tentar de novo".
  const status = document.createElement('p');
  status.className = 'painel-meudia-status';
  status.setAttribute('role', 'status');
  const erro = document.createElement('div');
  erro.className = 'painel-meudia-erro';
  erro.hidden = true;
  const erroMsg = document.createElement('p');
  const btnTentar = document.createElement('button');
  btnTentar.type = 'button';
  btnTentar.className = 'painel-meudia-tentar';
  btnTentar.textContent = t.tentar;
  erro.append(erroMsg, btnTentar);

  const corpo = document.createElement('div');
  corpo.className = 'painel-meudia-corpo';

  const nota = document.createElement('p');
  nota.className = 'painel-meudia-nota';
  nota.textContent = t.nota;

  dialog.append(cab, status, erro, corpo, nota);
  document.body.append(dialog);

  // Mesmo padrão de ajuda.ts: clique no fundo fecha; Esc fecha; "✕" fecha; o close para o refresh.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  btnFechar.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    seq++;
    pararTimer();
  });

  // ---------- carga de dados ----------

  function pararTimer(): void {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  async function carregar(): Promise<void> {
    const minhaSeq = ++seq;
    pararTimer();
    status.textContent = t.carregando;
    erro.hidden = true;
    try {
      const res = await fetch(urlStats(tz), { cache: 'no-store' });
      const corpoJson: (DayStatsResponse & { error?: string }) | null = await res.json().catch(() => null);
      if (!res.ok || !corpoJson) throw new Error(corpoJson?.error ?? `erro ${res.status}`);
      if (minhaSeq !== seq) return; // fechou (ou recarregou) no meio
      status.textContent = t.atualizadoBase.replace('{0}', formatarRelogio(corpoJson.serverTime));
      desenhar(corpoJson.stats);
      if (deveAtualizar(dialog.open, corpoJson.stats.day, corpoJson.today)) {
        timer = setTimeout(() => void carregar(), REFRESH_MS);
      }
    } catch (e) {
      if (minhaSeq !== seq) return;
      status.textContent = '';
      erroMsg.textContent = `${t.erro}${e instanceof Error ? ` (${e.message})` : ''}`;
      erro.hidden = false;
    }
  }
  btnTentar.addEventListener('click', () => void carregar());

  // ---------- desenho ----------

  function desenhar(stats: DayStats): void {
    corpo.replaceChildren();
    if (ehDiaVazio(stats)) {
      const p = document.createElement('p');
      p.className = 'painel-meudia-vazio';
      p.textContent = t.vazio;
      corpo.append(p);
      return;
    }
    corpo.append(kpis(stats), cartaoHoras(stats), cartaoProjetos(stats), cartaoEsperas(stats));
  }

  /** KPIs: "esperando você" em destaque + os demais números do dia em tiles. */
  function kpis(stats: DayStats): HTMLElement {
    const d = destaques(stats);
    const el = document.createElement('section');
    el.className = 'painel-meudia-kpis';
    el.setAttribute('aria-label', t.destaqueTitulo);

    const heroSub =
      d.esperas > 0
        ? `${formatarInt(d.esperas)} ${d.esperas === 1 ? t.espera : t.esperasSub}${d.maiorEsperaMs ? ` · ${t.maiorEspera} ${formatarTempoAgente(d.maiorEsperaMs)}` : ''}${
            d.tempoRelogioEsperaMs ? ` · ${t.alguemEsperou} ${formatarTempoAgente(d.tempoRelogioEsperaMs)}` : ''
          }`
        : t.nenhumaEspera;
    el.append(tile(t.esperandoVoce, formatarTempoAgente(d.esperandoMs), heroSub, true));
    el.append(tile(t.trabalhando, formatarTempoAgente(d.trabalhandoMs), t.somaAgentes));
    el.append(tile(t.sessoes, `${formatarInt(d.sessoes)} · ${formatarInt(d.subagentes)}`, t.sessoesSub));
    el.append(
      tile(
        t.pedidos,
        formatarInt(d.pedidos),
        `${formatarInt(d.ferramentas)} ${t.ferramentasSub} · ${formatarInt(d.tarefasConcluidas)} ${t.tarefasSub}`,
      ),
    );
    el.append(
      tile(
        t.tokens,
        formatarTokens(d.tokensIn + d.tokensOut),
        `${formatarTokens(d.tokensIn)} ${t.entrada} · ${formatarTokens(d.tokensOut)} ${t.saida}`,
      ),
    );
    el.append(
      tile(
        t.custo,
        d.custoUSD > 0 ? formatarUSD(d.custoUSD) : '—',
        d.custoUSD > 0 ? t.custoDica : d.tokensIn + d.tokensOut > 0 ? t.custoNaoGravado : t.semGasto,
      ),
    );
    return el;

    function tile(label: string, valor: string, sub: string, hero = false): HTMLElement {
      const k = document.createElement('div');
      k.className = `painel-meudia-kpi${hero ? ' hero' : ''}`;
      const l = document.createElement('p');
      l.className = 'painel-meudia-kpi-label';
      l.textContent = label;
      const v = document.createElement('p');
      v.className = 'painel-meudia-kpi-valor';
      v.textContent = valor;
      const s = document.createElement('p');
      s.className = 'painel-meudia-kpi-sub';
      s.textContent = sub;
      k.append(l, v, s);
      return k;
    }
  }

  /**
   * "Por hora": barras empilhadas SVG com escala comum; cada hora em curso ganha destaque.
   * Dica com <title> nativo (sem tooltip flutuante). O toggle "Ver tabela" troca por
   * a versão textual acessível; sem hora com tempo, o toggle some.
   */
  function cartaoHoras(stats: DayStats): HTMLElement {
    const tabela = linhasTabelaHoras(stats);
    const secao = cartao('painel-meudia-horas', t.porHora, t.porHoraSub, tabela.length > 0);
    secao.botaoTabela.addEventListener('click', () => {
      const mostrar = secao.botaoTabela.getAttribute('aria-pressed') !== 'true';
      secao.botaoTabela.textContent = mostrar ? t.verGráfico : t.verTabela;
      secao.botaoTabela.setAttribute('aria-pressed', String(mostrar));
      secao.corpo.replaceChildren(mostrar ? tabelaElemento(tabela) : svgPorHora(stats));
    });
    secao.corpo.append(svgPorHora(stats));
    return secao.el;
  }

  function svgPorHora(stats: DayStats): SVGSVGElement {
    const { colunas, escala } = colunasPorHora(stats.hours, Date.now());
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.classList.add('painel-meudia-svg');
    svg.setAttribute('viewBox', `0 0 ${SVG_W} ${PLOT_H + 16}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', t.graficoAria);
    const slot = (SVG_W - MARGEM_ESQ) / 24;

    // Marcas do eixo Y (linhas horizontais) + rótulo de cada marca à esquerda.
    for (const m of escala.marcasMs) {
      const y = PLOT_H - (m / escala.maxMs) * (PLOT_H - 10);
      const linha = document.createElementNS(SVGNS, 'line');
      linha.setAttribute('x1', String(MARGEM_ESQ)); // grelha começa depois dos rótulos (antes passava por baixo deles)
      linha.setAttribute('x2', String(SVG_W));
      linha.setAttribute('y1', y.toFixed(1));
      linha.setAttribute('y2', y.toFixed(1));
      linha.classList.add('painel-meudia-grelha');
      svg.append(linha);
      const rot = document.createElementNS(SVGNS, 'text');
      rot.setAttribute('x', String(MARGEM_ESQ - 4));
      rot.setAttribute('y', (y + 3).toFixed(1));
      rot.setAttribute('text-anchor', 'end');
      rot.classList.add('painel-meudia-eixo-txt');
      rot.textContent = formatarTempoAgente(m);
      svg.append(rot);
    }

    // Barras empilhadas: uma coluna por hora com tempo, na escala comum.
    for (const c of colunas) {
      const fatias = segmentosPorStatus(c.ms, escala.maxMs);
      if (!fatias.length) continue;
      const g = document.createElementNS(SVGNS, 'g');
      if (c.agora) g.classList.add('painel-meudia-hora-agora');
      const x = MARGEM_ESQ + c.hora * slot + (slot - BARRA) / 2;
      let topo = PLOT_H;
      for (const f of fatias) {
        const altura = (f.pct / 100) * (PLOT_H - 10);
        topo -= altura;
        const rect = document.createElementNS(SVGNS, 'rect');
        rect.setAttribute('x', x.toFixed(1));
        rect.setAttribute('y', topo.toFixed(1));
        rect.setAttribute('width', String(BARRA));
        rect.setAttribute('height', altura.toFixed(1));
        rect.setAttribute('rx', '2');
        rect.classList.add('painel-meudia-fatia', `painel-meudia-fatia-${f.status}`);
        g.append(rect);
      }
      // Dica nativa (<title>): a hora, cada status com tempo e o total.
      const dica = document.createElementNS(SVGNS, 'title');
      dica.textContent = `${c.rotulo}: ${fatias
        .map((f) => `${texto.status[f.status as 'waiting' | 'working' | 'idle' | 'shell']} ${formatarTempoAgente(f.ms)}`)
        .join(', ')} · ${t.total} ${formatarTempoAgente(c.totalMs)}${c.agora ? ` · ${t.agora}` : ''}`;
      g.append(dica);
      svg.append(g);

      // Rótulo do eixo X (a cada 3 horas; a hora em curso também, sempre).
      if (c.rotuloEixo || c.agora) {
        const rot = document.createElementNS(SVGNS, 'text');
        rot.setAttribute('x', String(MARGEM_ESQ + c.hora * slot + slot / 2));
        rot.setAttribute('y', String(PLOT_H + 12));
        rot.setAttribute('text-anchor', 'middle');
        rot.classList.add('painel-meudia-eixo-txt');
        rot.textContent = `${c.hora}h`;
        svg.append(rot);
      }
    }
    return svg;
  }

  function tabelaElemento(linhas: string[]): HTMLElement {
    const ul = document.createElement('ul');
    ul.className = 'painel-meudia-tabela';
    for (const l of linhas) {
      const li = document.createElement('li');
      li.textContent = l;
      ul.append(li);
    }
    return ul;
  }

  /** "Por projeto": barra horizontal por sala (destaque de espera à esquerda), escala comum. */
  function cartaoProjetos(stats: DayStats): HTMLElement {
    const { linhas, escalaMs } = linhasPorProjeto(stats.rooms);
    const tabela = linhas.map(
      (l) => `${l.nome}: ${t.esperandoVoce} ${formatarTempoAgente(l.aguardandoMs)} · ${t.total} ${formatarTempoAgente(l.totalMs)}`,
    );
    const secao = cartao('painel-meudia-projetos', t.porProjeto, t.porProjetoSub, tabela.length > 0);
    secao.botaoTabela.addEventListener('click', () => {
      const mostrar = secao.botaoTabela.getAttribute('aria-pressed') !== 'true';
      secao.botaoTabela.textContent = mostrar ? t.verGráfico : t.verTabela;
      secao.botaoTabela.setAttribute('aria-pressed', String(mostrar));
      secao.corpo.replaceChildren(mostrar ? tabelaElemento(tabela) : barrasProjetos(linhas, escalaMs));
    });
    secao.corpo.append(linhas.length ? barrasProjetos(linhas, escalaMs) : vazio(t.semProjetos));
    return secao.el;
  }

  function barrasProjetos(linhas: { nome: string; totalMs: number; aguardandoMs: number; pct: number }[], escalaMs: number): HTMLElement {
    const ul = document.createElement('ul');
    ul.className = 'painel-meudia-projetos';
    for (const l of linhas) {
      const li = document.createElement('li');
      li.className = 'painel-meudia-projeto';
      const cab = document.createElement('div');
      cab.className = 'painel-meudia-projeto-cab';
      const nome = document.createElement('span');
      nome.className = 'painel-meudia-projeto-nome';
      nome.textContent = l.nome;
      const nums = document.createElement('span');
      nums.className = 'painel-meudia-projeto-nums';
      nums.textContent = l.aguardandoMs
        ? `${formatarTempoAgente(l.aguardandoMs)} ${t.esperandoVoce} · ${formatarTempoAgente(l.totalMs)} ${t.total}`
        : `${formatarTempoAgente(l.totalMs)} ${t.total}`;
      cab.append(nome, nums);
      const barra = document.createElement('span');
      barra.className = 'painel-meudia-projeto-barra';
      barra.title = `${l.nome}: ${t.total} ${formatarTempoAgente(l.totalMs)}`;
      const preench = document.createElement('span');
      preench.className = 'painel-meudia-projeto-preench';
      preench.style.width = `${l.pct}%`;
      barra.append(preench);
      if (l.aguardandoMs > 0) {
        const espera = document.createElement('span');
        espera.className = 'painel-meudia-projeto-espera';
        espera.style.width = `${(l.aguardandoMs / (escalaMs || 1)) * 100}%`;
        barra.append(espera);
      }
      li.append(cab, barra);
      ul.append(li);
    }
    return ul;
  }

  /** "Maiores esperas": ranking com barrinha proporcional à maior espera. */
  function cartaoEsperas(stats: DayStats): HTMLElement {
    const linhas = linhasDeEspera(stats.waits);
    const tabela = linhas.map((l) =>
      `#${l.posicao} ${formatarTempoAgente(l.ms)} — ${l.nomeAgente} ${t.emProjeto} ${l.nomeProjeto} · ${
        l.emCurso ? t.esperandoAgora : `${formatarRelogio(l.inicio)}–${formatarRelogio(l.fim)}`
      }${l.motivo ? ` · ${l.motivo}` : ''}`,
    );
    const secao = cartao('painel-meudia-esperas', t.maiorEsperas, t.maiorEsperasSub, tabela.length > 0);
    secao.botaoTabela.addEventListener('click', () => {
      const mostrar = secao.botaoTabela.getAttribute('aria-pressed') !== 'true';
      secao.botaoTabela.textContent = mostrar ? t.verGráfico : t.verTabela;
      secao.botaoTabela.setAttribute('aria-pressed', String(mostrar));
      secao.corpo.replaceChildren(mostrar ? tabelaElemento(tabela) : rankingEsperas(linhas));
    });
    secao.corpo.append(linhas.length ? rankingEsperas(linhas) : vazio(t.semEsperas));
    return secao.el;
  }

  function rankingEsperas(linhas: ReturnType<typeof linhasDeEspera>): HTMLElement {
    const ol = document.createElement('ol');
    ol.className = 'painel-meudia-esperas-lista';
    for (const l of linhas) {
      const li = document.createElement('li');
      li.className = `painel-meudia-espera-item${l.emCurso ? ' em-curso' : ''}`;
      const linha1 = document.createElement('div');
      linha1.className = 'painel-meudia-espera-linha1';
      const dur = document.createElement('strong');
      dur.textContent = formatarTempoAgente(l.ms);
      const nome = document.createElement('span');
      nome.className = 'painel-meudia-espera-nome';
      nome.textContent = `${l.nomeAgente} · ${l.nomeProjeto}`;
      const quando = document.createElement('span');
      quando.className = 'painel-meudia-espera-quando';
      quando.textContent = l.emCurso
        ? `${t.desde} ${formatarRelogio(l.inicio)}${l.motivo ? ` · ${l.motivo}` : ''}`
        : `${formatarRelogio(l.inicio)}–${formatarRelogio(l.fim)}${l.motivo ? ` · ${l.motivo}` : ''}`;
      linha1.append(dur, nome, quando);
      const barra = document.createElement('span');
      barra.className = 'painel-meudia-espera-barra';
      const preench = document.createElement('span');
      preench.className = 'painel-meudia-espera-preench';
      preench.style.width = `${l.pct}%`;
      barra.append(preench);
      li.append(linha1, barra);
      ol.append(li);
    }
    return ol;
  }

  function vazio(msg: string): HTMLElement {
    const p = document.createElement('p');
    p.className = 'painel-meudia-vazio';
    p.textContent = msg;
    return p;
  }

  /**
   * Cartão genérico: título + subtítulo + toggle "Ver tabela"/"Ver gráfico" (o toggle
   * só aparece quando `comTabela` — a tabela é a versão acessível do conteúdo do cartão).
   */
  function cartao(id: string, titulo: string, sub: string, comTabela: boolean): {
    el: HTMLElement;
    corpo: HTMLElement;
    botaoTabela: HTMLButtonElement;
  } {
    const el = document.createElement('section');
    el.className = 'painel-meudia-cartao';
    el.setAttribute('aria-labelledby', id);
    const cab = document.createElement('div');
    cab.className = 'painel-meudia-cartao-cab';
    const h3 = document.createElement('h3');
    h3.id = id;
    h3.textContent = titulo;
    const subEl = document.createElement('p');
    subEl.className = 'painel-meudia-cartao-sub';
    subEl.textContent = sub;
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'painel-meudia-tabela-btn';
    botao.textContent = t.verTabela;
    botao.setAttribute('aria-pressed', 'false');
    botao.hidden = !comTabela;
    cab.append(h3, subEl, botao);
    const corpo = document.createElement('div');
    corpo.className = 'painel-meudia-cartao-corpo';
    el.append(cab, corpo);
    return { el, corpo, botaoTabela: botao };
  }

  return {
    raiz: dialog,
    abre() {
      if (!dialog.open) {
        dialog.showModal();
        void carregar();
      }
    },
    fecha() {
      if (dialog.open) dialog.close();
    },
    alternar() {
      if (dialog.open) dialog.close();
      else {
        dialog.showModal();
        void carregar();
      }
    },
  };
}
