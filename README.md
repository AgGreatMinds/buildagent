# BuildAgent

**Um prédio 3D que mostra, em tempo real, o que os seus agentes de IA estão fazendo.**
Cada agente vira uma pessoa: entra pela porta, sobe de elevador, senta na mesa do projeto, trabalha,
pede a sua atenção quando precisa de você e vai embora quando termina.

[English](README.en.md) · [Arquitetura](docs/ARQUITETURA.md) · [Como contribuir](CONTRIBUTING.md) · [Segurança](SECURITY.md)

https://github.com/user-attachments/assets/e40f6f36-7f75-4eea-8f9f-f6cdb1f28b4a

![O prédio visto de fora](docs/img/predio.png)
![Andar de trabalho: uma fileira de mesas por projeto](docs/img/andar.png)

## Por dentro do prédio

<table>
<tr>
<td width="50%"><img src="docs/img/mesas.jpg" alt="Andar de trabalho de perto: quem está trabalhando senta na fileira do projeto"><br><sub>Andar de trabalho de perto: quem está trabalhando senta na fileira do projeto</sub></td>
<td width="50%"><img src="docs/img/detalhe.jpg" alt="Detalhe do agente: o que ele faz agora, subagentes e linha do tempo"><br><sub>Detalhe do agente: o que ele faz agora, subagentes e linha do tempo</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/img/terreo.jpg" alt="Térreo: quem chega passa pela recepção, pela catraca e sobe de elevador"><br><sub>Térreo: quem chega passa pela recepção, pela catraca e sobe de elevador</sub></td>
<td width="50%"><img src="docs/img/descanso.jpg" alt="Área de descanso do andar de trabalho"><br><sub>Área de descanso do andar de trabalho</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/img/reuniao.jpg" alt="Andar 2: sala de reunião e galeria"><br><sub>Andar 2: sala de reunião e galeria</sub></td>
<td width="50%"><img src="docs/img/cobertura.jpg" alt="Cobertura vista de fora, com o letreiro"><br><sub>Cobertura vista de fora, com o letreiro</sub></td>
</tr>
</table>

As imagens e o vídeo são do modo demonstração (agentes fictícios).

## O que ele lê

O BuildAgent **só lê** arquivos que as ferramentas já gravam no seu computador. Não envia nada para fora,
não pede chave de API e não escreve nas pastas dos agentes.

| Ferramenta | De onde vem | Desligar |
|---|---|---|
| Claude Code | `~/.claude` (e outras pastas de conta) | — |
| Codex | `~/.codex` | `BUILDAGENT_CODEX=0` |
| OpenCode | banco local do OpenCode | `BUILDAGENT_OPENCODE=0` |
| Pi | `~/.pi/agent/sessions` | `BUILDAGENT_PI=0` |
| OpenBot | cadastro local (só nome, cargo e pasta do agente) | `BUILDAGENT_OPENBOT=0` |

O texto das conversas não é copiado para a tela: o balão de cada pessoa mostra o estado e o tipo de
atividade ("editando", "rodando teste"). Os painéis mostram nome do projeto, pasta e o título da sessão
(que costuma ser o começo do seu pedido); a API local também carrega o comando e o arquivo em uso, com
segredos mascarados. Detalhe em [SECURITY.md](SECURITY.md).

## Começar

Requer **Node.js 22.13 ou mais novo** (o projeto usa o SQLite embutido do Node).

```bash
git clone https://github.com/AgGreatMinds/buildagent.git
```

```bash
cd buildagent && npm install
```

```bash
npm run build && npm start
```

Abra `http://127.0.0.1:4750`. Uma porta só serve a interface e os dados.

### Instalar com o seu agente de IA (já com a sua marca)

Se você usa Claude Code, Codex ou outro agente que roda comandos no seu computador, cole o texto abaixo.
Ele instala, pergunta como você quer o prédio e sobe tudo:

```text
Instale o BuildAgent no meu computador e deixe com a minha marca.

1. Confira que o Node.js é 22.13 ou mais novo (node -v). Se não for, pare e me avise.
2. Clone https://github.com/AgGreatMinds/buildagent.git e rode "npm install" dentro da pasta.
3. Antes de personalizar, me pergunte, uma coisa por vez:
   - o nome que vai no letreiro da fachada (até 20 caracteres; acento é removido);
   - se tenho uma logo em SVG (peça o caminho do arquivo): ela vai em relevo na fachada e na recepção;
   - se tenho um símbolo em SVG para o canto do painel;
   - a porta (padrão 4750);
   - quais destas ferramentas desligar: Codex, OpenCode, Pi, OpenBot (o Claude Code fica sempre ligado).
4. Crie a pasta client/public/local/ e grave nela:
   - predio.json com { "nome": "NOME QUE EU ESCOLHI" };
   - logo.svg e simbolo.svg, se eu tiver passado os arquivos.
5. Se a porta ou as ferramentas fugirem do padrão, copie .env.example para .env e ajuste só
   BUILDAGENT_PORT e, para desligar uma ferramenta, BUILDAGENT_CODEX=0, BUILDAGENT_OPENCODE=0,
   BUILDAGENT_PI=0 ou BUILDAGENT_OPENBOT=0. Não mude BUILDAGENT_HOST.
6. Rode "npm run build" e depois "npm run demo", e me passe o endereço (http://127.0.0.1:PORTA)
   para eu ver o prédio com agentes fictícios.
7. Quando eu aprovar, pare o demo e rode "npm start" para mostrar os meus agentes de verdade.

Regras: não leia nem copie o conteúdo das minhas conversas, não mexa em nada fora da pasta do
projeto e não exponha o painel na rede.
```

### Só quero ver funcionando

```bash
npm run build && npm run demo
```

O modo demonstração usa agentes fictícios e **não lê nenhuma sessão real** — serve para testar, gravar
vídeo ou mostrar o projeto sem expor o que você está fazendo.

### Desenvolvimento

Dois terminais: o servidor (`npm run dev`, porta 4750) e a interface com recarga automática
(`npm run dev:client`, porta 5750).

```bash
npm test
```

```bash
npm run typecheck
```

## Usar

| Tecla | O que faz |
|---|---|
| `1` | Visão geral do prédio |
| `2` | Entrada |
| `3` | Andar de trabalho (mesas por projeto) |
| `4` | Cidade |
| `5` | Térreo (recepção e elevadores) |
| `6` | Andar de trabalho, lado do descanso |
| `7` / `8` | Cobertura, por fora e por dentro |
| `↑` `↓` | Sobe e desce de andar |
| `d` | Câmera em órbita lenta |
| arrastar / roda | Girar e aproximar (o zoom vai para onde o cursor aponta) |

Clique numa pessoa (ou na lista à esquerda) para abrir o detalhe do agente. Duplo clique segue a pessoa.

## Leve por desenho

- Com a aba oculta, não desenha nada.
- Sem ninguém à vista, cai para cerca de um quadro por segundo; com gente andando, 30.
- Com zoom no prédio, a cidade para: carros e luzes só animam com a câmera longe.
- A qualidade se ajusta sozinha à máquina (sombras, resolução, telas dos monitores).

Acrescente `?perf=1` ao endereço para ver quadros por segundo, chamadas de desenho e o nível atual.

## Configurar

Tudo por variável de ambiente; nenhuma é obrigatória. Exporte no terminal ou copie
[`.env.example`](.env.example) para `.env` na raiz — `npm start`, `npm run demo` e `npm run dev` leem esse
arquivo sozinhos.

| Variável | Padrão | Para que serve |
|---|---|---|
| `BUILDAGENT_PORT` | `4750` | Porta do servidor |
| `BUILDAGENT_HOST` | `127.0.0.1` | Endereço de escuta. **Qualquer valor fora de `127.0.0.1` expõe o painel na rede local, sem senha** — o servidor avisa ao iniciar |
| `BUILDAGENT_ALLOWED_HOSTS` | vazio | Nomes extras aceitos no endereço (separados por vírgula). `localhost` e IPs sempre valem; abrir por outro nome sem listá-lo aqui dá erro 421 |
| `BUILDAGENT_DATA_DIR` | `~/.buildagent` | Onde ficam as estatísticas do dia e a linha do tempo (única pasta em que o BuildAgent escreve) |
| `BUILDAGENT_USAGE_DIR` | `~/.buildagent/usage` | Onde o script da statusline grava o uso do plano do Claude Code |
| `BUILDAGENT_DEMO` | desligado | `1` liga o modo demonstração (igual a `--demo`) |
| `BUILDAGENT_CLAUDE_DIRS` | `~/.claude` | Pastas de conta do Claude Code, separadas por vírgula |
| `BUILDAGENT_CODEX` / `BUILDAGENT_CODEX_DIRS` | ligado / `~/.codex` | Fonte Codex |
| `BUILDAGENT_OPENCODE` / `BUILDAGENT_OPENCODE_DB` | ligado / banco padrão | Fonte OpenCode |
| `BUILDAGENT_PI` / `BUILDAGENT_PI_DIR` | ligado / `~/.pi/agent/sessions` | Fonte Pi |
| `BUILDAGENT_OPENBOT` / `BUILDAGENT_OPENBOT_DB` | ligado / banco padrão do app | Cadastro do OpenBot |
| `BUILDAGENT_TIMELINE` | ligado | `0` não grava a linha do tempo usada no replay |
| `BUILDAGENT_LANG` | português | `en` põe os textos do servidor em inglês |

## Uso das contas ao vivo (opcional)

A faixa "Contas · uso" mostra o que o Claude Code já deixou em cache (atualiza quando você roda `/usage`).
Para o número acompanhar a sessão, ligue o script `scripts/statusline-uso.mjs` como statusline do Claude Code,
em `~/.claude/settings.json`:

```json
{ "statusLine": { "type": "command", "command": "node /caminho/para/buildagent/scripts/statusline-uso.mjs" } }
```

Ele só grava o percentual de uso em `~/.buildagent/usage/` — não lê credenciais nem usa rede. Se você já tem
uma statusline, ponha o comando dela em `~/.buildagent/statusline-original.txt`: o script a executa em seguida
e a sua barra continua igual.

## Deixar com a sua cara

Crie a pasta `client/public/local/` (ela fica fora do git) e ponha:

- `predio.json` — `{ "nome": "MINHA EMPRESA" }` troca o letreiro da fachada (até 20 caracteres; acento é removido).
- `logo.svg` — vira a logo em relevo na fachada e na recepção.
- `simbolo.svg` — troca o glifo do painel (canto da barra e da lista) pela sua marca.
- `fonts/GeneralSans-Variable.woff2` — opcional: fonte do corpo do painel. Não vem no repositório (a licença
  dela não deixa redistribuir); baixe em [fontshare.com](https://www.fontshare.com/fonts/general-sans). Sem ela, o
  painel usa a fonte do sistema.

Depois rode `npm run build` de novo.

## Estrutura

```
client/   interface (Three.js + TypeScript): prédio, pessoas, painéis
server/   servidor somente leitura (Node + TypeScript): fontes, modelo, HTTP
shared/   tipos usados pelos dois lados
assets-src/  fontes dos modelos 3D (scripts do Blender que geram os .glb)
docs/     arquitetura e imagens
```

## Limites conhecidos

- As pessoas andam por corredores fixos e desviam umas das outras ao se cruzar, mas não há desvio de
  móveis em rota livre: em horário cheio ainda pode haver um esbarrão.
- O cadastro do OpenBot é lido do caminho padrão do macOS; em outros sistemas, aponte `BUILDAGENT_OPENBOT_DB`.
- Testado no Chrome e no Safari recentes, com WebGL 2.

## Créditos e licença

MIT — ver [LICENSE](LICENSE). Parte do servidor foi portada do projeto
[Habblaud](https://github.com/marmottajr/habblaud) (MIT); os créditos e a lista de arquivos estão em
[NOTICE.md](NOTICE.md) e [LICENSE-HABBLAUD](LICENSE-HABBLAUD). Modelos 3D e fontes de terceiros também estão
no NOTICE.
