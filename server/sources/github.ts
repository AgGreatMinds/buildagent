// Adaptado de marmottajr/habblaud@faa1a01 server/sources/github.ts (MIT)
// Cortado do original: detectGitHubResult (parser de resultado/transcript), leitura de CI
// (JSON/gh run watch, código de saída), release, eventos MCP e detectGitHubNotification
// (dependem do parser de transcript das sessões — fora de escopo). Também cortado o
// "github-live" (consulta do GitHub com token/rede, server/deliveries/fetcher.ts do projeto de origem):
// NÃO foi portado — nada de token, rede ou escrita.
// O que sobrou: os helpers de comando (scriptSegments, bashCall, githubCallOf + tipos) e os
// regex de PR/push na saída — usados para extrair o nº do PR de mensagens de merge de commit
// local (server/deliveries/git.ts).
import { basename, shellWords } from '../../shared/activity';

/** Operações do git/gh que podem virar evento. */
type Op = 'push' | 'pr_create' | 'pr_merge' | 'pr_checks' | 'run_watch' | 'run_view' | 'release_create';

/** Chamada guardada até o resultado chegar. */
export interface GitHubCall {
  /** Nome da ferramenta (Bash ou mcp__…). */
  tool: string;
  /** Operações: as do comando (Bash) ou a da ferramenta (MCP). */
  ops: Op[];
  /** PR dos argumentos (gh pr merge 12, gh pr checks 12) ou do MCP. */
  number?: number;
  /** "dono/repo" de -R/--repo ou do MCP. */
  repo?: string;
  /** Branch dos argumentos do MCP (push_files). */
  branch?: string;
  /** git push --dry-run / --delete: não envia commits. */
  noPush?: boolean;
  /** gh pr merge --auto: só agenda o merge. */
  auto?: boolean;
  /** gh release create --draft: rascunho, não publica. */
  draft?: boolean;
  /** Lançado em segundo plano: o desfecho chega na notificação de término. */
  background?: boolean;
}

// ------------------------------------------------------------------ comando

/** Um comando simples do script e o operador que vem depois dele ('' no fim). */
export interface Segment {
  words: string[];
  next: string;
}

const HEREDOC = /(?<!<)<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1/g;

/** Tira o corpo dos heredocs (texto de commit/PR não é comando). */
function withoutHeredocs(command: string): string {
  const out: string[] = [];
  let ends: string[] = [];
  for (const line of command.split('\n')) {
    if (ends.length) {
      if (line.trim() === ends[0]) ends = ends.slice(1);
      continue;
    }
    out.push(line);
    for (const m of line.matchAll(HEREDOC)) ends.push(m[2]);
  }
  return out.join('\n');
}

/**
 * Divide um script de shell em comandos simples: separa em `;`, `&&`, `||`, `|`, `&`, quebras de linha e
 * parênteses de agrupamento, fora de aspas e de `$(...)`/crases (que ficam inteiros dentro da palavra).
 */
export function scriptSegments(command: string): Segment[] {
  const src = withoutHeredocs(command.slice(0, 20_000));
  const segs: Segment[] = [];
  let start = 0;
  let q: string | null = null;
  let depth = 0;
  const cut = (end: number, next: string) => {
    const text = src.slice(start, end).trim();
    if (text) segs.push({ words: shellWords(text), next });
    else if (segs.length && next) segs[segs.length - 1].next = next;
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '\\' && q !== "'") i++;
      else if (c === q) q = null;
      continue;
    }
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      q = c;
      continue;
    }
    if (c === '$' && src[i + 1] === '(') {
      depth++;
      i++;
      continue;
    }
    if (depth) {
      if (c === '(') depth++;
      else if (c === ')') depth--;
      continue;
    }
    let op = '';
    if ((c === '&' && src[i + 1] === '&') || (c === '|' && src[i + 1] === '|')) op = c + c;
    else if (c === '|' || c === ';' || c === '\n' || c === '(' || c === ')' || c === '{' || c === '}') op = c;
    else if (c === '&' && src[i - 1] !== '>' && src[i - 1] !== '<' && src[i + 1] !== '>') op = c;
    if (!op) continue;
    cut(i, op === '\n' || op === '(' || op === ')' || op === '{' || op === '}' ? ';' : op);
    i += op.length - 1;
    start = i + 1;
  }
  cut(src.length, '');
  if (segs.length) segs[segs.length - 1].next = '';
  return segs;
}

const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;
const WRAPPERS = new Set(['sudo', 'nohup', 'time', 'command', 'builtin', 'exec', 'env', 'caffeinate', 'then', 'do', 'else', 'elif', 'if', 'while', 'until', '!']);

/** Tira atribuições (`X=1`), palavras-chave (`then`, `do`) e prefixos (`timeout 600`, `nohup`). */
function stripWrappers(words: string[]): string[] {
  let i = 0;
  for (let guard = 0; guard < 12 && i < words.length; guard++) {
    const w = words[i];
    if (ASSIGN.test(w) || WRAPPERS.has(w)) i++;
    else if (w === 'timeout' || w === 'gtimeout') {
      i++;
      while (i < words.length && words[i].startsWith('-')) i++;
      i++; // duração
    } else break;
  }
  return words.slice(i);
}

/** Primeiro número de PR nos argumentos: "12", "#12" ou a URL do PR. */
function prNumberIn(args: string[]): number | undefined {
  for (const a of args) {
    const m = /^#?(\d{1,7})$/.exec(a) ?? /\/pull\/(\d{1,7})\b/.exec(a);
    if (m) return Number(m[1]);
  }
  return undefined;
}

/** Valor de uma flag (`-R x`, `--repo x`, `--repo=x`). */
function flagValue(args: string[], names: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    for (const n of names) {
      if (args[i] === n && i + 1 < args.length) return args[i + 1];
      if (n.startsWith('--') && args[i].startsWith(`${n}=`)) return args[i].slice(n.length + 1);
    }
  }
  return undefined;
}

const GIT_VALUED = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path']);
const GH_VALUED = new Set(['-R', '--repo', '--hostname']);

/** Lê um Bash: que operações do git/gh ele faz (vazio = nada que interesse). */
export function bashCall(command: string): GitHubCall | undefined {
  if (!/\b(?:git|gh)\b/.test(command)) return undefined;
  const call: GitHubCall = { tool: 'Bash', ops: [] };
  const segs = scriptSegments(command);
  segs.forEach((seg) => {
    const words = stripWrappers(seg.words);
    const prog = basename(words[0] ?? '');
    if (prog === 'git') {
      let i = 1;
      while (i < words.length && words[i].startsWith('-')) i += GIT_VALUED.has(words[i]) ? 2 : 1;
      if (words[i] !== 'push') return;
      const args = words.slice(i + 1);
      if (args.some((a) => a === '--dry-run' || a === '-n' || a === '--delete' || a === '-d')) call.noPush = true;
      call.ops.push('push');
    } else if (prog === 'gh') {
      const args = words.slice(1);
      const pos: string[] = [];
      for (let i = 0; i < args.length && pos.length < 2; i++) {
        if (args[i].startsWith('-')) {
          if (GH_VALUED.has(args[i])) i++;
          continue;
        }
        pos.push(args[i]);
      }
      const [noun, verb] = pos;
      const rest = args.slice(args.indexOf(verb ?? '') + 1);
      const repo = flagValue(args, ['-R', '--repo']);
      if (repo && /^[\w.-]+\/[\w.-]+$/.test(repo)) call.repo = repo;
      const has = (...f: string[]) => rest.some((a) => f.includes(a));
      let op: Op | undefined;
      if (noun === 'pr' && verb === 'create') op = 'pr_create';
      else if (noun === 'pr' && verb === 'merge' && !has('--disable-auto')) {
        op = 'pr_merge';
        if (has('--auto')) call.auto = true;
      } else if (noun === 'pr' && verb === 'checks') op = 'pr_checks';
      else if (noun === 'run' && verb === 'watch') op = 'run_watch';
      else if (noun === 'run' && verb === 'view' && !has('--log', '--log-failed', '--web', '-w')) op = 'run_view';
      else if (noun === 'release' && verb === 'create') {
        op = 'release_create';
        if (has('--draft', '-d')) call.draft = true;
      }
      if (!op) return;
      call.ops.push(op);
      if (op === 'pr_merge' || op === 'pr_checks') call.number ??= prNumberIn(rest);
    }
  });
  return call.ops.length ? call : undefined;
}

/** Servidor MCP do GitHub (mcp__github__…, mcp__claude_ai_GitHub__…). */
function mcpGitHub(name: string): string | undefined {
  const m = /^mcp__([^_].*?)__(.+)$/.exec(name);
  return m && /github/i.test(m[1]) ? m[2] : undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isInteger(v) && v > 0) return v;
  if (typeof v === 'string' && /^\d{1,7}$/.test(v)) return Number(v);
  return undefined;
}

/**
 * Guarda a chamada se ela pode gerar um evento do GitHub: Bash com `git push`/`gh pr|run|release`
 * ou ferramenta de um servidor MCP do GitHub. Undefined = não interessa.
 */
export function githubCallOf(name: string, input: Record<string, unknown>): GitHubCall | undefined {
  if (name === 'Bash') return typeof input.command === 'string' ? bashCall(input.command) : undefined;
  const tool = mcpGitHub(name);
  if (!tool) return undefined;
  const call: GitHubCall = { tool: name, ops: [] };
  const owner = typeof input.owner === 'string' ? input.owner : undefined;
  const repo = typeof input.repo === 'string' ? input.repo : undefined;
  if (owner && repo) call.repo = `${owner}/${repo}`;
  call.number = num(input.pullNumber) ?? num(input.pull_number) ?? num(input.number);
  if (typeof input.branch === 'string') call.branch = input.branch;
  if (/(^|_)create_pull_request$/.test(tool)) call.ops.push('pr_create');
  else if (/(^|_)merge_pull_request$/.test(tool)) call.ops.push('pr_merge');
  else if (/(^|_)push_files$/.test(tool)) call.ops.push('push');
  else if (/workflow_run|check_run|status|actions_get|pull_request_read/.test(tool)) call.ops.push('run_view');
  return call.ops.length ? call : undefined;
}

// ------------------------------------------------------------------ regex de saída (só extração)

const PR_URL = /https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d{1,7})\b/g;
/**
 * Depois da linha "To <remoto>" (a do `git fetch` é "From"): "   7917867..32a2814  main -> main",
 * " * [new branch]      x -> x" ou " + a...b main -> main (forced update)".
 */
const PUSH_TO = /^To \S+/m;
const PUSH_OK = /^\s*[+* ]?\s*(?:[0-9a-f]{4,40}\.{2,3}[0-9a-f]{4,40}|\[new branch\])\s+\S+\s+->\s+(\S+)/m;

/** Nº de PR numa mensagem de merge de commit ou na saída de um comando: "pull request #12", "Merge #42", "PR #7" ou a URL do PR. */
export function prNumberFromText(text: string): number | undefined {
  const m =
    /\bpull request (?:[\w.-]+\/[\w.-]+)?#?(\d{1,7})\b/i.exec(text) ??
    /\bmerge\s+(?:pull request\s+|branch\s+)?#?(\d{1,7})\b/i.exec(text) ??
    /\bpr\s*#?(\d{1,7})\b/i.exec(text);
  if (m) return Number(m[1]);
  const u = PR_URL.exec(text);
  return u ? Number(u[2]) : undefined;
}

/** Branch que um `git push` bem-sucedido enviou (ou undefined se a saída não diz). */
export function pushBranchFromText(text: string): string | undefined {
  const to = PUSH_TO.exec(text);
  if (!to) return undefined;
  const m = PUSH_OK.exec(text.slice(to.index));
  return m ? m[1].replace(/^refs\/heads\//, '') : undefined;
}
