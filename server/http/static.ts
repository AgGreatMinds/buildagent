// Entrega o cliente já construído (dist/client, saída do `npm run build`) pela mesma porta da API: depois do
// build, `npm start` basta e não há segundo servidor. Somente leitura: GET/HEAD de arquivos que existem dentro
// da pasta; qualquer caminho que escape dela (.., link simbólico para fora, byte nulo) não é servido.
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import type http from 'node:http';
import { extname, join, sep } from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

/**
 * Arquivo com hash no nome (ex.: assets/index-BFqheOCa.js): o conteúdo nunca muda, o navegador pode guardar
 * para sempre. Só vale para o que o Vite gera, direto em `assets/` — um nome comum com hífen e 8 letras
 * (road-straight.glb, SpaceGrotesk-Bold.woff2) NÃO tem hash e precisa revalidar.
 */
const HASHED = /^assets\/[^/]+-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/;

export interface StaticOptions {
  /** Pasta do cliente construído (dist/client). */
  dir: string;
}

/**
 * Devolve o handler: true quando respondeu, false quando o caminho não é um arquivo da pasta (quem chama
 * segue para o 404). Sem a pasta construída, `/` explica o que falta em vez de um 404 mudo.
 */
export function createStaticHandler(opts: StaticOptions): (req: http.IncomingMessage, res: http.ServerResponse, url: URL) => boolean {
  return (req, res, url) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    let root: string;
    try {
      root = realpathSync(opts.dir);
    } catch {
      if (url.pathname !== '/') return false;
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end('A interface ainda não foi construída. Rode "npm run build" e recarregue (ou use "npm run dev:client").\n');
      return true;
    }
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return false; // %XX inválido
    }
    if (pathname.includes('\0') || pathname.split(/[\\/]/).includes('..')) return false;
    let file = join(root, pathname);
    try {
      if (statSync(file).isDirectory()) file = join(file, 'index.html');
      if (!existsSync(file)) return false;
      file = realpathSync(file); // link simbólico: vale o destino
      if (file !== root && !file.startsWith(root + sep)) return false;
      const st = statSync(file);
      if (!st.isFile()) return false;
      const relative = file.slice(root.length + 1).split(sep).join('/');
      // Validador fraco (tamanho + data): quem revalida recebe 304 sem baixar o arquivo de novo.
      const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
      const headers = {
        // HTML e arquivos sem hash sempre revalidam; só o que o Vite nomeia com hash fica guardado.
        'Cache-Control': HASHED.test(relative) ? 'public, max-age=31536000, immutable' : 'no-cache',
        ETag: etag,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      };
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, headers);
        res.end();
        return true;
      }
      res.writeHead(200, { ...headers, 'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Content-Length': st.size });
      if (req.method === 'HEAD') {
        res.end();
        return true;
      }
      const stream = createReadStream(file);
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy()); // cliente desistiu no meio (recarregou): solta o arquivo
      stream.pipe(res);
      return true;
    } catch {
      return false; // sumiu entre o stat e a leitura, ou sem permissão
    }
  };
}
