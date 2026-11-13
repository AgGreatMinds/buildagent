// Lógica pura de leitura de entregas do git local (PRs/commits da pasta de cada sala).
// Somente leitura: roda `git -C <pasta> log ...` via execFile com timeout — sem `gh`, sem token,
// sem rede, sem `fetch`/`push`/`merge`; nada que escreve (até em .git) é executado aqui.
// `exec` é injetável: em produção é execFile de node:child_process; nos testes, um stub.
// O número do PR sai da mensagem de merge (Merge pull request #12 / Merge #12 from ...)
// com prNumberFromText (server/sources/github.ts, portado do Habblaud, MIT).
import { execFile } from 'node:child_process';

import { prNumberFromText } from '../sources/github';

/** Um commit da história da sala (mais recente primeiro). */
export interface RoomCommit {
  /** SHA curta (7 chars). */
  sha: string;
  /** Nome do autor (o e-mail fica de fora de propósito: é dado pessoal e a tela não precisa dele). */
  author: string;
  /** Data (ISO). */
  date: string;
  /** Primeira linha do assunto. */
  subject: string;
  /** commit de merge */
  isMerge: boolean;
  /** Nº do PR, quando a mensagem diz (só em merge). */
  pr?: number;
}

/** Resultados do git para uma sala; `warning` explica por que pode estar vazio. */
export interface RoomGitRead {
  commits: RoomCommit[];
  merges: RoomCommit[];
  /** git ausente/falha/caminho sem repositório: explicação curta, nunca erro de rota. */
  warning?: string;
}

/**
 * Contrato de execução: `git args...` com timeout. Devolve via callback (como execFile);
 * err não nulo ou exceção do stub = falha. Nos testes o stub dispensa git de verdade.
 */
export type GitExec = (args: readonly string[], timeoutMs: number, cb: (err: unknown, out: string) => void) => unknown;

export interface GitOptions {
  /** Injetável: em produção é execGit (padrão); nos testes, um stub. */
  exec?: GitExec;
  /** Teto de commits por sala (padrão 50). */
  limit?: number;
  /** Timeout de cada `git log` em ms (padrão 3000). */
  timeoutMs?: number;
}

/** Execução de produção: execFile com timeout e teto de memória (sem shell). */
function execGit(args: readonly string[], timeoutMs: number, cb: (err: unknown, out: string) => void): unknown {
  return execFile('git', args as string[], { timeout: timeoutMs, maxBuffer: 1_000_000, encoding: 'utf8' }, (err, stdout, stderr) => {
    cb(err, `${stdout}\n${stderr}`);
  });
}

const SEP = '\x1f'; // separador de registro; um assunto de commit não contém caracteres de controle
const FMT = `--pretty=format:%h${SEP}%an${SEP}%ai${SEP}%s`;

/** Roda `git log` (somente leitura) e devolve a saída ou lança na falha. */
function runExec(exec: GitExec, args: readonly string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      exec(args, timeoutMs, (err, out) => (err ? reject(err) : resolve(out)));
    } catch (err) {
      reject(err);
    }
  });
}

function parseLog(out: string, isMerge: boolean): RoomCommit[] {
  const commits: RoomCommit[] = [];
  for (const line of out.slice(0, 500_000).split('\n')) {
    if (!line) continue;
    const [sha, author, date, ...rest] = line.split(SEP);
    if (!sha || !author || !date) continue;
    const c: RoomCommit = { sha, author, date, subject: rest.join(SEP).slice(0, 200), isMerge };
    if (isMerge) {
      const pr = prNumberFromText(c.subject);
      if (pr !== undefined) c.pr = pr;
    }
    commits.push(c);
  }
  return commits;
}

/**
 * Lê os commits recentes e os merge (com nº de PR) da pasta do repositório da sala.
 * Nunca falha: git ausente, caminho que não é repositório ou timeout devolvem `[]` com `warning`
 * — a rota responde sempre 200 (a ausência de repositório não é erro do serviço).
 */
export async function readRoomGit(roomDir: string, opts: GitOptions = {}): Promise<RoomGitRead> {
  const exec = opts.exec ?? execGit;
  const limit = opts.limit ?? 50;
  const timeoutMs = opts.timeoutMs ?? 3000;
  // -c vence o .git/config da pasta lida: sem verificação de assinatura (que chamaria gpg.program) nem fsmonitor.
  const base = ['-c', 'log.showSignature=false', '-c', 'core.fsmonitor=false', '-C', roomDir, 'log', FMT];
  try {
    const out = await runExec(exec, [...base, `-n${limit}`], timeoutMs);
    const commits = parseLog(out, false);
    let merges: RoomCommit[] = [];
    if (commits.length) {
      try {
        merges = parseLog(await runExec(exec, [...base, '--merges', `-n${limit}`], timeoutMs), true);
      } catch {
        merges = []; // sem merges na história (ou falha nesta parte): os commits seguem valendo
      }
    }
    return { commits, merges };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const short = /not a git repository|does not exist|no such file|ENOENT|cannot find/i.test(msg) ? 'sem repositório git nesta pasta' : 'git indisponível';
    return { commits: [], merges: [], warning: short };
  }
}
