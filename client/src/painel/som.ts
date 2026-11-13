// Adaptado de marmottajr/habblaud@faa1a01 client/src/audio/synth.ts + audio/board.ts + audio/scheduler.ts (MIT)
// Sintetizador WebAudio dos sons de aviso do painel: o sino curto
// ("precisa de você") e o estalo (tarefa concluída) — sem arquivos de áudio.
// O AudioContext só é criado a partir de um gesto do usuário (política de
// autoplay); ganho mestre com curva perceptual, gap mínimo de 1,2 s entre
// dois sons (sino e estalo dividem o mesmo canal). As prefs {som, volume,
// notificacoes} são persistidas em localStorage com try/catch (corrompida → padrão).
// Cortado do original: sons ambientes (keys/elevator/social), buffer
// de ruído e o agendador multi-categoria — só os dois sons de aviso são usados.
// Desde c6: as prefs som/volume/notificações vivem na chave unificada de
// prefs.ts ('buildagent.prefs'); PrefsSom é projeção dela.
import { gravarPrefs, lerPrefs, PREFS_PADRAO, type Prefs } from './prefs';

/** Categorias de som de aviso. */
export type SomKind = 'sino' | 'estalo';

/** Preferências de aviso — projeção da chave unificada (prefs.ts). */
export interface PrefsSom {
  /** Som ligado/desligado. */
  som: boolean;
  /** Volume mestre, 0–1. */
  volume: number;
  /** Notificação do navegador para alertas com a aba oculta. */
  notificacoes: boolean;
}

export const PREFS_SOM_PADRAO: PrefsSom = {
  som: PREFS_PADRAO.som,
  volume: PREFS_PADRAO.volume,
  notificacoes: PREFS_PADRAO.notificacoes,
};

/** Lê as preferências (chave unificada; corrompida → padrão). */
export function lerPrefsSom(): PrefsSom {
  const p = lerPrefs();
  return { som: p.som, volume: p.volume, notificacoes: p.notificacoes };
}

/** Grava as preferências de aviso na chave unificada. */
export function gravarPrefsSom(p: PrefsSom): void {
  // Mescla nas prefs vigentes: os campos que o diálogo de configurações gerencia
  // (modoConteudo, idioma, visibilidade dos painéis) não são tocados aqui.
  const atual = lerPrefs();
  gravarPrefs({ ...atual, som: p.som, volume: p.volume, notificacoes: p.notificacoes });
}

/** Gap mínimo (ms) entre dois sons — as duas categorias dividem o mesmo canal. */
const GAP_MIN_MS = 1200;

/** Envelope percussivo: ataque curto, queda exponencial (técnica do synth.ts). */
function env(g: GainNode, t: number, pico: number, ataque: number, queda: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, pico), t + ataque);
  g.gain.exponentialRampToValueAtTime(0.0001, t + ataque + queda);
}

/** Uma nota sintetizada em `saida` (oscilador + ganho em envelope). */
function nota(
  ac: AudioContext,
  saida: AudioNode,
  tipo: OscillatorType,
  freq: number,
  t: number,
  pico: number,
  ataque: number,
  queda: number,
  ateFreq?: number,
): void {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = tipo;
  o.frequency.setValueAtTime(freq, t);
  if (ateFreq !== undefined) o.frequency.exponentialRampToValueAtTime(ateFreq, t + Math.min(queda, 0.08));
  env(g, t, pico, ataque, queda);
  o.connect(g).connect(saida);
  o.start(t);
  o.stop(t + ataque + queda + 0.05);
}

/** Sino suave: duas parciais + terceira nota logo depois, decaimento longo (chime do synth.ts). */
function tocSino(ac: AudioContext, saida: AudioNode, ganho: number, t: number): void {
  nota(ac, saida, 'sine', 880, t, 0.16 * ganho, 0.012, 1.1);
  nota(ac, saida, 'sine', 1318.5, t, 0.08 * ganho, 0.012, 1.1);
  nota(ac, saida, 'sine', 1174.7, t + 0.14, 0.1 * ganho, 0.012, 1.1);
}

/** Estalo: varredura curta para baixo (pop do synth.ts). */
function tocEstalo(ac: AudioContext, saida: AudioNode, ganho: number, t: number): void {
  nota(ac, saida, 'triangle', 740, t, 0.14 * ganho, 0.008, 0.15, 330);
}

export interface ApiSom {
  /** Libera o áudio — só pode ser chamado a partir de um gesto do usuário. */
  desbloquear(): Promise<void>;
  /** Toca o som se a preferência e os limites permitirem. Devolve se tocou. */
  tocar(kind: SomKind): boolean;
  /** Aplica e persiste novas preferências. */
  definirPrefs(p: PrefsSom): void;
  /** Preferências vigentes. */
  prefs(): PrefsSom;
  /** Remove os listeners de gesto e fecha o AudioContext. */
  fecha(): void;
}

export function criarSom(): ApiSom {
  let prefs = lerPrefsSom();
  let ac: AudioContext | null = null;
  let saida: AudioNode | null = null;
  let ultimoTocar = -GAP_MIN_MS * 2; // nunca bloqueia o primeiro som
  let fechado = false;

  // O navegador só libera áudio após um gesto: dois listeners compartilhados.
  const onGesto = (): void => {
    if (!fechado && prefs.som) void desbloquear();
  };
  addEventListener('pointerdown', onGesto, { passive: true });
  addEventListener('keydown', onGesto);

  /** Cria contexto + limitador (só após gesto — política de autoplay, board.ts). */
  function garantirContexto(): AudioContext | null {
    if (ac) return ac;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ac = new Ctor();
      // Limitador suave: sons sobrepostos nunca estouram (board.ts).
      const limitador = ac.createDynamicsCompressor();
      limitador.threshold.value = -18;
      limitador.knee.value = 12;
      limitador.ratio.value = 6;
      limitador.connect(ac.destination);
      saida = limitador;
    } catch {
      ac = null;
      saida = null;
    }
    return ac;
  }

  async function desbloquear(): Promise<void> {
    if (fechado || !prefs.som) return;
    const ctx = garantirContexto();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // Continua suspenso até o próximo gesto — nada de log poluindo.
      }
    }
  }

  function tocar(kind: SomKind): boolean {
    if (fechado || !prefs.som) return false;
    const ctx = garantirContexto();
    const out = saida;
    if (!ctx || !out || ctx.state !== 'running') return false;
    const agora = performance.now();
    if (agora - ultimoTocar < GAP_MIN_MS) return false; // gap mínimo entre dois sons
    // Curva v² — o volume fica perceptualmente linear (masterGain do scheduler original).
    const ganho = Math.min(1, Math.max(0, prefs.volume)) ** 2;
    if (ganho <= 0.0005) return false;
    try {
      const t = ctx.currentTime + 0.01;
      if (kind === 'sino') tocSino(ctx, out, ganho, t);
      else tocEstalo(ctx, out, ganho, t);
      ultimoTocar = agora;
      return true;
    } catch {
      return false;
    }
  }

  return {
    desbloquear: () => desbloquear(),
    tocar,
    definirPrefs(p) {
      prefs = p;
      gravarPrefsSom(p);
    },
    prefs: () => prefs,
    fecha() {
      fechado = true;
      removeEventListener('pointerdown', onGesto);
      removeEventListener('keydown', onGesto);
      if (ac) void ac.close().catch(() => undefined);
      ac = null;
      saida = null;
    },
  };
}
