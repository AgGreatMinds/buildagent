// Adaptado de marmottajr/habblaud@faa1a01 client/src/ui/help.ts (MIT)
// Diálogo "Como ler o prédio" (botão `?`): legenda de status/cores, o espaço do prédio
// (áreas comuns com a regra de 30 min, fileiras de projeto, sala de guerra, andar 2),
// câmeras/teclas e a ressalva de dados de EXEMPLO. Aqui só o DOM; as strings em texto.ts.
// Sem referência a pixel art nem ao Habblaud — a legenda fala do prédio 3D deste app.
import { texto } from './texto';
import type { AgentStatus } from '../../../shared/types';
import './painel.css';

export interface ApiAjuda {
  /** Abre (ou não faz nada se já estiver aberto) o diálogo. */
  abre(): void;
  /** Fecha o diálogo. */
  fecha(): void;
}

/** Diálogo nativo (<dialog> + showModal: fundo escurecido, Esc fecha, foco preso). */
export function montarAjuda(): ApiAjuda {
  const t = texto.ajuda;
  const dialog = document.createElement('dialog');
  dialog.className = 'painel-ajuda';
  dialog.setAttribute('aria-labelledby', 'painel-ajuda-titulo');

  const cab = document.createElement('div');
  cab.className = 'painel-ajuda-cab';
  const titulo = document.createElement('h2');
  titulo.id = 'painel-ajuda-titulo';
  titulo.textContent = t.titulo;
  const btnFechar = document.createElement('button');
  btnFechar.className = 'painel-botoes';
  btnFechar.title = t.fechar;
  btnFechar.textContent = '✕';
  cab.append(titulo, btnFechar);

  const corpo = document.createElement('div');
  corpo.className = 'painel-ajuda-corpo';

  // Seção de legenda: título + itens (chave + descrição). A seção de status usa cor
  // (mesma variável --status-* da lista) e o rótulo de texto.status; as demais usam <kbd>.
  function secao(id: string, nome: string, itens: Array<[string, string]>, comCor: boolean): HTMLElement {
    const s = document.createElement('section');
    const h3 = document.createElement('h3');
    h3.id = id;
    h3.textContent = nome;
    const ul = document.createElement('ul');
    ul.className = 'painel-ajuda-lista';
    for (const [rotulo, descricao] of itens) {
      const li = document.createElement('li');
      const chave = document.createElement(comCor ? 'span' : 'kbd');
      chave.className = comCor ? `painel-ajuda-chave painel-selo-status status-${rotulo}` : 'painel-ajuda-kbd';
      chave.textContent = comCor ? texto.status[rotulo as AgentStatus] : rotulo;
      const desc = document.createElement('span');
      desc.className = 'painel-ajuda-desc';
      desc.textContent = descricao;
      li.append(chave, desc);
      ul.append(li);
    }
    s.append(h3, ul);
    return s;
  }
  // Seção de parágrafos (o espaço e a ressalva de EXEMPLO).
  function secaoTexto(nome: string, paragrafos: string[]): HTMLElement {
    const s = document.createElement('section');
    const h3 = document.createElement('h3');
    h3.textContent = nome;
    s.append(h3);
    for (const p of paragrafos) {
      const par = document.createElement('p');
      par.className = 'painel-ajuda-p';
      par.textContent = p;
      s.append(par);
    }
    return s;
  }

  corpo.append(
    (() => {
      const s = document.createElement('p');
      s.className = 'painel-ajuda-p painel-ajuda-intro';
      s.textContent = t.intro;
      return s;
    })(),
    secao('ajuda-status', t.secoes.status, t.status, true),
    secaoTexto(t.secoes.espaco, t.espaco),
    secao('ajuda-controles', t.secoes.controles, t.controles, false),
    secaoTexto(t.secoes.exemplo, [t.exemplo]),
  );

  dialog.append(cab, corpo);
  document.body.append(dialog);

  // Clique no fundo (fora do conteúdo) fecha; Esc já fecha o <dialog>.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  btnFechar.addEventListener('click', () => dialog.close());

  return {
    abre() {
      if (!dialog.open) dialog.showModal();
    },
    fecha() {
      dialog.close();
    },
  };
}
