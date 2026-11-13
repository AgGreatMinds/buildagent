// Adaptado de marmottajr/habblaud@faa1a01 server/index.ts (MIT)
// Ponto de entrada do BuildAgent: observa as sessões abertas do Claude Code
// (todas as contas detectadas) e, quando há pastas do Codex, as do Codex também
// (somente leitura); mantém o modelo do escritório e transmite via SSE em
// 127.0.0.1:4750. GET /api/snapshot, /api/stream, /api/stats, /api/timeline/*, /api/deliveries e
// /api/history; outro método → 405, Host fora da lista → 421, rota desconhecida → 404.
// Nada é escrito em ~/.claude, ~/.codex, no banco do OpenCode nem no do OpenBot; a única gravação em disco
// é dentro de dataDir (estatísticas diárias e timeline), que é a pasta de dados do próprio
// buildagent.
// Cortado: Codex hooks (GET-only), terminal, demo, mensagens, permissões,
// pty, spawn, entregas, porta remota e World. OpenCode entra quando config.openCode
// (BUILDAGENT_OPENCODE=0 desliga) e existe um banco (BUILDAGENT_OPENCODE_DIRS ou o padrão do host).
import { existsSync } from 'node:fs';
import http from 'node:http';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AccountsService } from './accounts/service';
import { isLoopbackBind, loadConfig } from './config';
import { DayStatsService } from './history/daystats';
import { TIMELINE_DIR, TimelineRecorder } from './history/timeline';
import { hostAllowed } from './http/guard';
import { createDeliveriesHandler } from './deliveries';
import { handleHistoryRoute } from './http/history';
import { createStaticHandler } from './http/static';
import { handleSessionRoute } from './http/session';
import { handleStatsRoute } from './http/stats';
import { createTimelineHandler } from './http/timeline';
import { Hub } from './http/sse';
import { errMsg, log } from './log';
import { NameStore } from './model/names';
import { Office } from './model/office';
import { discoverCodexDirs } from './sources/codex/accounts';
import { CodexSource } from './sources/codex/source';
import { OpenBotDirectory } from './sources/openbot';
import { PiSource } from './sources/pi';
import { discoverOpenCodeDirs, OpenCodeSource } from './sources/opencode';
import { HISTORY_LIMIT, openMainAgent, SessionHistory } from './sources/history';
import { readSessionDetail } from './sources/session-detail';
import { SourceSet } from './sources/source';
import { ClaudeWatcher } from './sources/watcher';
import { tr } from '../shared/i18n';

export interface ServerHandle {
  /** Servidor HTTP (a porta real só é conhecida depois do evento "listening"). */
  server: http.Server;
  /** Encerra fontes, serviços e servidor; resolve quando nada mais segura o processo. */
  close(): Promise<void>;
}

/**
 * Sobe o servidor (porta/host e allowedHosts pelo env do config) e devolve o
 * alavanca para encerrar. Quem importa o módulo (testes) não toca no auto-start:
 * recebe esta instância.
 */
export function start(env: NodeJS.ProcessEnv = process.env): ServerHandle {
  const config = loadConfig(env);
  const startedAt = Date.now();

  // Contas reais: releitura do .claude.json e da pasta de uso do statusline,
  // empurrando as mudanças (usageStatus) para o escritório.
  // Ligação tardia: o Office ainda não existe; a closure lê `office` quando for
  // chamado, nunca no momento em que `AccountsService` é construído.
  const late = { office: undefined as Office | undefined };
  const accounts = new AccountsService({
    dirs: config.claudeDirs,
    home: config.home,
    env,
    usageDir: config.usageDir,
    onChange: () => late.office?.markDirty(),
  });

  // Ligação tardia: o Office anuncia as fontes num snapshot que só existe depois
  // do watcher; a closure lê `agents` no momento da leitura, nunca na criação.
  let agents: SourceSet;
  // OpenBot: só o cadastro (nome e cargo por pasta de agente), somente leitura; BUILDAGENT_OPENBOT=0 desliga.
  // Na demonstração o cadastro real nem é aberto (nada real aparece, nem nome de agente).
  const openBot = config.openBot && !config.demo ? new OpenBotDirectory({ dbPath: config.openBotDb, warnMissing: Boolean(env.BUILDAGENT_OPENBOT_DB?.trim()) }) : undefined;
  const office = new Office({
    names: new NameStore(null), // em memória: nenhum arquivo escrito em dataDir
    version: config.version,
    startedAt,
    // No modo demonstração nada real aparece (nem contas): a tela pode ser gravada sem expor projeto ou e-mail.
    accounts: (s) => (config.demo ? [] : accounts.list(s)),
    sources: () => agents.sources(),
    accountName: (id) => accounts.find(id)?.detected.name,
    homeDir: config.home, // a sala da pasta do usuário aparece como "Pessoal"
    launcherOf: openBot && ((cwd) => {
      const a = openBot.lookup(cwd);
      return a && { launcher: 'openbot' as const, name: a.name, role: a.title };
    }),
  });
  const claude = new ClaudeWatcher({ accounts, office, inDocker: config.inDocker });
  agents = new SourceSet(config.demo ? [] : [claude]); // demo: nenhuma fonte real é ligada
  late.office = office;

  // Codex: só se o config pede e se existe pelo menos uma pasta (somente leitura).
  const codexDirs = config.codex && !config.demo ? discoverCodexDirs(env, config.home) : [];
  const codex = codexDirs.length ? new CodexSource({ accounts, office, dirs: codexDirs, env, home: config.home }) : undefined;
  if (codex) agents.add(codex);

  // OpenCode: só se o config pede e se existe pelo menos um banco (somente leitura;
  // BUILDAGENT_OPENCODE_DIRS/BUILDAGENT_OPENCODE_DB apontam os caminhos, senão o padrão do host).
  const openCodeDirs = config.openCode && !config.demo ? discoverOpenCodeDirs(env, config.home) : [];
  const openCode = openCodeDirs.length ? new OpenCodeSource({ accounts, office, dirs: openCodeDirs, env, home: config.home }) : undefined;
  if (openCode) agents.add(openCode);

  // Pi: só se o config pede e a pasta de sessões existe (somente leitura; BUILDAGENT_PI_DIR troca o caminho).
  const pi = config.pi && !config.demo && existsSync(config.piDir) ? new PiSource({ accounts, office, dir: config.piDir }) : undefined;
  if (pi) agents.add(pi);

  // Demonstração (`npm run demo`): escritório fictício no lugar das fontes reais (server/demo/simulator.ts).
  if (config.demo) office.setDemo(true);

  const hub = new Hub(office);

  // Histórico das sessões do Claude Code (GET /api/history, somente leitura):
  // as contas de "claude" dos AccountsService (cada uma com seu config dir) e,
  // para o campo `open`, os agentes do hub corrente no momento da leitura.
  // Demonstração: sem histórico (as rotas respondem 404 "indisponível") — nenhuma sessão real é lida.
  const history = config.demo ? undefined : new SessionHistory({
    accounts: () => accounts.entriesOf('claude').map((e) => ({ id: e.id, dir: e.dir })),
    openAgentOf: (account, sessionId) => openMainAgent(hub.current().agents, account, sessionId),
  });
  // Demonstração grava "Meu dia" e a timeline numa subpasta própria: o dado fictício não se mistura ao real.
  const dataDir = config.demo ? join(config.dataDir, 'demo') : config.dataDir;

  // "Meu dia": amostra o escritório a cada 1 s e grava em <dataDir>/stats/.
  const stats = new DayStatsService({ dir: join(dataDir, 'stats'), snapshot: () => hub.current() });
  stats.load();

  // Timeline do timelapse: cada snapshot novo vai para <dataDir>/timeline/ (só se ligada).
  const timelineDir = join(dataDir, TIMELINE_DIR);
  const timeline = config.timeline ? new TimelineRecorder({ dir: timelineDir }) : undefined;
  if (timeline) hub.onSnapshot((snap) => timeline.ingest(snap));

  // Rotas extra: /api/stats* (função pura com o serviço) e /api/timeline* (handler de uma vez,
  // devolve true quando respondeu). As duas respondem 405 para não-GET por conta própria.
  const timelineRoute = createTimelineHandler({ dir: timelineDir, recording: timeline !== undefined });

  // Relógio do escritório (período de graça de saída, efeitos de sala): ~250 ms.
  const ticker = setInterval(() => {
    try {
      office.tick();
    } catch (err) {
      log.warnOnce(`tick:${errMsg(err)}`, tr('Falha no relógio do escritório: {0}', [errMsg(err)]));
    }
  }, 250);
  ticker.unref?.();
  void agents.start(); // a fonte síncrona do Claude termina o boot antes do hub transmitir
  if (!config.demo) accounts.start(); // demonstração: contas reais nem são lidas
  hub.start();
  if (timeline) {
    timeline.start();
    timeline.ingest(hub.current());
  }
  stats.start();

  // Entregas locais (GET /api/deliveries): PRs/commits do git de cada sala, somente leitura.
  // Salas = rooms do snapshot atual (mapa sala→dir em model/rooms.ts: o `path` do RoomInfo).
  const deliveriesRoute = createDeliveriesHandler({ rooms: () => hub.current().rooms });

  // Cliente construído (dist/client) servido pela mesma porta: depois de `npm run build`, basta `npm start`.
  const staticRoute = createStaticHandler({ dir: config.clientDir });

  const server = http.createServer();
  server.on('request', (req, res) => {
    // Vale para toda resposta: o painel não pode ser embutido em outra página (clickjacking) e o navegador
    // não adivinha tipo de conteúdo. writeHead de cada rota soma os seus cabeçalhos a estes.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    // Guarda mínima: só as funções puras do guarda do projeto de origem (hostAllowed).
    // O filtro completo responde 403/415 — incompatível com este contrato de 405/421,
    // e de resto ele não tem o que defender: não há método de escrita.
    if (!hostAllowed(req.headers.host, config.allowedHosts)) {
      res.writeHead(421, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('Host não permitido.\n');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('Método não permitido.\n');
      return;
    }
    const url = parseUrl(req);
    const send = (r: http.ServerResponse, status: number, body: unknown): void => {
      r.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      r.end(JSON.stringify(body));
    };
    const pathname = url.pathname;
    try {
      if (pathname === '/api/snapshot') {
        // hub.current() fecha a revisão agora e devolve o snapshot atual (inclui o feed).
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ snapshot: hub.current() }));
      } else if (pathname === '/api/stream') {
        hub.attach(req, res);
      } else if (pathname.startsWith('/api/stats')) {
        // handleStatsRoute responde 404 nas sub-rotas que não conhece.
        handleStatsRoute(req, res, url, stats, send);
      } else if (pathname === '/api/history' || pathname.startsWith('/api/history/')) {
        // handleHistoryRoute responde 404 nas sub-rotas que não conhece (o /api/timeline* é o mesmo padrão).
        handleHistoryRoute(req, res, url, history, HISTORY_LIMIT, send);
      } else if (pathname === '/api/session' || pathname.startsWith('/api/session/')) {
        // Detalhe de sessão (somente leitura): resume o fim do transcript, sem conteúdo bruto.
        handleSessionRoute(req, res, url, history, readSessionDetail, send);
      } else if (timelineRoute(req, res, url)) {
        // timeline respondeu; senão segue para o 404
      } else if (deliveriesRoute(req, res, url)) {
        // /api/deliveries respondeu; senão segue para o 404
      } else if (!pathname.startsWith('/api/') && staticRoute(req, res, url)) {
        // arquivo do cliente construído; senão segue para o 404
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end('rota desconhecida\n');
      }
    } catch (err) {
      log.warn(tr('Erro ao responder {0} {1}: {2}', [req.method, pathname, errMsg(err)]));
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('erro interno\n');
      } else {
        res.destroy();
      }
    }
  });
  server.on('error', (err) => {
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      log.error(tr('A porta {0} já está em uso (defina BUILDAGENT_PORT para usar outra).', [config.port]));
    } else {
      log.error(tr('Erro no servidor HTTP: {0}', [errMsg(err)]));
    }
    // Em execução direta o processo morre com a porta; importado, o log já basta.
    if (isDirectRun) process.exit(1);
  });

  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    clearInterval(ticker);
    stats.stop();
    agents.stop();
    accounts.stop();
    hub.stop();
    timeline?.stop();
    server.closeAllConnections?.(); // SSES abertos não seguram o close
    await new Promise<void>((r) => {
      server.close((err) => {
        if (err) log.warnOnce(`close:${errMsg(err)}`, tr('Falha ao fechar o servidor HTTP: {0}', [errMsg(err)]));
        r();
      });
    });
  };

  server.listen(config.port, config.host);
  server.once('listening', () => {
    log.info(tr('BuildAgent {0} em http://{1}:{2} (somente leitura).', [config.version, config.host, config.port]));
    // Resumo de uma linha: quem acabou de baixar precisa saber o que foi encontrado sem abrir a tela.
    const fontes = ['claude', codex && 'codex', openCode && 'opencode', pi && 'pi', openBot && 'openbot (cadastro)'].filter(Boolean).join(', ');
    log.info(config.demo ? tr('Modo demonstração: agentes fictícios, nenhuma sessão real é lida.') : tr('Fontes ativas: {0}. Dados em {1}.', [fontes, dataDir]));
    // Fora do loopback, qualquer máquina da rede lê nomes de projeto e atividade: avisa quem escolheu isso.
    if (!isLoopbackBind(config.host)) log.warn(tr('Atenção: BUILDAGENT_HOST={0} expõe o painel na rede local. Use 127.0.0.1 se não for de propósito.', [config.host]));
  });

  return { server, close };
}

/** Monta a URL completa da requisição (para as rotas que precisam de query). */
function parseUrl(req: http.IncomingMessage): URL {
  try {
    return new URL(req.url ?? '/', 'http://localhost');
  } catch {
    return new URL('/', 'http://localhost');
  }
}

// ---------------------------------------------------------------- auto-start

// Executado diretamente (tsx server/index.ts): sobe e encerra limpo nos sinais.
/** True a partir do Node 22.13 (primeira versão com o SQLite embutido sem flag). Versão ilegível conta como antiga. */
export function nodeVersionSupported(version: string): boolean {
  const [major = 0, minor = 0] = version.split('.').map(Number);
  return major > 22 || (major === 22 && minor >= 13);
}

// Importado (testes): o módulo não faz nada sozinho — quem decide é start().
const isDirectRun = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  // O SQLite embutido (OpenCode e OpenBot) só existe sem flag a partir do Node 22.13: recusar com uma frase
  // é melhor do que subir pela metade, com fontes faltando sem explicação.
  if (!nodeVersionSupported(process.versions.node)) {
    console.error(`BuildAgent requer Node.js 22.13 ou mais novo (atual: ${process.versions.node}).`);
    process.exit(1);
  }
  const handle = start();
  const shutdown = (signal: string): void => {
    log.info(tr('Encerrando ({0})…', [signal]));
    void handle.close().then(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
