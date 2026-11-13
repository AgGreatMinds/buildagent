// Replay do dia: reconstrói o escritório a partir da timeline gravada pelo servidor
// (/api/timeline/days e /api/timeline/AAAA-MM-DD) e entrega cada instante como um snapshot comum
// — o prédio, a lista e a barra tratam o replay como se fosse o ao vivo, só que no passado.
// Reconstrução (keyframe + deltas) vem de shared/timeline.ts; aqui só relógio, controles e DOM.
import {
  applyChanges, frameOf, parseTimeline, toAccountInfo, toAgentInfo, toRoomInfo,
  type TimelineFrame, type TimelineKeyframe, type TimelineRecord,
} from '../../../shared/timeline';
import './painel.css';

/** Snapshot reconstruído: o mesmo formato mínimo que a lista/prédio já consomem. */
export interface QuadroReplay {
  rooms: ReturnType<typeof toRoomInfo>[];
  agents: ReturnType<typeof toAgentInfo>[];
  accounts: ReturnType<typeof toAccountInfo>[];
  serverTime: number;
}

export interface OpcoesReplay {
  /** Instante reconstruído (chamado ao tocar e ao arrastar a barra). */
  aoQuadro: (q: QuadroReplay) => void;
  /** Replay encerrado ("Voltar ao vivo"): o chamador reaplica o último snapshot ao vivo. */
  aoSair: () => void;
}

export interface ApiReplay {
  /** Abre/fecha o player; devolve se ficou aberto. */
  alternar(): boolean;
  aberto(): boolean;
  fecha(): void;
}

const VELOCIDADES = [60, 180, 600] as const;
const PASSO_MS = 250; // intervalo real entre quadros desenhados

const hhmm = (t: number) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const tituloDia = (d: string) => {
  const [a, m, dia] = d.split('-').map(Number);
  return new Date(a, m - 1, dia).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
};

/** Estado do dia carregado: registros + cursor incremental (evita refazer o dia a cada quadro). */
class Reprodutor {
  private frame: TimelineFrame | null = null;
  private idx = -1; // último registro aplicado
  readonly inicio: number;
  readonly fim: number;
  constructor(private readonly regs: TimelineRecord[]) {
    this.inicio = regs[0]?.at ?? 0;
    this.fim = regs[regs.length - 1]?.at ?? 0;
  }
  get vazio() { return this.regs.length === 0 || this.inicio === this.fim; }

  /** Estado do escritório em `t` (anda para a frente; para trás recomeça do keyframe anterior). */
  em(t: number): QuadroReplay | null {
    if (!this.frame || this.idx < 0 || t < this.regs[this.idx].at) this.reconstruir(t);
    if (!this.frame) return null;
    while (this.idx + 1 < this.regs.length && this.regs[this.idx + 1].at <= t) {
      const r = this.regs[++this.idx];
      if (r.t === 'k') this.frame = frameOf(r);
      else if (r.t === 'd') applyChanges(this.frame, r);
    }
    const f = this.frame;
    return {
      rooms: [...f.rooms.values()].map(toRoomInfo),
      agents: [...f.agents.values()].map((a) => toAgentInfo(a)),
      accounts: [...f.accounts.values()].map((a) => toAccountInfo(a, t)),
      serverTime: t,
    };
  }

  private reconstruir(t: number) {
    let k = -1;
    for (let i = 0; i < this.regs.length && this.regs[i].at <= t; i++) if (this.regs[i].t === 'k') k = i;
    if (k < 0) k = this.regs.findIndex((r) => r.t === 'k'); // antes do 1º keyframe: começa nele
    if (k < 0) { this.frame = null; return; }
    this.frame = frameOf(this.regs[k] as TimelineKeyframe);
    this.idx = k;
  }
}

export function montarReplay({ aoQuadro, aoSair }: OpcoesReplay): ApiReplay {
  let aberto = false;
  let dias: string[] = [];
  let repro: Reprodutor | null = null;
  let t = 0;
  let tocando = false;
  let velocidade: number = VELOCIDADES[0];
  let timer: ReturnType<typeof setInterval> | null = null;
  let carregando = 0; // descarta resposta de um dia que já não é o escolhido

  const raiz = document.createElement('div');
  raiz.className = 'painel-replay painel';
  raiz.hidden = true;
  raiz.setAttribute('role', 'region');
  raiz.setAttribute('aria-label', 'Replay do dia');

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, txt?: string) => {
    const e = document.createElement(tag);
    e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  };

  const cab = el('div', 'painel-replay-cab');
  const titulo = el('span', 'painel-replay-titulo', 'Replay');
  const seletorDia = el('select', 'painel-replay-dia');
  seletorDia.setAttribute('aria-label', 'Dia do replay');
  const relogio = el('span', 'painel-replay-relogio', '--:--');
  const btnVivo = el('button', 'painel-replay-vivo', 'Voltar ao vivo');
  btnVivo.type = 'button';
  cab.append(titulo, seletorDia, el('span', 'grow'), relogio, btnVivo);

  const controles = el('div', 'painel-replay-controles');
  const btnPlay = el('button', 'painel-replay-play', 'Tocar');
  btnPlay.type = 'button';
  const barra = el('input', 'painel-replay-barra');
  barra.type = 'range';
  barra.min = '0';
  barra.max = '1000';
  barra.value = '0';
  barra.setAttribute('aria-label', 'Linha do tempo');
  const vels = el('div', 'painel-replay-vels');
  const botoesVel = VELOCIDADES.map((v) => {
    const b = el('button', 'painel-replay-vel', `${v}×`);
    b.type = 'button';
    b.addEventListener('click', () => { velocidade = v; pintarVel(); });
    vels.append(b);
    return b;
  });
  controles.append(btnPlay, barra, vels);

  const aviso = el('p', 'painel-replay-aviso');
  raiz.append(cab, controles, aviso);
  document.body.append(raiz);

  const pintarVel = () => botoesVel.forEach((b, i) => b.classList.toggle('ativo', VELOCIDADES[i] === velocidade));
  pintarVel();

  const pintarTempo = () => {
    if (!repro) return;
    relogio.textContent = hhmm(t);
    barra.value = String(Math.round(((t - repro.inicio) / (repro.fim - repro.inicio)) * 1000));
    const q = repro.em(t);
    if (q) aoQuadro(q);
  };
  const parar = () => {
    tocando = false;
    btnPlay.textContent = 'Tocar';
    if (timer) clearInterval(timer);
    timer = null;
  };
  const tocar = () => {
    if (!repro || repro.vazio) return;
    if (t >= repro.fim) t = repro.inicio; // terminou: recomeça
    tocando = true;
    btnPlay.textContent = 'Pausar';
    timer = setInterval(() => {
      if (!repro) return;
      t = Math.min(repro.fim, t + PASSO_MS * velocidade);
      pintarTempo();
      if (t >= repro.fim) parar();
    }, PASSO_MS);
  };

  async function carregarDia(dia: string) {
    const meu = ++carregando;
    parar();
    repro = null;
    aviso.textContent = 'Carregando o dia…';
    aviso.hidden = false;
    try {
      const r = await fetch(`/api/timeline/${dia}`);
      if (!r.ok) throw new Error(String(r.status));
      const regs = parseTimeline(await r.text());
      if (meu !== carregando) return;
      const rp = new Reprodutor(regs);
      if (rp.vazio) {
        aviso.textContent = 'Esse dia não tem gravação suficiente para reproduzir.';
        return;
      }
      repro = rp;
      t = rp.inicio;
      aviso.hidden = true;
      pintarTempo();
    } catch {
      if (meu === carregando) aviso.textContent = 'Não foi possível carregar a gravação desse dia.';
    }
  }

  async function abrir() {
    aberto = true;
    raiz.hidden = false;
    aviso.textContent = 'Procurando gravações…';
    aviso.hidden = false;
    try {
      const r = await fetch('/api/timeline/days');
      const j = (await r.json()) as { recording: boolean; days: Array<{ day: string }> };
      dias = j.days.map((d) => d.day);
      seletorDia.replaceChildren(...dias.map((d) => new Option(tituloDia(d), d)));
      if (!dias.length) {
        aviso.textContent = j.recording ? 'Ainda não há gravação. Ela começa agora e aparece aqui.' : 'A gravação do dia está desligada no servidor.';
        return;
      }
      await carregarDia(dias[0]);
    } catch {
      aviso.textContent = 'Não foi possível consultar as gravações.';
    }
  }

  function sair() {
    parar();
    carregando++;
    aberto = false;
    raiz.hidden = true;
    repro = null;
    aoSair();
  }

  btnPlay.addEventListener('click', () => (tocando ? parar() : tocar()));
  barra.addEventListener('input', () => {
    if (!repro) return;
    t = repro.inicio + (Number(barra.value) / 1000) * (repro.fim - repro.inicio);
    pintarTempo();
  });
  seletorDia.addEventListener('change', () => void carregarDia(seletorDia.value));
  btnVivo.addEventListener('click', sair);

  return {
    alternar() {
      if (aberto) sair();
      else void abrir();
      return aberto;
    },
    aberto: () => aberto,
    fecha() {
      parar();
      raiz.remove();
    },
  };
}
