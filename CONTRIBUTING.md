# Como contribuir

Obrigado por querer ajudar. O caminho curto:

1. Abra uma issue contando o problema ou a ideia antes de escrever muito código.
2. Faça um fork, crie um ramo a partir de `main` e mude só o que a issue pede.
3. Rode `npm run typecheck`, `npm test` e `npm run build` — os três precisam passar.
4. Abra o pull request explicando **o que mudou e como você testou** (captura de tela para mudança visual).

## Preparar o ambiente

Node.js 22.13 ou mais novo. `npm install`, depois `npm run dev` (servidor) e `npm run dev:client`
(interface com recarga automática). Para trabalhar sem expor suas sessões, use `npm run demo`.

## Regras da casa

- **Somente leitura.** O servidor não escreve fora de `BUILDAGENT_DATA_DIR` e não faz requisição para fora.
  Pull request que quebre isso não entra.
- **Conteúdo de conversa não vai para a tela nem para log.** As fontes extraem estado e tipo de
  atividade, não o texto das mensagens.
- **Regra nova, teste novo.** A lógica mora em funções puras (ex.: `client/src/entrada.ts`,
  `client/src/desvio.ts`, `client/src/ritmo.ts`) justamente para ser testada sem navegador.
- **Leve por desenho.** Nada de alocar por quadro no caminho quente; mudança visual precisa manter o
  prédio dentro do orçamento (`?perf=1` mostra as chamadas de desenho).
- **Idioma do código.** No `client/`, identificadores e comentários em português; no `server/` e no
  `shared/`, identificadores em inglês e comentários em português. Siga o arquivo em que você está.
- **Comente o porquê** na própria linha, não o que a linha já diz.
- **Arquivos portados** têm um cabeçalho de crédito (ver `NOTICE.md`): mantenha.

## Nova fonte de agentes

Cada ferramenta vive em `server/sources/<nome>/` e entrega sessões ao modelo comum (`server/model/`).
Use `server/sources/pi/` como exemplo pequeno: leitura do disco, tradução para o tipo `Provider` em
`shared/types.ts`, uma variável para desligar e testes com arquivos de exemplo **inventados** (nunca
cole sessão real em teste).

## Modelos 3D

Os `.glb` são gerados por script do Blender em `assets-src/`. Mude o script, gere de novo e inclua os dois
no pull request.
