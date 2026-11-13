# Arquitetura

Duas metades e um contrato entre elas.

```
arquivos de sessão no disco ──► server/sources/* ──► server/model (escritório) ──► /api/snapshot e /api/stream
                                                                                      │
                                              client/src/dados.ts ◄───────────────────┘
                                                     │
                       painéis (client/src/painel) ◄─┴─► prédio 3D (client/src/predio.ts e vizinhos)
```

## Servidor (`server/`) — somente leitura

| Pasta | Papel |
|---|---|
| `sources/` | Uma fonte por ferramenta. `watcher.ts`/`transcript.ts` (Claude Code), `codex/`, `opencode/`, `pi/`. `openbot/` não é fonte de sessão: é o cadastro que dá nome e cargo ao agente pela pasta em que ele roda. |
| `model/` | `office.ts` junta as sessões em **salas** (uma por projeto) e **agentes**, com estado (`working`, `waiting`, `idle`, `shell`, `done`, `offline`). `rooms.ts` decide o nome da sala. |
| `accounts/` | Descobre as contas configuradas e o uso de cada uma. |
| `http/` | Rotas (`snapshot`, `stream` por SSE, `stats`, `history`, `session`, `timeline`), o guarda de `Host`/`Origin` e `static.ts`, que entrega a interface construída pela mesma porta. |
| `demo/` | Simulador do modo demonstração: agentes fictícios, nenhuma leitura real. |

Garantias que os testes cobram: nenhuma escrita fora de `BUILDAGENT_DATA_DIR`, nenhuma requisição para fora,
só `GET`/`HEAD`, nenhum caminho fora da pasta servida.

O contrato com a interface está em `shared/types.ts` (`Snapshot`, `Room`, `Agent`, `Provider`).

## Interface (`client/src/`)

### Do dado à pessoa

1. `dados.ts` recebe o snapshot e o traduz em `AgenteEntrada`.
2. `vida/identidade.ts` consolida agentes em **pessoas** (um agente principal e seus subagentes podem
   dividir uma pessoa) e lembra quem já esteve no prédio.
3. `vida/social.ts` decide, a cada segundo, a **intenção** de cada pessoa: mesa, copa, sala de guerra,
   descanso… Tudo determinístico a partir de uma semente — a mesma entrada dá a mesma cena.
4. `predio.ts` transforma intenção em **rota** (corredores de `mesas.ts`, elevador, sala) e anima.

Regras de caminhada, todas puras e testadas:

| Arquivo | Regra |
|---|---|
| `entrada.ts` | Fila da calçada (quem chega junto não entra amontoado), elevador em mão dupla, pouso direto de quem já estava no prédio quando a página abriu |
| `desvio.ts` | Duas pessoas em sentidos opostos desviam para a própria direita |
| `sala/regras.ts` | Sala de descanso: lados do ping-pong, plateia da TV, rota por fora das mesas |
| `mesas.ts` | Planta das fileiras e corredores |

### O prédio

`fachada.ts`, `interior.ts`, `mobiliario.ts`, `andar2.ts` e `sala/sala.ts` montam a geometria uma vez,
fundida por material para poucas chamadas de desenho. `cidade.ts` é o entorno. `pessoa-glb.ts` carrega a
malha das pessoas (`client/public/assets/people/pessoa.glb`, gerada por `assets-src/pessoa/gerar.py`
no Blender); `people.ts` anima o esqueleto por código. `placa.ts` desenha a placa de cada fileira e o
letreiro.

### Leve por desenho

| Arquivo | O que controla |
|---|---|
| `ritmo.ts` | **Quando** desenhar: ritmo cheio durante um gesto, 30 quadros/s com vida à vista, 10 com a janela sem foco, só simulação (4×/s) quando nada visível muda, nada com a aba oculta |
| `orcamento.ts` | **Quanto** desenhar: mede o custo do quadro e troca de nível (resolução, sombras, telas) |
| `economia.ts` | Pessoas fora da vista ou longe animam com menos passos |
| `corte.ts` | Tira do desenho o que a câmera não vê |
| `camera.ts` | Vistas, foco por andar e a vista centrada na área livre entre os painéis |

Em `main.ts` fica o laço: decide o passo (`ritmo`), simula, e só então desenha se precisar.

### Painéis (`painel/`)

HTML e CSS comuns por cima do canvas: lista de agentes, detalhe, atividade, uso das contas, "Meu dia",
histórico e replay. Cada painel tem um arquivo de modelo puro (`*-modelo.ts`, `agrupar.ts`, `tempo.ts`)
com teste, separado do arquivo que mexe no DOM.

## Testes

`npm test` roda tudo com o Vitest, sem navegador. O que depende de tela (enquadramento, sobreposição de
painéis, ritmo real de quadros) é conferido à mão ou com um navegador automatizado contra `npm run demo`.
Ganchos de depuração ficam em `window.__predio`, `__render`, `__camera`, `__controles` e `__ritmo()`.
