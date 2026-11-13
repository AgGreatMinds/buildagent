// Adaptado de marmottajr/habblaud@faa1a01 client/src/ui/toasts.ts + ui/notify.ts (MIT)
// Avisos do painel: toasts no canto quando um agente passa a "precisar de
// você" ou conclui, sons (som.ts), notificação do navegador opcional (permissão
// pedida SÓ por clique) e o título da aba "(N) BuildAgent" com agentes esperando.
// A detecção de transições é a função pura `transicoesDeAvisos` (testada em
// avisos.test.ts, sem DOM); aqui fica o DOM das toasts, do bloco de preferências
// compacto (classes painel-avisos*) e o repinte do título. Strings em texto.ts;
// sons por som.ts; estado das preferências persistido em localStorage lá.
// Cortado do original: botão "Responder" do toast, filtro por conta oculta e
// seleção de agente na cena (o buildagent não expõe permissões ainda).
import type { AgentInfo, AgentStatus } from '../../../shared/types';
import { texto } from './texto';
import { criarSom, type PrefsSom } from './som';
import type { SnapPainel } from './types';
import './painel.css';

/** Níveis de aviso (alert = "precisa de você"; success = "concluído"). */
export type NivelAviso = 'alert' | 'success';

/** Um aviso derivado de uma mudança de status entre dois snapshots. */
export interface Aviso {
  /** Estável por transição: `${agentId}:${status}:${statusSince}` — impede repetição. */
  id: string;
  agenteId: string;
  nome: string;
  nivel: NivelAviso;
  /** Quando o status mudou (epoch ms) — base da dedupe. */
  statusSince: number;
  /** Motivo do espera (AgentInfo.waitingFor), quando houver. */
  motivo?: string;
}

/** Estado que o rastreador guarda por agente (o "anterior" das transições). */
export interface EstadoAviso {
  status: AgentStatus;
  statusSince: number;
}

/**
 * Puro (testado sem DOM): compara o estado anterior por agente com o snapshot
 * atual e devolve as transições relevantes:
 * - entrada em `waiting` → `alert` ("precisa de você");
 * - entrada em `done` → `success` ("concluído").
 * Regras: primeira vez que o agente é visto, só semeia (não é transição);
 * sem mudança de status, nada; `statusSince` igual ao já rastreado é
 * repetição de stream, não transição (dedupe); agente que saiu do snapshot
 * tem a entrada removida e não repete ao voltar.
 */
export function transicoesDeAvisos(
  anterior: Map<string, EstadoAviso>,
  atual: AgentInfo[],
): Aviso[] {
  const avisos: Aviso[] = [];
  for (const a of atual) {
    const prev = anterior.get(a.id);
    if (!prev || prev.status === a.status) continue;
    if (a.statusSince === prev.statusSince) continue; // mesma transição repetida
    if (a.status === 'waiting') {
      avisos.push({
        id: `${a.id}:waiting:${a.statusSince}`,
        agenteId: a.id,
        nome: a.name,
        nivel: 'alert',
        statusSince: a.statusSince,
        motivo: a.waitingFor,
      });
    } else if (a.status === 'done') {
      avisos.push({
        id: `${a.id}:done:${a.statusSince}`,
        agenteId: a.id,
        nome: a.name,
        nivel: 'success',
        statusSince: a.statusSince,
      });
    }
  }
  return avisos;
}

/** Aplica o resultado ao rastreador: presentes → atualiza; ausentes → remove. */
export function sincronizarEstados(
  anterior: Map<string, EstadoAviso>,
  atual: AgentInfo[],
): void {
  const presentes = new Set<string>();
  for (const a of atual) {
    anterior.set(a.id, { status: a.status, statusSince: a.statusSince });
    presentes.add(a.id);
  }
  for (const id of anterior.keys()) if (!presentes.has(id)) anterior.delete(id);
}

// ------------------------- DOM: toasts + prefs + título -------------------------

/** Duração de vida da toast por nível (alert fica até o agente parar de esperar). */
const VIDA: Record<NivelAviso, number> = { alert: Infinity, success: 6_000 };
/** Aviso repetido dentro desta janela não cria nova toast. */
const DEDUPE_MS = 20_000;
/** Teto de toasts visíveis (as mais antigas não-alerta saem primeiro). */
const MAX_VISIBLE = 4;

interface Toast {
  aviso: Aviso;
  el: HTMLElement;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface ApiAvisos {
  /** Elemento raiz (anexado ao body por montarAvisos). */
  raiz: HTMLElement;
  /** Alimenta com snapshot novo: deriva transições, toca sons, toasts, notificação e título. */
  atualizar(snap: SnapPainel): void;
  /** Remove toasts/bloco de prefs do DOM, limpa timers, fecha o AudioContext. */
  fecha(): void;
}

export function montarAvisos(): ApiAvisos {
  const t = texto.avisos;
  const som = criarSom();
  let prefs = som.prefs();

  // Rastreador de estados entre snapshots (a parte testável, ver transicoesDeAvisos).
  const estado = new Map<string, EstadoAviso>();
  const toasts: Toast[] = [];
  const vistas = new Map<string, number>(); // id do aviso → quando foi mostrado (dedupe)

  // ---------- toasts (canto inferior direito, acima do feed) ----------
  const raiz = document.createElement('div');
  raiz.className = 'painel-avisos painel';

  const botaoPrefs = document.createElement('button');
  botaoPrefs.type = 'button';
  botaoPrefs.className = 'painel-avisos-prefs-btn';
  botaoPrefs.title = t.dicaPrefs;
  botaoPrefs.textContent = '🔔';

  const prefsEl = document.createElement('div');
  prefsEl.className = 'painel-avisos-prefs';
  prefsEl.hidden = true;

  function rotulo(rot: string, dica: string): HTMLLabelElement {
    const l = document.createElement('label');
    l.className = 'painel-avisos-prefs-linha';
    l.title = dica;
    const span = document.createElement('span');
    span.textContent = rot;
    l.append(span);
    return l;
  }

  // Interruptor "Som".
  {
    const l = rotulo(t.som, t.dicaSom);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'painel-avisos-switch';
    b.setAttribute('role', 'switch');
    b.title = t.som;
    l.append(b);
    const pinta = () => {
      b.setAttribute('aria-checked', String(prefs.som));
      b.classList.toggle('ligado', prefs.som);
    };
    b.addEventListener('click', () => {
      prefs = { ...prefs, som: !prefs.som };
      som.definirPrefs(prefs);
      pinta();
      // Clique é gesto do usuário: ao ligar, libera o áudio e dá uma amostra.
      if (prefs.som) void som.desbloquear().then(() => som.tocar('estalo'));
    });
    l.dataset.pinta = 'som';
    prefsEl.append(l);
    pinta();
  }

  // Volume (0–100).
  let inputVolume: HTMLInputElement;
  {
    const l = rotulo(t.volume, t.dicaVolume);
    inputVolume = document.createElement('input');
    inputVolume.type = 'range';
    inputVolume.min = '0';
    inputVolume.max = '100';
    inputVolume.step = '5';
    inputVolume.setAttribute('aria-label', t.volume);
    inputVolume.addEventListener('change', () => {
      prefs = { ...prefs, volume: Number(inputVolume.value) / 100 };
      som.definirPrefs(prefs);
      // Ao soltar, amostra do sino — clique/tecla é gesto, áudio já liberado.
      if (prefs.som) void som.desbloquear().then(() => som.tocar('sino'));
    });
    l.append(inputVolume);
    l.dataset.pinta = 'volume';
    prefsEl.append(l);
  }

  // "Notificações do navegador": só pede permissão por este clique (opt-in).
  let avisoNotif: HTMLElement;
  {
    const l = rotulo(t.notificacoes, t.dicaNotificacoes);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'painel-avisos-switch';
    b.setAttribute('role', 'switch');
    b.title = t.notificacoes;
    avisoNotif = document.createElement('span');
    avisoNotif.className = 'painel-avisos-prefs-estado';
    l.append(b, avisoNotif);
    l.dataset.pinta = 'notif';
    prefsEl.append(l);
  }

  function estadoNotificacao(): 'nao-suportado' | 'recusado' | 'pendente' | 'liberado' {
    if (typeof Notification === 'undefined') return 'nao-suportado';
    if (Notification.permission === 'denied') return 'recusado';
    if (Notification.permission === 'granted') return 'liberado';
    return 'pendente';
  }

  function pintaPrefs(): void {
    for (const l of Array.from(prefsEl.querySelectorAll<HTMLElement>('[data-pinta]'))) {
      const b = l.querySelector('button.painel-avisos-switch');
      if (l.dataset.pinta === 'som' && b) {
        b.setAttribute('aria-checked', String(prefs.som));
        b.classList.toggle('ligado', prefs.som);
      }
    }
    const input = prefsEl.querySelector<HTMLInputElement>('input[type="range"]');
    if (input) {
      if (document.activeElement !== input) input.value = String(Math.round(prefs.volume * 100));
      input.disabled = !prefs.som;
    }
    // Estado das notificações no lugar do interruptor.
    const linhaNotif = prefsEl.querySelector<HTMLElement>('[data-pinta="notif"]')!;
    const b = linhaNotif.querySelector('button.painel-avisos-switch')!;
    const est = estadoNotificacao();
    avisoNotif.textContent =
      est === 'liberado'
        ? t.notifLigadas
        : est === 'pendente'
          ? ''
          : est === 'recusado'
            ? t.notifRecusadas
            : t.notifNaoSuportadas;
    b.classList.toggle('ligado', est === 'liberado');
    b.setAttribute('aria-checked', String(est === 'liberado'));
    linhaNotif.dataset.estado = est;
  }

  function alternarPrefs(): void {
    prefsEl.hidden = !prefsEl.hidden;
    if (!prefsEl.hidden) pintaPrefs();
  }
  botaoPrefs.addEventListener('click', alternarPrefs);

  // Clique no interruptor de notificações: pede a permissão AGORA (único ponto).
  prefsEl.addEventListener('click', (e) => {
    const linha = (e.target as HTMLElement).closest<HTMLElement>('[data-pinta="notif"]');
    if (!linha || !linha.contains(e.target as Node)) return;
    void (async () => {
      if (estadoNotificacao() === 'pendente') {
        try {
          await Notification.requestPermission();
        } catch {
          // Sem resposta: o estado segue como estava.
        }
      }
      // O flag "notificações ligadas" é derivado da permissão real (não é toggle livre).
      prefs = { ...prefs, notificacoes: notificationAtual() };
      som.definirPrefs(prefs);
      pintaPrefs();
    })();
  });

  /** Notificações ligadas de fato: permissão liberada (o flag `notificacoes` é derivado). */
  function notificationAtual(): boolean {
    return estadoNotificacao() === 'liberado';
  }

  // ---------- toasts ----------
  function textoToast(a: Aviso): string {
    if (a.nivel === 'alert') return t.precisaDeVoce + (a.motivo ? ` · ${a.motivo}` : '');
    return t.concluido;
  }

  function push(a: Aviso, agora: number): void {
    const visto = vistas.get(a.id);
    if (visto !== undefined && agora - visto < DEDUPE_MS) return; // dedupe
    vistas.set(a.id, agora);

    const el = document.createElement('div');
    el.className = `painel-avisos-toast nivel-${a.nivel} painel`;
    el.setAttribute('role', a.nivel === 'alert' ? 'alert' : 'status');
    const nome = document.createElement('strong');
    nome.className = 'painel-avisos-toast-nome';
    nome.textContent = a.nome;
    const msg = document.createElement('span');
    msg.className = 'painel-avisos-toast-msg';
    msg.textContent = textoToast(a);
    el.append(nome, msg);
    const btnFechar = document.createElement('button');
    btnFechar.type = 'button';
    btnFechar.className = 'painel-avisos-toast-fechar';
    btnFechar.textContent = '✕';
    btnFechar.title = t.fechar;
    btnFechar.addEventListener('click', () => descartar(a));
    el.append(btnFechar);

    raiz.prepend(el);
    const toast: Toast = { aviso: a, el, timer: null };
    if (Number.isFinite(VIDA[a.nivel])) {
      toast.timer = setTimeout(() => descartar(a), VIDA[a.nivel]);
    }
    toasts.push(toast);
    // Teto: as mais antigas não-alerta saem primeiro.
    while (toasts.length > MAX_VISIBLE) {
      const alvo = toasts.find((x) => x.aviso.nivel !== 'alert') ?? toasts[0];
      descartar(alvo.aviso);
    }
  }

  function descartar(a: Aviso): void {
    const i = toasts.findIndex((x) => x.aviso.id === a.id);
    if (i < 0) return;
    const [tomada] = toasts.splice(i, 1);
    if (tomada.timer) clearTimeout(tomada.timer);
    tomada.el.remove();
    vistas.delete(a.id);
  }

  /** Alertas somem sozinhos quando o agente para de esperar (ou sai do snapshot). */
  function recolherAlerts(agents: AgentInfo[]): void {
    const porId = new Map(agents.map((a) => [a.id, a]));
    for (const x of [...toasts]) {
      if (x.aviso.nivel !== 'alert') continue;
      const a = porId.get(x.aviso.agenteId);
      if (!a || a.status !== 'waiting') descartar(x.aviso);
    }
  }

  /** Notificação do navegador (só alertas, aba oculta e permissão liberada). */
  function notificar(a: Aviso): void {
    if (a.nivel !== 'alert' || !document.hidden || estadoNotificacao() !== 'liberado') return;
    try {
      const n = new Notification(`BuildAgent — ${t.precisaDeVoce}`, {
        body: `${a.nome}${a.motivo ? ` · ${a.motivo}` : ''}`,
        tag: a.agenteId,
        icon: '/icons/icon.svg',
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      // Alguns navegadores exigem service worker; a toast continua aparecendo.
    }
  }

  // ---------- título da aba ----------
  let tituloAtual = '';
  function repintaTitulo(agents: AgentInfo[]): void {
    const esperando = agents.filter((a) => a.status === 'waiting').length;
    const base = texto.barra.marca; // "BuildAgent" (centralizado em texto.ts)
    const novo = esperando > 0 ? `(${esperando}) ${base}` : base;
    if (novo !== tituloAtual) {
      tituloAtual = novo;
      document.title = novo;
    }
  }

  raiz.append(botaoPrefs, prefsEl);
  document.body.append(raiz);
  som.definirPrefs(prefs);
  pintaPrefs();

  return {
    raiz,
    atualizar(snap) {
      // Transições do snapshot anterior para este (a função pura testada).
      const novos = transicoesDeAvisos(estado, snap.agents);
      for (const a of novos) {
        push(a, Date.now());
        notificar(a);
        // Sino ao "precisar de você"; estalo ao concluir (o scheduler de som aplica os limites).
        if (a.nivel === 'alert') som.tocar('sino');
        else som.tocar('estalo');
      }
      sincronizarEstados(estado, snap.agents);
      recolherAlerts(snap.agents);
      repintaTitulo(snap.agents);
    },
    fecha() {
      for (const x of [...toasts]) descartar(x.aviso);
      raiz.remove();
      som.fecha();
    },
  };
}
