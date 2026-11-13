# NOTICE

## Código portado — Habblaud (MIT)
Os arquivos de `shared/` e `server/` com o cabeçalho `// Portado de marmottajr/habblaud@faa1a01 ... (MIT)`
ou `// Adaptado de ...` vêm do projeto Habblaud (https://github.com/marmottajr/habblaud), licença MIT.
Copyright dos autores originais; o texto da licença MIT está em `LICENSE-HABBLAUD` (Copyright (c) 2026 Márcio Junior).
Não foi portado nada de `shared/world` nem de `server/world`.

Entregas locais (PRs/commits do git de cada sala, somente leitura):
- `server/sources/github.ts` — só os helpers de comando (`scriptSegments`, `bashCall`,
  `githubCallOf`, tipos `GitHubCall`/`Op`) e os regex de PR/push, reexportados como
  `prNumberFromText`/`pushBranchFromText` (Adaptado de marmottajr/habblaud@faa1a01
  server/sources/github.ts (MIT)). Cortado: parser de resultado (`detectGitHubResult`,
  CI, release, MCP, notificação) — depende do parser de transcript, fora de escopo;
  o "github-live" (rede/token) não foi portado.
- `server/deliveries/git.ts` — leitura pura do git local (`git log` somente leitura,
  exec injetável, `git` ausente → `[]` + warning); arquivo novo, não é port.
- `server/deliveries/index.ts` — `createDeliveriesHandler` (padrão do
  `server/http/timeline.ts`): GET /api/deliveries agrega `{roomId, room, commits[], merges[]}`
  por sala; zero escrita, zero rede.
- `server/deliveries/deliveries.test.ts` — repositório git temporário + stub de exec.
- `server/index.ts` — registro de `/api/deliveries`.

Detalhe de sessão (arquivos com cabeçalho "Adaptado"):
- `server/sources/session-detail.ts` — detalhe de sessão (somente leitura): lê só o fim do
  transcript JSONL (teto 4 MiB) e monta o resumo — reaproveita parseLine/scanPrefix de
  `server/sources/transcript.ts` (MIT) (Adaptado de marmottajr/habblaud@faa1a01
  server/sources/transcript.ts (MIT));
- `server/http/session.ts` — GET /api/session/:id (shape do resumo, ?limit=, 400/404/405)
  (Adaptado de marmottajr/habblaud@faa1a01 server/http/sessions.ts (MIT));
- `server/sources/history.ts` — método novo `locate(sessionId)` (varre as contas, sem mudar
  o que já existia);
- `server/http/session.test.ts` — integração do contrato (start() real + transcript sintético);
- `server/index.ts` — registro da rota `/api/session*`.

Histórico de sessões (arquivos com cabeçalho "Adaptado"):
- `server/sources/history.ts` — histórico de sessões (cortados: `resolve()` e `firstPrompt`, só pro terminal);
- `server/http/history.ts` — GET /api/history (lista paginada) e /api/history/:id (resumo) (cortados: terminal, trava local);
- `server/sources/history.test.ts` — vitest da lógica pura (transcripts sintéticos em pasta temporária);
- `server/http/history.test.ts` — integração do contrato (servidor em porta livre + config dir temporário);
- `server/index.ts` — registro das rotas de histórico e instância do `SessionHistory`.
Fontes Codex e OpenCode (arquivos com cabeçalho "Adaptado"):
- `server/sources/codex/files.ts` — leitura de locks/rollouts (cortado: `hint` do índice, só usado por hooks);
- `server/sources/codex/source.ts` — fonte Codex mínima (cortados: hooks, parser de terminal, `.zst`, prefixo de histórico, fs.watch);
- `server/sources/opencode/db.ts` — leitura do banco SQLite do OpenCode (node:sqlite, read-only por chamada; `SourceInfo` import removido);
- `server/sources/opencode/accounts.ts` — descoberta da conta/banco do OpenCode;
- `server/sources/opencode/presence.ts` — sessões abertas do app (drafts.sqlite) (adaptado: `expandHome` do `accounts/detect.ts` em vez do local);
- `server/sources/opencode/source.ts` — fonte OpenCode no Office (adaptado: cortados `watch`/`stopped`; `env`/`home` das options para presence);
- `server/sources/opencode/index.ts` — reexporta os quatro módulos acima;
- `server/sources/opencode/opencode.test.ts` — teste sintético (banco temporário, fixtures inventadas; casos de `node:sqlite` pulados se o runtime não tiver o módulo);
- `server/http/painel.test.ts` — teste de integração do contrato (porta livre + HOME/dataDir temporários);
- `server/index.ts` — religado para as fontes Codex e OpenCode reais e os serviços de stats/timeline.

### `client/src/painel/` — adaptações do Habblaud
Estilo e estrutura adaptados de (MIT, `marmottajr/habblaud@faa1a01`):
- `ui/sidebar.ts` — painel lateral recolhível com busca e filtro por conta (`painel/lista.ts`)
- `ui/rows.ts` — linhas de agente: nome, selo de status + cor, tempo, selo de conta (`painel/lista.ts`)
- `ui/model.ts` — exibição do modelo do agente; ausente → "modelo não informado" (`painel/lista.ts`)
- `ui/format.ts` — duração curta em PT-BR ("2 m", "1 h 4 m") (`painel/tempo.ts`)
- `ui/feed.ts` — feed inferior de atividade derivado da diferença entre snapshots (`painel/atividade.ts` + `painel/feed.ts`)
- `ui/help.ts` — diálogo de ajuda adaptado para o prédio 3D ("Como ler o prédio") (`painel/ajuda.ts`)
- `ui/topbar.ts` + `ui/model.ts` (computeCounters) — referência da barra de contadores (`painel/barra.ts`);
  o glifo de prédio é próprio (`client/public/icons/icon.svg`), sem marca do Habblaud
- `ui/usage.ts` (+ `ui/format.ts`: janela/idade) — chips de uso por conta (5 h/semana, estados, diálogo curto)
  (`painel/uso.ts`); cortado do original: tip com dl/diálogo longo, janelas Opus/Sonnet,
  ResizeObserver/fit de segunda linha (o painel é independente da largura da barra) e widget de chip grande
- `ui/daystats.ts` + `ui/daystats-model.ts` + `ui/daystats-launcher.ts` — diálogo "Meu dia": destaques,
  barras empilhadas SVG por hora (escala comum), por projeto, maiores esperas e tabela alternativa
  acessível (`painel/meudia.ts` + `painel/meudia-modelo.ts`, com testes em `painel/meudia-modelo.test.ts`);
  cortado do original: modo demo/source, seletor de dias, painel por conta, tooltip flutuante
  (o SVG usa `<title>` nativo) e legenda interativa
- `ui/drawer.ts` — gaveta de detalhes do agente à direita: nome/papel, status + tempo,
  provedor/conta, modelo, projeto, sessão, hierarquia (subagentes/responsável) e últimas ações
  (`painel/detalhe.ts`); cortado do original: visão da sala, terminal/pty, composer de mensagens,
  cartões de permissão, shells, tarefas, estatísticas, avatar/editor de personagem — a conversa
  recente (markdown, só leitura) fica anotada como lacuna: o servidor não expõe o texto da conversa
- `ui/markdown.ts` + `ui/markdown.test.ts` — tokenizador + render de markdown simples
  (somente textContent; HTML do transcript vira texto) (`painel/markdown.ts` + `painel/markdown.test.ts`,
  com testes portados do `ui/markdown.test.ts` original); pronto para a seção de conversa quando a rota existir
- `ui/toasts.ts` + `ui/notify.ts` — toasts de transição de status (dedupe, auto-descarte,
  recolher alerta quando o agente para de esperar), notificação do navegador opt-in (permissão
  só por clique) e título da aba "(N) BuildAgent" (`painel/avisos.ts`, com a detecção de
  transições pura testada em `painel/avisos.test.ts`); cortado do original: botão "Responder"
  do toast e filtro por conta oculta (o buildagent não expõe permissões)
- `audio/synth.ts` + `audio/board.ts` + `audio/scheduler.ts` — sons de aviso sintetizados
  via WebAudio (sino "precisa de você" e estalo "concluído"; sem arquivos de áudio), unlock
  só por gesto, gap mínimo, ganho mestre com curva perceptual e prefs persistidas em
  localStorage com try/catch (`painel/som.ts`); cortado do original: sons ambientes
  (keys/elevator/social) e o agendador multi-categoria — só os dois sons de aviso são usados
- `ui/settings.ts` + `ui/prefs.ts` — diálogo de configurações (engrenagem da barra): sons,
  notificações, modo conteúdo/gravação, idioma PT/EN (salva e recarrega) e mostrar/ocultar
  painéis, com reset (`painel/config.ts`); preferências unificadas numa chave
  ('buildagent.prefs') com validação campo a campo e storage injetável (`painel/prefs.ts`,
  testado em `painel/prefs.test.ts`); o EN cobre só o grupo `config` (`painel/texto-en.ts`,
  espelhando `texto.config` — o resto do app segue PT)
- `ui/roomrename.ts` + `ui/roomorder.ts` — renomear sala (lápis inline na lista: Enter
  salva, Esc cancela, vazio volta ao nome do snapshot) e reordenar grupos (botões ↑↓ em
  vez de drag — mobile) (`painel/lista.ts`); o apelido/ordem vive só no localStorage
  (`painel/salas.ts`, testado em `painel/salas.test.ts`) — nunca grava no servidor;
  cortado do original: o fetch `POST /api/rooms/rename` (o buildagent não expõe essa rota;
  a normalização — trim/colapso de espaços/teto 40 — segue `server/model/room-aliases.ts`,
  referenciada, não portada; os dados continuam vindo do snapshot)
- `ui/history.ts` — diálogo "Histórico" de sessões antigas (Claude/Codex/OpenCode), somente
  leitura: busca por título/projeto/provedor sem acento + filtro por status final, agrupado
  por dia (Hoje/Ontem/dia) (`painel/historico.ts` + `painel/historico-modelo.ts`, com testes
  em `painel/historico-modelo.test.ts`); cortado do original: popover (aqui vira `<dialog>`
  no padrão da "Meu dia"), navegação por setas e link de conversa no terminal (somente
  leitura), e chips de conta (os dados de conta ficam no painel de uso, `painel/uso.ts`).
  O parse da resposta de `GET /api/history` (`{ sessions: [...] }`) fica em
  `painel/historico-modelo.ts`; resposta ausente/404 vira lista vazia + estado "Sem sessões ainda"

Adaptações da cena 3D:
- `client/src/balao.ts` — sprite de balão de atividade (adaptado de `art/dynamic.ts`: cabeçalho MIT
  do arquivo; cortado: fica só a renderização do sprite com CanvasTexture, sem a lógica 2D de
  cumprimento de `world/city/social.ts`, que não foi portada)

A fonte de verdade dos tipos é `shared/types.ts` local; nada de `client/src/ui` do Habblaud foi copiado
e nem `shared/world`/`client/src/world`.

## Modelos 3D — Kenney (CC0)
`client/public/assets/city/*.glb` e `Textures/colormap.png`: City Kit / Starter Kit City Builder de Kenney
(https://kenney.nl), domínio público (CC0 1.0). Origem e arquivos em `client/public/assets/city/ORIGEM.md`.
Atribuição não é obrigatória; fica aqui por cortesia.

## Fonte do letreiro 3D — Helvetiker Bold (MgOpen)
`client/public/assets/fonts/helvetiker_bold.typeface.json` vem do pacote `three` (`examples/fonts`), distribuída sob a
licença MgOpen (Copyright 2004 MAGENTA Ltd.); o texto da licença está em `licenses/MgOpen-Helvetiker.txt`.

## Fonte dos títulos do painel — Space Grotesk (OFL 1.1)
`client/public/assets/fonts/SpaceGrotesk-Medium.woff2` e `SpaceGrotesk-Bold.woff2`: Copyright 2020 The Space Grotesk
Project Authors (https://github.com/floriankarsten/space-grotesk), SIL Open Font License 1.1. Texto da licença em
`licenses/OFL-SpaceGrotesk.txt`. Os arquivos não foram modificados.

## Fonte do corpo do painel — General Sans (não distribuída)
O painel pede a General Sans (Indian Type Foundry, ITF Free Font License), mas o arquivo **não vem neste
repositório**: a licença dela não é de código aberto. Sem o arquivo, o painel usa a fonte do sistema. Quem quiser
a fonte baixa em https://www.fontshare.com/fonts/general-sans e põe em `client/public/local/fonts/` (fora do git).

## Bonecos — `client/public/assets/people/pessoa.glb`
Modelo próprio, gerado pelo script `assets-src/pessoa/gerar.py` (Blender). Mesma licença MIT do projeto.

## Marcas
Claude, Codex, OpenCode, Pi e OpenBot são nomes e marcas dos seus donos. O BuildAgent é um projeto independente,
sem vínculo com eles; os ícones de cada ferramenta no painel são desenhos próprios, não os logotipos oficiais.
