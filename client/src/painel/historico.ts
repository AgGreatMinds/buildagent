// Adaptado de marmottajr/habblaud@faa1a01 client/src/ui/history.ts (MIT)
// Diálogo "Histórico": sessões antigas (Claude/Codex/OpenCode) com data,
// projeto, duração e status final — somente leitura, com busca e filtro por status.
// Padrão da "Meu dia" (meudia.ts): <dialog> próprio, fetch na abertura, Esc/fundo
// fecham. Lógica pura (parse, busca, agrupamento, formatação) em
// historico-modelo.ts com testes; aqui só o DOM. Strings em texto.ts;
// estilo em painel.css (bloco .painel-historico-*).
// A rota s2 (/api/history) ainda não existe: ausente/404 → [] + estado vazio
// claro. Cortes da referência: popover→dialog, terminal/conversa (somente leitura)
// e chips de conta (os dados de conta ficam em uso.ts).
import {
  agruparPorDia,
  formatarData,
  formatarDuracao,
  filtrarSessoes,
  parseHistorico,
  type SessaoHistorica,
} from './historico-modelo';
import { texto } from './texto';
import './painel.css';

/** URL da rota s2-historico (contrato local: `{ sessions: [...] }`). */
export const URL_HISTORICO = '/api/history';

export interface ApiHistorico {
  /** Elemento raiz (o diálogo; anexado ao body por montarHistorico). */
  raiz: HTMLElement;
  abre(): void;
  fecha(): void;
  /** O botão "Histórico" da barra chama isto. */
  alternar(): void;
}

/** Monta o diálogo e anexa ao body. O fetch acontece a cada abertura. */
export function montarHistorico(): ApiHistorico {
  const t = texto.historico;
  let seq = 0; // descarta fetch que volta depois que o diálogo fechou

  const dialog = document.createElement('dialog');
  dialog.className = 'painel-historico painel';
  dialog.setAttribute('aria-labelledby', 'painel-historico-titulo');

  const cab = document.createElement('div');
  cab.className = 'painel-historico-cab';
  const titulo = document.createElement('h2');
  titulo.id = 'painel-historico-titulo';
  titulo.textContent = t.titulo;
  const btnFechar = document.createElement('button');
  btnFechar.type = 'button';
  btnFechar.className = 'painel-botoes';
  btnFechar.title = t.fechar;
  btnFechar.textContent = '✕';
  cab.append(titulo, btnFechar);

  // Filtros: busca (título/projeto/provedor, sem acento) + status final.
  const filtros = document.createElement('div');
  filtros.className = 'painel-historico-filtros';
  const busca = document.createElement('input');
  busca.type = 'search';
  busca.setAttribute('placeholder', t.dicaBusca);
  busca.setAttribute('aria-label', t.dicaBusca);
  busca.autocomplete = 'off';
  busca.spellcheck = false;
  const selStatus = document.createElement('select');
  selStatus.setAttribute('aria-label', t.dicaStatus);
  const opTodos = document.createElement('option');
  opTodos.value = '';
  opTodos.textContent = t.todosStatus;
  selStatus.append(opTodos);
  filtros.append(busca, selStatus);

  // Estado: "Carregando…" / erro com "Tentar de novo".
  const status = document.createElement('p');
  status.className = 'painel-historico-status';
  status.setAttribute('role', 'status');
  const erro = document.createElement('div');
  erro.className = 'painel-historico-erro';
  erro.hidden = true;
  const erroMsg = document.createElement('p');
  const btnTentar = document.createElement('button');
  btnTentar.type = 'button';
  btnTentar.className = 'painel-historico-tentar';
  btnTentar.textContent = t.tentar;
  erro.append(erroMsg, btnTentar);

  const corpo = document.createElement('div');
  corpo.className = 'painel-historico-corpo';
  const resumo = document.createElement('p');
  resumo.className = 'painel-historico-resumo';

  dialog.append(cab, filtros, status, erro, corpo, resumo);
  document.body.append(dialog);

  // Mesmo padrão da ajuda.ts / meudia.ts: clique no fundo fecha; Esc fecha; ✕ fecha.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  btnFechar.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    seq++;
  });

  let sessoes: SessaoHistorica[] = [];

  // ---------- carga de dados ----------

  async function carregar(): Promise<void> {
    const minhaSeq = ++seq;
    status.textContent = t.carregando;
    erro.hidden = true;
    try {
      const res = await fetch(URL_HISTORICO, { cache: 'no-store' });
      // Rota ausente (404) ou resposta de outro formato → lista vazia, não erro:
      // o estado vazio explica o que falta (s2-historico ainda não existe).
      const json: unknown = res.ok ? await res.json().catch(() => null) : null;
      if (minhaSeq !== seq) return; // fechou no meio
      sessoes = parseHistorico(json);
      desenhar();
    } catch {
      if (minhaSeq !== seq) return;
      sessoes = [];
      erroMsg.textContent = t.erro;
      erro.hidden = false;
      status.textContent = '';
      desenhar();
    }
  }
  btnTentar.addEventListener('click', () => void carregar());

  // ---------- desenho ----------

  function opcoesDeStatus(): void {
    // Mantém a opção atual (se existir na nova lista) e devolve "Todos" quando o
    // valor em uso sumiu.
    const atual = selStatus.value;
    const statusFinais = [...new Set(sessoes.map((s) => s.statusFinal).filter((x): x is string => !!x))];
    selStatus.replaceChildren(opTodos, ...statusFinais.map((v) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = v;
      return o;
    }));
    selStatus.value = statusFinais.includes(atual) ? atual : '';
  }

  function desenhar(): void {
    opcoesDeStatus();
    const q = busca.value.trim();
    const shown = filtrarSessoes(sessoes, q, selStatus.value);
    corpo.replaceChildren();
    if (sessoes.length === 0 && erro.hidden) {
      const v = document.createElement('p');
      v.className = 'painel-historico-vazio';
      v.textContent = t.vazio;
      corpo.append(v);
    } else {
      for (const dia of agruparPorDia(shown, Date.now())) {
        const grupo = document.createElement('section');
        grupo.className = 'painel-historico-dia';
        grupo.setAttribute('aria-label', dia.rotulo);
        const rotulo = document.createElement('h3');
        rotulo.className = 'painel-historico-dia-label';
        rotulo.textContent = dia.rotulo;
        grupo.append(rotulo);
        for (const s of dia.sessoes) grupo.append(item(s));
        corpo.append(grupo);
      }
    }
    // Rodapé: contagem filtrada ("3 de 12 sessões") ou o total sem filtro.
    resumo.textContent =
      shown.length || sessoes.length
        ? sessoes.length === shown.length
          ? `${sessoes.length} ${sessoes.length === 1 ? t.sessao : t.sessoes}`
          : `${shown.length} de ${sessoes.length} ${t.sessoes}`
        : q || selStatus.value
          ? `${t.semResultado} “${q || selStatus.value}”`
          : '';
  }

  function item(s: SessaoHistorica): HTMLElement {
    const div = document.createElement('div');
    div.className = 'painel-historico-item';
    div.title = [s.titulo ?? t.semTitulo, s.projeto ?? '', texto.provedor[s.provedor], formatarData(s.data)].filter(Boolean).join(' · ');
    const tituloEl = document.createElement('span');
    tituloEl.className = 'painel-historico-item-titulo';
    tituloEl.textContent = s.titulo || t.semTitulo;
    const meta = document.createElement('span');
    meta.className = 'painel-historico-item-meta';
    if (s.projeto) meta.append(rotulo(s.projeto.split('/').filter(Boolean).pop() ?? s.projeto)); // só o nome da pasta; o caminho inteiro vai no title
    meta.append(rotulo(formatarData(s.data)));
    const seloProv = document.createElement('span');
    seloProv.className = 'painel-selo painel-selo-provedor';
    seloProv.textContent = texto.provedor[s.provedor];
    meta.append(seloProv);
    // Duração e status final só aparecem quando o contrato s2 trouxer os campos.
    const seloDur = document.createElement('span');
    seloDur.className = 'painel-historico-selo-status' + (s.duracaoMs === undefined ? ' vazio' : '');
    seloDur.textContent = s.duracaoMs !== undefined ? formatarDuracao(s.duracaoMs) : t.semDuracao;
    meta.append(seloDur);
    if (s.statusFinal) {
      const seloStatus = document.createElement('span');
      seloStatus.className = 'painel-selo painel-historico-selo-status';
      seloStatus.textContent = s.statusFinal;
      meta.append(seloStatus);
    }
    div.append(tituloEl, meta);
    return div;

    function rotulo(v: string): HTMLElement {
      const r = document.createElement('span');
      r.textContent = v;
      return r;
    }
  }

  // Filtros reexecutam o desenho local (sem novo fetch).
  busca.addEventListener('input', desenhar);
  selStatus.addEventListener('change', desenhar);

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
