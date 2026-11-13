// Adaptado de marmottajr/habblaud@faa1a01 client/src/ui/roomrename.ts + roomorder.ts (MIT)
// Apelido local da sala (projeto) e ordem dos grupos, só no navegador (localStorage):
// o servidor continua servindo o nome do snapshot — o apelido é um rótulo de exibição.
// Lógica pura com storage injetável (mesmo padrão de prefs.ts): os testes rodam em node.
// A normalização do nome segue server/model/room-aliases.ts do Habblaud: espaços colapsados,
// trim, teto de 40 caracteres; vazio apaga o apelido (volta ao nome do snapshot).

/** Teto de comprimento do apelido (referência: ROOM_NAME_MAX do Habblaud). */
export const NOME_MAX = 40;
/** Salas lembradas na ordem guardada (idempotente — idêntico ao MAX_ROOMS do Habblaud). */
const MAX_SALAS = 100;

/** Chaves do localStorage (prefixo buildagent. para não colidir com 'buildagent.prefs'). */
export const CHAVE_APELIDOS = 'buildagent.salas.apelidos';
export const CHAVE_ORDEM = 'buildagent.salas.ordem';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// ---------- storage injetável ----------
// O padrão é o localStorage global; em node/sem storage, um singleton em memória
// (apelidos "valem" na sessão, sem quebrar a lógica) — mesmo padrão de storagePadrao em prefs.ts.
const memoria: StorageLike = (() => {
  const d = new Map<string, string>();
  return {
    getItem: (k) => (d.has(k) ? d.get(k)! : null),
    setItem: (k, v) => { d.set(k, String(v)); },
    removeItem: (k) => { d.delete(k); },
  };
})();

function storagePadrao(): StorageLike {
  try {
    return typeof localStorage === 'undefined' ? memoria : (localStorage as unknown as StorageLike);
  } catch {
    return memoria;
  }
}

// Normalização (espelho de room-aliases.ts): espaços colapsados, trim, teto NOME_MAX.
function limparNome(nome: string): string {
  return nome.replace(/\s+/g, ' ').trim().slice(0, NOME_MAX);
}

// Apelido: JSON { roomId: nome }; corrompido → sem apelido (fallback, sem quebrar).
function lerApelidos(st: StorageLike): Record<string, string> {
  try {
    const bruto = JSON.parse(st.getItem(CHAVE_APELIDOS) ?? 'null') as unknown;
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return {};
    const ok: Record<string, string> = {};
    for (const [k, v] of Object.entries(bruto as Record<string, unknown>)) if (typeof v === 'string' && v.trim()) ok[k] = v;
    return ok;
  } catch {
    return {};
  }
}

// Ordem: array de ids; corrompido → [] (grupos seguem a ordem do snapshot).
function lerOrdem(st: StorageLike): string[] {
  try {
    const v = JSON.parse(st.getItem(CHAVE_ORDEM) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function gravar(st: StorageLike, chave: string, valor: unknown): void {
  try {
    st.setItem(chave, JSON.stringify(valor));
  } catch {
    // Sem armazenamento (modo privado / cheio): vale só nesta sessão.
  }
}

/** Nome efetivo da sala: apelido salvo, senão o nome do snapshot. */
export function nomeEfetivo(id: string, nomeSnapshot: string, storage?: StorageLike): string {
  const st = storage ?? storagePadrao();
  return lerApelidos(st)[id] || nomeSnapshot;
}

/** Lê o apelido da sala (ou undefined). */
export function getApelido(id: string, storage?: StorageLike): string | undefined {
  return lerApelidos(storage ?? storagePadrao())[id];
}

/**
 * Grava (ou apaga, se vazio após limpar) o apelido. Grava SEMPRE, mesmo com nome igual ao
 * atual (o input já abre com o nome efetivo — idempotente e simples). Devolve o nome em uso
 * (ou undefined quando o apelido foi apagado — a UI volta ao nome do snapshot).
 */
export function definirApelido(id: string, nome: string, storage?: StorageLike): string | undefined {
  const st = storage ?? storagePadrao();
  const apelidos = lerApelidos(st);
  const limpo = limparNome(nome);
  if (limpo) apelidos[id] = limpo;
  else delete apelidos[id];
  gravar(st, CHAVE_APELIDOS, apelidos);
  return limpo || undefined;
}

/**
 * Ordena os ids dos grupos visíveis pela ordem guardada; ids desconhecidos vão para o
 * fim, na ordem de chegada (referência: orderRooms do roomorder.ts).
 */
export function ordenarGrupos(ids: readonly string[], storage?: StorageLike): string[] {
  const st = storage ?? storagePadrao();
  const guardada = lerOrdem(st);
  if (!guardada.length) return [...ids];
  const posto = new Map(guardada.map((id, i) => [id, i] as const));
  return ids
    .map((id, i) => ({ id, i, r: posto.get(id) ?? Infinity }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.id);
}

/**
 * Move a sala `de` para antes (`paraOnde === false`) ou depois (true) da sala `para`,
 * na lista `visiveis` (ids na ordem mostrada). Os ids guardados que não estão visíveis
 * agora (salas fechadas/filtradas) mantêm a posição relativa no fim. Idem: moveRoom.
 */
export function moverSala(visiveis: readonly string[], de: string, para: string, paraOnde: boolean, storage?: StorageLike): boolean {
  if (de === para || !visiveis.includes(de) || !visiveis.includes(para)) return false;
  const st = storage ?? storagePadrao();
  const resto = visiveis.filter((id) => id !== de);
  resto.splice(resto.indexOf(para) + (paraOnde ? 1 : 0), 0, de);
  const antigos = lerOrdem(st).filter((id) => !resto.includes(id));
  gravar(st, CHAVE_ORDEM, [...resto, ...antigos].slice(0, MAX_SALAS));
  return true;
}
