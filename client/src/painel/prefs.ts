// Adaptado de marmottajr/habblaud@faa1a01 client/src/ui/prefs.ts (MIT)
// Preferências do painel em UMA chave unificada ('buildagent.prefs'):
// som/volume/notificações (motor de áudio), modo conteúdo, idioma do diálogo
// de configurações e visibilidade dos painéis. Puro: o armazenamento é
// injetado (testável em node, sem DOM); JSON corrompido ou campo desconhecido
// cai no padrão campo a campo (mesmo padrão do projeto de origem).
// Migração de chave: a chave antiga 'buildagent.prefsSom' (som.ts c5) é
// obsoleta — o campo de som é o mesmo, então a migração não copiar nada.

/** Chave única das preferências do painel. */
export const CHAVE_PREFS = 'buildagent.prefs';

export interface Prefs {
  /** Som de aviso ligado/desligado. */
  som: boolean;
  /** Volume mestre, 0–1. */
  volume: number;
  /** Notificação do navegador para alertas com a aba oculta. */
  notificacoes: boolean;
  /**
   * Modo conteúdo/gravação (privacidade): ligado troca nomes/títulos por
   * rótulos genéricos. Desligado por padrão (mostra tudo — uso local).
   */
  modoConteudo: boolean;
  /** Idioma do diálogo de configurações (o restante do app segue PT). */
  idioma: 'pt' | 'en';
  /** Visibilidade desejada dos painéis: lista à esquerda, feed inferior, ajuda. */
  mostrarLista: boolean;
  mostrarAtividade: boolean;
  mostrarAjuda: boolean;
}

export const PREFS_PADRAO: Prefs = {
  som: true,
  volume: 0.6,
  notificacoes: false,
  modoConteudo: false,
  idioma: 'pt',
  mostrarLista: true,
  mostrarAtividade: true,
  mostrarAjuda: true,
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Enum: valor fora da lista → padrão (não é booleano de "verdade" sem checar). */
const umDe = <T extends string>(v: unknown, permitidos: readonly T[], padrao: T): T =>
  typeof v === 'string' && (permitidos as readonly string[]).includes(v) ? (v as T) : padrao;
/** Booleano: só valor booleano real; o resto → padrão. */
const boleano = (v: unknown, padrao: boolean): boolean => (typeof v === 'boolean' ? v : padrao);
/** Volume: número finito clampado a [0, 1]; ausente/NaN → padrão. */
const volumeDe = (v: unknown, padrao: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : padrao;

/** Valida campo a campo: valores desconhecidos ou corrompidos caem no padrão. */
export function sanitizarPrefs(bruto: unknown): Prefs {
  const o = bruto && typeof bruto === 'object' ? (bruto as Record<string, unknown>) : {};
  const d = PREFS_PADRAO;
  return {
    som: boleano(o.som, d.som),
    volume: volumeDe(o.volume, d.volume),
    notificacoes: boleano(o.notificacoes, d.notificacoes),
    modoConteudo: boleano(o.modoConteudo, d.modoConteudo),
    idioma: umDe(o.idioma, ['pt', 'en'] as const, d.idioma),
    mostrarLista: boleano(o.mostrarLista, d.mostrarLista),
    mostrarAtividade: boleano(o.mostrarAtividade, d.mostrarAtividade),
    mostrarAjuda: boleano(o.mostrarAjuda, d.mostrarAjuda),
  };
}

/** Armazenamento padrão: o localStorage global se existir (node → null → memória só). */
function storagePadrao(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : (localStorage as unknown as StorageLike);
  } catch {
    return null;
  }
}

/** Lê as preferências; JSON corrompido ou campo inválido → padrão (sem exceção). */
export function lerPrefs(storage?: StorageLike | null): Prefs {
  const st = storage === undefined ? storagePadrao() : storage;
  if (!st) return { ...PREFS_PADRAO };
  try {
    const bruto = st.getItem(CHAVE_PREFS);
    return sanitizarPrefs(bruto === null ? null : JSON.parse(bruto));
  } catch {
    return { ...PREFS_PADRAO };
  }
}

/** Grava (localStorage cheio/modo privado → silêncio: só não persiste). */
export function gravarPrefs(p: Prefs, storage?: StorageLike | null): void {
  const st = storage === undefined ? storagePadrao() : storage;
  if (!st) return;
  try {
    st.setItem(CHAVE_PREFS, JSON.stringify(p));
  } catch {
    // Sem armazenamento disponível: as preferências valem só nesta sessão.
  }
}

/** Apaga a chave (botão "Redefinir" do diálogo de configurações). */
export function removerPrefs(storage?: StorageLike | null): void {
  const st = storage === undefined ? storagePadrao() : storage;
  if (!st) return;
  try {
    st.removeItem(CHAVE_PREFS);
  } catch {
    // Sem armazenamento disponível: nada a apagar.
  }
}
