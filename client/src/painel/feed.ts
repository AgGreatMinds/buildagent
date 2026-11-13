// Adaptado de marmottajr/habblaud@faa1a01 client/src/ui/feed.ts (MIT)
// Painel inferior de atividade (recolhível; gaveta no mobile): hora, agente, projeto e o que
// mudou — as linhas vêm do RastreadorAtividade (atividade.ts, testado) + texto.ts + tempo.ts.
// Aqui só o DOM. Fonte de verdade dos dados: shared/types.ts.
import type { OfficeSnapshot } from '../../../shared/types';
import { RastreadorAtividade, nomeDaLinha, textoDaLinha, type LinhaFeed } from './atividade';
import { tempoDesde } from './tempo';
import { texto } from './texto';
import './painel.css';

/** Linhas visíveis no painel (o histórico do rastreador guarda até 200; mostra as últimas 50). */
const VISIVEIS = 50;

export interface ApiFeed {
  /** Elemento raiz (anexado ao body pelo montarFeed). */
  raiz: HTMLDivElement;
  /** Alimenta o painel com um snapshot novo (deriva as linhas da diferença com o anterior). */
  atualizar(snapshot: Pick<OfficeSnapshot, 'rooms' | 'agents' | 'serverTime'>): void;
  /** Abre/fecha o painel (botão "Atividade" da barra); devolve o estado novo. */
  alternar(): boolean;
  /** Modo conteúdo (privacidade): true troca nomes/títulos por rótulos genéricos. Padrão = desligado. */
  setModoConteudo(ligado: boolean): void;
  /** Remove o painel do DOM. */
  fecha(): void;
}

export interface OpcoesFeed {
  /**
   * Apelido local da sala (projetos) para exibição: o nome de `salaNome` da linha e do
   * ticker passa por ele (o RastreadorAtividade de atividade.ts fica intocado — a
   * máscara é só de display). Ausente = mostra o nome do snapshot.
   */
  apelidoDe?: (salaId: string) => string | undefined;
}

/** Hora curta HH:MM (relógio local) para as linhas do feed. */
function horaRelogio(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function montarFeed({ apelidoDe }: OpcoesFeed = {}): ApiFeed {
  const rastreador = new RastreadorAtividade(200);
  let modoConteudo = false;

  // ---------- esqueleto do DOM ----------
  const raiz = document.createElement('div');
  raiz.className = 'painel-feed painel';

  const cab = document.createElement('div');
  cab.className = 'painel-feed-cab';
  const titulo = document.createElement('h2');
  titulo.textContent = texto.feed.tituloPainel;
  const ticker = document.createElement('span');
  ticker.className = 'painel-feed-ticker';
  ticker.title = texto.feed.ticker;
  const spacer = document.createElement('span');
  spacer.className = 'grow';
  const btnRecolher = document.createElement('button');
  btnRecolher.className = 'painel-botoes';
  btnRecolher.title = texto.feed.dicaRecolher;
  btnRecolher.textContent = '›';
  cab.append(titulo, ticker, spacer, btnRecolher);

  const corpo = document.createElement('div');
  corpo.className = 'painel-feed-corpo';

  // Botão flutuante de mobile (gaveta: abre o painel de baixo).
  const btnFlutuante = document.createElement('button');
  btnFlutuante.className = 'painel-feed-flutuante painel';
  btnFlutuante.textContent = '≡';
  btnFlutuante.title = texto.feed.tituloPainel;

  // Estado da gaveta no mobile: desktop começa aberto, mobile começa fechado
  // (a gaveta só abre com o botão flutuante).
  let aberto = false; // nasce recolhido (só abre pelo botão "Atividade" da barra): aberto cobria a base da cena
  function aplicarEstadoGaveta() {
    const emGaveta = matchMedia('(max-width: 760px)').matches;
    raiz.classList.toggle('fechada', !aberto);
    btnFlutuante.classList.toggle('escondido', !emGaveta || aberto);
  }
  aplicarEstadoGaveta();
  addEventListener('resize', aplicarEstadoGaveta);
  document.body.append(raiz, btnFlutuante);

  // ---------- render ----------
  // Apelido local da sala (se o main.ts passou um): exibição só — a linha guarda o
  // nome do snapshot; o apelido é aplicado na hora de pintar.
  const nomeSala = (l: LinhaFeed): string => (l.salaId && apelidoDe ? apelidoDe(l.salaId) : undefined) ?? l.salaNome;

  function pintar(linhas = rastreador.linhas, agora = Date.now()) {
    const visiveis = linhas.slice(-VISIVEIS);
    corpo.innerHTML = '';
    if (!visiveis.length) {
      const vazio = document.createElement('p');
      vazio.className = 'painel-vazio';
      vazio.textContent = texto.feed.vazio;
      corpo.append(vazio);
    }
    for (const l of visiveis) {
      const linha = document.createElement('div');
      linha.className = 'painel-feed-linha' + (l.tipo === 'status' && l.status ? ` status-${l.status}` : '');
      const time = document.createElement('time');
      time.textContent = horaRelogio(l.hora);
      time.dateTime = new Date(l.hora).toISOString();
      const quem = document.createElement('span');
      quem.className = 'painel-feed-quem';
      // Modo conteúdo: o nome real é trocado por rótulo genérico (texto nunca muda depois,
      // por isso repintar tudo ao trocar o modo — setModoConteudo chama pintar).
      quem.textContent = nomeDaLinha(l, modoConteudo);
      const projeto = document.createElement('span');
      projeto.className = 'painel-feed-projeto';
      projeto.textContent = nomeSala(l);
      const oQue = document.createElement('span');
      oQue.className = 'painel-feed-oque';
      oQue.textContent = `${l.icone} ${textoDaLinha(l, modoConteudo)}`;
      const tempo = document.createElement('span');
      tempo.className = 'painel-feed-tempo';
      tempo.textContent = `há ${tempoDesde(l.hora, agora)}`;
      linha.append(time, quem, projeto, oQue, tempo);
      corpo.append(linha);
    }
    // Ticker do cabeçalho: o último evento (útil com o painel recolhido).
    const ultimo = visiveis[visiveis.length - 1];
    ticker.textContent = ultimo ? `${nomeDaLinha(ultimo, modoConteudo)} ${nomeSala(ultimo)} ${ultimo.icone} ${textoDaLinha(ultimo, modoConteudo)}` : '';
  }

  const alternar = () => {
    aberto = !aberto;
    aplicarEstadoGaveta();
    return aberto;
  };
  btnRecolher.addEventListener('click', alternar);
  btnFlutuante.addEventListener('click', () => {
    aberto = true;
    aplicarEstadoGaveta();
  });

  // Relógio "há X": repinta 1×/s apenas com o painel aberto e com linhas.
  let ultimoRelogio = 0;
  const timer = setInterval(() => {
    if (raiz.classList.contains('fechada') || !rastreador.linhas.length) return;
    const agora = Date.now();
    if (agora - ultimoRelogio >= 1000) {
      ultimoRelogio = agora;
      pintar();
    }
  }, 1000);

  return {
    raiz,
    alternar,
    atualizar(snapshot) {
      ultimoRelogio = snapshot.serverTime ?? Date.now();
      rastreador.atualizar(snapshot.agents, snapshot.rooms, ultimoRelogio);
      pintar();
    },
    setModoConteudo(ligado) {
      modoConteudo = ligado;
      pintar();
    },
    fecha() {
      clearInterval(timer);
      raiz.remove();
      btnFlutuante.remove();
    },
  };
}
