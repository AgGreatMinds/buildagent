// Adaptado de marmottajr/habblaud@faa1a01 client/src/ui/topbar.ts + ui/model.ts (computeCounters) (MIT)
// Barra superior do painel: contadores agregados do snapshot
// atual (salas, agentes, trabalhando, precisam de você) + botões que abrem/fecham
// lista/atividade/ajuda/uso/meudia (destino via onToggle; "meudia" abre o diálogo de estatísticas)
// e o botão "Replay" desabilitado ("em breve").
// A lógica pura de contagem (contagensDoSnapshot) fica testada em barra.test.ts;
// aqui só o DOM. Strings em texto.ts; estilo em painel.css (variáveis no bloco da barra).
import { texto } from './texto';
import type { Contagens, PainelId, SnapPainel } from './types';

const IDS = ['salas', 'agentes', 'trabalhando', 'precisamDeVoce'] as const;

/** Agrrega os contadores da barra a partir do snapshot. Puro: sem DOM, sem relógio. */
export function contagensDoSnapshot(snap: SnapPainel | null | undefined): Contagens {
  const c: Contagens = { salas: 0, agentes: 0, trabalhando: 0, precisamDeVoce: 0 };
  if (!snap) return c;
  c.salas = snap.rooms.length;
  for (const a of snap.agents) {
    if (a.status === 'offline') continue; // quem saiu do prédio não conta mais
    c.agentes++;
    if (a.status === 'working') c.trabalhando++;
    if (a.status === 'waiting') c.precisamDeVoce++;
  }
  return c;
}

export interface ApiBarra {
  /** Elemento raiz da barra (anexada ao body por montarBarra). */
  raiz: HTMLElement;
  /** Repinta os contadores com um snapshot novo (chamar a cada snapshot do stream). */
  atualizar(snap: SnapPainel): void;
  /** Remove a barra do DOM. */
  fecha(): void;
}

/**
 * Cria a barra e a anexa ao body. `onToggle` recebe o id do painel
 * (lista/atividade/ajuda) quando um botão ativo é clicado.
 */
export function montarBarra(onToggle: (id: PainelId) => void): ApiBarra {
  const t = texto.barra;

  // ---------- marca (glifo próprio do PWA + nome) ----------
  const raiz = document.createElement('header');
  raiz.className = 'painel-barra painel';
  raiz.setAttribute('role', 'banner');

  const marca = document.createElement('div');
  marca.className = 'painel-barra-marca';
  const logo = document.createElement('img');
  logo.className = 'painel-barra-logo';
  logo.src = '/icons/icon.svg';
  // Marca própria: se existir /local/simbolo.svg (pasta fora do git), ele troca o glifo do painel inteiro.
  const simboloLocal = new Image();
  simboloLocal.onload = () => document.documentElement.style.setProperty('--ia-simbolo', 'url("/local/simbolo.svg")');
  simboloLocal.src = '/local/simbolo.svg';
  logo.alt = '';
  logo.draggable = false;
  const nome = document.createElement('span');
  nome.textContent = t.marca;
  marca.append(logo, nome);

  // ---------- contadores (valor + rótulo singular/plural) ----------
  const contadores = document.createElement('div');
  contadores.className = 'painel-barra-contadores';
  contadores.setAttribute('role', 'group');
  contadores.setAttribute('aria-label', t.dicaGrupo);
  const refs = new Map<keyof Contagens, { el: HTMLElement; valor: HTMLElement; rotulo: HTMLElement }>();
  for (const id of IDS) {
    const def = t.contadores[id];
    const el = document.createElement('div');
    el.className = `painel-barra-contador c-${id}`;
    el.title = def.dica;
    const valor = document.createElement('span');
    valor.className = 'painel-barra-valor';
    valor.textContent = '0';
    const rotulo = document.createElement('span');
    rotulo.className = 'painel-barra-rotulo';
    rotulo.textContent = def.plural;
    el.append(valor, rotulo);
    refs.set(id, { el, valor, rotulo });
    contadores.append(el);
  }

  // ---------- botões: abrir/fechar painéis (onToggle) + encaixes "em breve" ----------
  const botoes = document.createElement('div');
  botoes.className = 'painel-barra-botoes';
  botoes.setAttribute('role', 'group');
  botoes.setAttribute('aria-label', t.dicaBotaoPainel);
  const abres: Array<[PainelId, string]> = [
    ['lista', t.botoes.lista],
    ['atividade', t.botoes.atividade],
    ['ajuda', t.botoes.ajuda],
  ];
  for (const [id, rotulo] of abres) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'painel-barra-btn';
    b.textContent = rotulo;
    b.title = `${rotulo} (mostrar/ocultar)`;
    b.addEventListener('click', () => onToggle(id));
    botoes.append(b);
  }
  // Contas · uso: painel de uso (onToggle 'uso').
  {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'painel-barra-btn';
    b.textContent = t.botoes.contas;
    b.title = `${t.botoes.contas} (mostrar/ocultar)`;
    b.addEventListener('click', () => onToggle('uso'));
    botoes.append(b);
  }
  // "Meu dia": diálogo de estatísticas ligado aqui (onToggle 'meudia').
  {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'painel-barra-btn';
    b.textContent = t.botoes.meuDia;
    b.title = `${t.botoes.meuDia} (mostrar/ocultar)`;
    b.addEventListener('click', () => onToggle('meudia'));
    botoes.append(b);
  }
  // "Histórico": diálogo de sessões antigas (onToggle 'historico');
  // somente leitura — a rota s2-historico (/api/history) traz os dados.
  {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'painel-barra-btn';
    b.textContent = t.botoes.historico;
    b.title = `${t.botoes.historico} (mostrar/ocultar)`;
    b.addEventListener('click', () => onToggle('historico'));
    botoes.append(b);
  }
  // Replay do dia (replay.ts): reproduz a timeline gravada pelo servidor no próprio prédio.
  {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'painel-barra-btn';
    b.textContent = t.botoes.replay;
    b.title = `${t.botoes.replay} (reproduzir o dia gravado)`;
    b.addEventListener('click', () => onToggle('replay'));
    botoes.append(b);
  }
  // Engrenagem "Configurações": abre o diálogo (onToggle 'config').
  {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'painel-barra-btn';
    b.textContent = `⚙ ${t.botoes.config}`;
    b.title = t.botoes.dicaConfig;
    b.addEventListener('click', () => onToggle('config'));
    botoes.append(b);
  }

  raiz.append(marca, contadores, botoes);
  document.body.append(raiz);

  // Frente A: a barra quebra linha em tela estreita (flex-wrap) — medir a
  // altura real com ResizeObserver e publicar --barra-h no documentElement.
  // A faixa de uso usa top = 12px + --barra-h + 8px; sem observer ela ficaria
  // sobreposta quando a barra está em duas linhas.
  const observador = new ResizeObserver(() => {
    document.documentElement.style.setProperty('--barra-h', `${raiz.offsetHeight}px`);
  });
  observador.observe(raiz);

  return {
    raiz,
    atualizar(snap) {
      const c = contagensDoSnapshot(snap);
      for (const id of IDS) {
        const def = t.contadores[id];
        const r = refs.get(id)!;
        const n = c[id];
        r.valor.textContent = String(n);
        r.rotulo.textContent = n === 1 ? def.singular : def.plural;
        r.el.setAttribute('aria-label', `${n} ${n === 1 ? def.singular : def.plural}`);
        // "Precisa de você" fica acionado (cor de alerta) só com pelo menos um.
        if (id === 'precisamDeVoce') r.el.classList.toggle('ativo', n > 0);
      }
    },
    fecha() {
      observador.disconnect();
      raiz.remove();
    },
  };
}
