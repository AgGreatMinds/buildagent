// Adaptado de marmottajr/habblaud@faa1a01 client/src/ui/settings.ts + ui/prefs.ts (MIT)
// Diálogo de configurações (engrenagem da barra): sons (interruptor +
// volume), notificações do navegador, modo conteúdo/gravação, idioma PT/EN
// (salva e recarrega, como o pickLanguage do habblaud) e mostrar/ocultar
// lista/atividade/ajuda; botão "Redefinir" apaga a chave unificada e recarrega.
// As preferências vivem em prefs.ts (chave 'buildagent.prefs'); aqui só o DOM.
// Strings: texto.config (PT) ou textoEn.config (EN) conforme a escolha salva —
// o resto do app ainda é PT (estrutura pronta em texto-en.ts).
import { type ApiSom } from './som';
import { gravarPrefs, lerPrefs, removerPrefs, type Prefs } from './prefs';
import { texto } from './texto';
import { textoEn } from './texto-en';
import type { PainelId } from './types';
import './painel.css';

export interface OpcoesConfig {
  /** Motor de som (ApiSom de som.ts): receber os definirPrefs + toca as amostras. Opcional. */
  som?: ApiSom;
  /** Chama a cada mudança de preferência (o consumidor aplica setModoConteudo etc.). */
  aoMudar?: (p: Prefs) => void;
  /** O usuário ligou/desligou um painel no diálogo — repassa ao dono do toggle. */
  aoAlternarPainel?: (id: PainelId) => void;
}

export interface ApiConfig {
  /** Elemento raiz do diálogo (anexado ao body por montarConfig). */
  raiz: HTMLElement;
  /** Abre/fecha o diálogo. */
  alternar(): void;
  /** Remove o diálogo do DOM. */
  fecha(): void;
}

/** Idioma da escolha (o diálogo é a única superfície com EN). */
function textos() {
  return lerPrefs().idioma === 'en' ? textoEn.config : texto.config;
}

/** Estado real das notificações do navegador (mesma regra de avisos.ts). */
function estadoNotificacao(): 'nao-suportado' | 'recusado' | 'pendente' | 'liberado' {
  if (typeof Notification === 'undefined') return 'nao-suportado';
  if (Notification.permission === 'denied') return 'recusado';
  if (Notification.permission === 'granted') return 'liberado';
  return 'pendente';
}

export function montarConfig(opcoes: OpcoesConfig = {}): ApiConfig {
  let prefs = lerPrefs();
  const { som, aoMudar, aoAlternarPainel } = opcoes;
  const t = textos();

  // ---------- esqueleto ----------
  const raiz = document.createElement('div');
  raiz.className = 'painel-config painel';
  raiz.setAttribute('role', 'dialog');
  raiz.setAttribute('aria-label', t.titulo);
  raiz.hidden = true;

  const cab = document.createElement('div');
  cab.className = 'painel-config-cab';
  const titulo = document.createElement('h2');
  titulo.textContent = t.titulo;
  const btnFechar = document.createElement('button');
  btnFechar.type = 'button';
  btnFechar.className = 'painel-botoes';
  btnFechar.title = t.fechar;
  btnFechar.textContent = '✕';
  btnFechar.addEventListener('click', () => { raiz.hidden = true; });
  cab.append(titulo, btnFechar);

  const corpo = document.createElement('div');
  corpo.className = 'painel-config-corpo';

  /** Seção com título (h3); as linhas da seção são anexadas ao elemento retornado. */
  function secao(nome: string): HTMLElement {
    const s = document.createElement('section');
    s.className = 'painel-config-secao';
    const h3 = document.createElement('h3');
    h3.textContent = nome;
    s.append(h3);
    corpo.append(s);
    return s;
  }

  /** Linha de interruptor (reusa as classes do bloco de avisos: .painel-avisos-switch). */
  function interruptor(alvo: HTMLElement, rotulo: string, dica: string, ligado: boolean, aoAlternar: () => void): void {
    const l = document.createElement('label');
    l.className = 'painel-avisos-prefs-linha';
    l.title = dica;
    const span = document.createElement('span');
    span.textContent = rotulo;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'painel-avisos-switch';
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', String(ligado));
    b.classList.toggle('ligado', ligado);
    b.title = rotulo;
    b.addEventListener('click', () => {
      // O interruptor repinta sozinho (liga/desliga) e depois chama o destino,
      // que decide a regra real (ex.: modo conteúdo só persiste; o alvo aplica).
      b.classList.toggle('ligado', !b.classList.contains('ligado'));
      b.setAttribute('aria-checked', String(b.classList.contains('ligado')));
      aoAlternar();
    });
    l.append(span, b);
    alvo.append(l);
  }

  /** Aplica a preferência: persiste + repassa aos consumidores + atualiza o motor de som. */
  function aplica(atual: Prefs): void {
    prefs = atual;
    gravarPrefs(prefs);
    aoMudar?.(prefs);
    som?.definirPrefs({ som: prefs.som, volume: prefs.volume, notificacoes: prefs.notificacoes });
  }

  // ---------- seção Avisos: som + volume + notificações ----------
  const secaoAvisos = secao(t.secoes.avisos);
  {
    const l = document.createElement('label');
    l.className = 'painel-avisos-prefs-linha';
    l.title = t.dicaSom;
    const span = document.createElement('span');
    span.textContent = t.som;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'painel-avisos-switch';
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', String(prefs.som));
    b.classList.toggle('ligado', prefs.som);
    b.title = t.som;
    b.addEventListener('click', () => {
      aplica({ ...prefs, som: !prefs.som });
      b.classList.toggle('ligado', prefs.som);
      b.setAttribute('aria-checked', String(prefs.som));
      // Clique é gesto do usuário: ao ligar, libera o áudio e dá uma amostra.
      if (prefs.som) void som?.desbloquear().then(() => som?.tocar('estalo'));
    });
    l.append(span, b);
    secaoAvisos.append(l);
  }
  {
    // Volume 0–100 no controle (a pref guarda 0–1).
    const l = document.createElement('label');
    l.className = 'painel-avisos-prefs-linha';
    l.title = t.dicaVolume;
    const span = document.createElement('span');
    span.textContent = t.volume;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.step = '5';
    input.value = String(Math.round(prefs.volume * 100));
    input.setAttribute('aria-label', t.volume);
    input.disabled = !prefs.som;
    input.addEventListener('change', () => {
      const novo = { ...prefs, volume: Number(input.value) / 100 };
      aplica(novo);
      input.disabled = !novo.som;
      if (novo.som) void som?.desbloquear().then(() => som?.tocar('sino'));
    });
    l.append(span, input);
    secaoAvisos.append(l);
  }
  {
    // Notificações: permissão derivada (mesma regra de avisos.ts; opt-in por este clique).
    const l = document.createElement('label');
    l.className = 'painel-avisos-prefs-linha';
    l.title = t.dicaNotificacoes;
    const span = document.createElement('span');
    span.textContent = t.notificacoes;
    const est = document.createElement('span');
    est.className = 'painel-avisos-prefs-estado';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'painel-avisos-switch';
    b.setAttribute('role', 'switch');
    b.title = t.notificacoes;
    b.addEventListener('click', () => {
      void (async () => {
        if (estadoNotificacao() === 'pendente') {
          try {
            await Notification.requestPermission();
          } catch {
            // Sem resposta: o estado segue como estava.
          }
        }
        // O flag é derivado da permissão real — não é toggle livre.
        aplica({ ...prefs, notificacoes: estadoNotificacao() === 'liberado' });
        pintaNotif();
      })();
    });
    function pintaNotif(): void {
      const e = estadoNotificacao();
      est.textContent =
        e === 'liberado' ? t.notifLigadas : e === 'recusado' ? t.notifRecusadas : e === 'nao-suportado' ? t.notifNaoSuportadas : '';
      b.classList.toggle('ligado', e === 'liberado');
      b.setAttribute('aria-checked', String(e === 'liberado'));
      b.disabled = e === 'nao-suportado';
    }
    pintaNotif();
    l.append(span, est, b);
    secaoAvisos.append(l);
  }

  // ---------- seção Conteúdo: modo conteúdo/gravação ----------
  // Ligar troca nomes/títulos por rótulos genéricos; a aplicação nas superfícies
  // (setModoConteudo de lista/feed/detalhe) sai por `aoMudar` — o dono da
  // aplicação (main.ts) recebe o estado e repinta. Padrão = desligado (mostra tudo local).
  const secaoConteudo = secao(t.secoes.conteudo);
  interruptor(secaoConteudo, t.modoConteudo, t.dicaModoConteudo, prefs.modoConteudo, () => {
    aplica({ ...prefs, modoConteudo: !prefs.modoConteudo });
  });

  // ---------- seção Painéis: mostrar/ocultar lista/atividade/ajuda ----------
  const secaoPaineis = secao(t.secoes.paineis);
  interruptor(secaoPaineis, t.lista, t.dicaLista, prefs.mostrarLista, () => {
    aplica({ ...prefs, mostrarLista: !prefs.mostrarLista });
    aoAlternarPainel?.('lista');
  });
  interruptor(secaoPaineis, t.atividade, t.dicaAtividade, prefs.mostrarAtividade, () => {
    aplica({ ...prefs, mostrarAtividade: !prefs.mostrarAtividade });
    aoAlternarPainel?.('atividade');
  });
  interruptor(secaoPaineis, t.ajuda, t.dicaAjuda, prefs.mostrarAjuda, () => {
    aplica({ ...prefs, mostrarAjuda: !prefs.mostrarAjuda });
    aoAlternarPainel?.('ajuda');
  });

  // ---------- seção Idioma: segmented PT/EN (salva e recarrega, padrão do habblaud) ----------
  const secaoIdioma = secao(t.secoes.idioma);
  {
    const l = document.createElement('div');
    l.className = 'painel-avisos-prefs-linha';
    l.title = t.dicaIdioma;
    const span = document.createElement('span');
    span.textContent = t.idioma;
    const grupo = document.createElement('div');
    grupo.className = 'painel-config-seg';
    grupo.setAttribute('role', 'radiogroup');
    grupo.setAttribute('aria-label', t.idioma);
    for (const idio of ['pt', 'en'] as const) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'painel-config-seg-opt' + (prefs.idioma === idio ? ' ativo' : '');
      b.textContent = idio.toUpperCase();
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(prefs.idioma === idio));
      b.tabIndex = prefs.idioma === idio ? 0 : -1;
      b.addEventListener('click', () => {
        if (prefs.idioma === idio) return;
        aplica({ ...prefs, idioma: idio });
        location.reload(); // os textos são montados uma vez, ao carregar a página
      });
      grupo.append(b);
    }
    l.append(span, grupo);
    secaoIdioma.append(l);
  }

  // ---------- rodapé: redefinir (apaga a chave + recarrega) ----------
  const rodape = document.createElement('div');
  rodape.className = 'painel-config-rodape';
  const btnReset = document.createElement('button');
  btnReset.type = 'button';
  btnReset.className = 'painel-config-reset';
  btnReset.textContent = t.redefinir;
  btnReset.title = t.dicaRedefinir;
  btnReset.addEventListener('click', () => {
    removerPrefs();
    location.reload();
  });
  rodape.append(btnReset);

  raiz.append(cab, corpo, rodape);
  document.body.append(raiz);
  // O motor de som recebe o estado salvo no ato da montagem.
  som?.definirPrefs({ som: prefs.som, volume: prefs.volume, notificacoes: prefs.notificacoes });

  return {
    raiz,
    alternar() {
      raiz.hidden = !raiz.hidden;
      if (!raiz.hidden) raiz.focus?.();
    },
    fecha() {
      raiz.remove();
    },
  };
}
