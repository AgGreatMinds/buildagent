// Leitura das sessões do Pi (pi-coding-agent). O Pi grava um arquivo por sessão em
// `~/.pi/agent/sessions/<pasta-do-projeto-codificada>/<data>_<id>.jsonl`, uma linha JSON por evento:
//   - `session`  (cabeçalho, sempre a 1ª linha): id, timestamp e cwd;
//   - `model_change`: modelId em uso;
//   - `message`: role system | user | assistant | toolResult; o assistant traz blocos `text`, `thinking`
//     e `toolCall`, e `stopReason` ('stop' = turno encerrado; 'toolUse' = vai rodar ferramenta).
//
// Privacidade: daqui só saem id, pasta, horários, modelo, papel da última mensagem, motivo de parada e o
// NOME da última ferramenta. Nenhum texto de conversa, argumento de ferramenta ou resultado é copiado.
// Somente leitura: os arquivos são abertos com 'r' e nada é escrito na pasta do Pi.
import { closeSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Arquivo de sessão candidato (mexido dentro da janela de recência). */
export interface PiSessionFile {
  path: string;
  mtimeMs: number;
  size: number;
}

/** O que o escritório precisa saber de uma sessão do Pi. */
export interface PiSession {
  id: string;
  cwd: string;
  startedAt: number;
  model?: string;
  /** Papel da última mensagem lida (user, assistant, toolResult). */
  lastRole?: string;
  /** stopReason da última mensagem do assistant. */
  lastStop?: string;
  /** Nome da última ferramenta chamada (só o nome). */
  lastTool?: string;
  /** Instante da última mensagem (epoch ms). */
  lastAt?: number;
}

/** Quantas pastas de projeto e quantos arquivos por pasta são olhados por ciclo (pasta gigante não trava o ciclo). */
const MAX_DIRS = 400;
const MAX_FILES_PER_DIR = 200;
/** Quanto do começo (cabeçalho) e do fim (estado atual) de cada arquivo é lido. */
const HEAD_BYTES = 8 * 1024;
const TAIL_BYTES = 256 * 1024;

/** Arquivos `.jsonl` das pastas de projeto em `dir` mexidos há menos de `windowMs`. Pasta ausente = []. */
export function listPiSessionFiles(dir: string, now: number, windowMs: number): PiSessionFile[] {
  const out: PiSessionFile[] = [];
  let projects: string[];
  try {
    projects = readdirSync(dir).slice(0, MAX_DIRS);
  } catch {
    return out; // sem a pasta do Pi não há sessão
  }
  for (const project of projects) {
    const folder = join(dir, project);
    let names: string[];
    try {
      if (!statSync(folder).isDirectory()) continue;
      names = readdirSync(folder).filter((n) => n.endsWith('.jsonl')).slice(-MAX_FILES_PER_DIR);
    } catch {
      continue;
    }
    for (const name of names) {
      const path = join(folder, name);
      try {
        const st = statSync(path);
        if (st.isFile() && now - st.mtimeMs <= windowMs) out.push({ path, mtimeMs: st.mtimeMs, size: st.size });
      } catch {
        // arquivo removido entre a listagem e o stat: ignora
      }
    }
  }
  return out;
}

function text(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const clean = v.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return clean ? clean.slice(0, max) : undefined;
}

function time(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v !== 'string') return undefined;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : undefined;
}

/**
 * Interpreta o texto de uma sessão (o arquivo inteiro, ou o cabeçalho seguido do fim do arquivo). Linha
 * quebrada ou desconhecida é ignorada; sem cabeçalho válido (id e cwd) devolve undefined.
 */
export function parsePiSession(source: string): PiSession | undefined {
  let session: PiSession | undefined;
  for (const line of source.split('\n')) {
    if (!line.trim()) continue;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue; // linha cortada pelo recorte do fim do arquivo (ou ainda sendo escrita)
    }
    if (!o || typeof o !== 'object') continue;
    if (o.type === 'session') {
      const id = text(o.id, 80);
      const cwd = text(o.cwd, 1024);
      if (id && cwd && !session) session = { id, cwd, startedAt: time(o.timestamp) ?? 0 };
      continue;
    }
    if (!session) continue;
    if (o.type === 'model_change') {
      session.model = text(o.modelId, 80) ?? session.model;
      continue;
    }
    if (o.type !== 'message' || !o.message || typeof o.message !== 'object') continue;
    const m = o.message as Record<string, unknown>;
    const role = text(m.role, 20);
    if (!role || role === 'system') continue;
    session.lastRole = role;
    session.lastAt = time(o.timestamp) ?? session.lastAt;
    if (role !== 'assistant') continue;
    session.lastStop = text(m.stopReason, 30);
    session.model = text(m.model, 80) ?? session.model;
    if (Array.isArray(m.content)) {
      for (const block of m.content as Array<Record<string, unknown>>) {
        if (block && typeof block === 'object' && block.type === 'toolCall') session.lastTool = text(block.name, 60) ?? session.lastTool;
      }
    }
  }
  return session;
}

/** Lê um trecho do arquivo como texto (somente leitura). */
function readChunk(fd: number, position: number, length: number): string {
  const buffer = Buffer.alloc(length);
  const n = readSync(fd, buffer, 0, length, position);
  return buffer.subarray(0, n).toString('utf8');
}

/** Lê o cabeçalho e o fim do arquivo (sessão longa não é lida inteira) e interpreta. Erro de leitura = undefined. */
export function readPiSession(file: PiSessionFile): PiSession | undefined {
  let fd: number | undefined;
  try {
    fd = openSync(file.path, 'r');
    if (file.size <= HEAD_BYTES + TAIL_BYTES) return parsePiSession(readChunk(fd, 0, file.size));
    // Cabeçalho: só a 1ª linha. Fim: descarta a 1ª linha do recorte, que começa no meio.
    const head = readChunk(fd, 0, HEAD_BYTES).split('\n')[0];
    const tail = readChunk(fd, file.size - TAIL_BYTES, TAIL_BYTES);
    return parsePiSession(`${head}\n${tail.slice(tail.indexOf('\n') + 1)}`);
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
