# CONTEXT — decisões do BuildAgent

Registro curto das decisões que não dá para ler direto no código. A arquitetura está em
[docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Finalização (12/11/2026)

| Decisão | Por quê |
|---|---|
| **Pi virou fonte; OpenBot virou cadastro** | O OpenBot roda os agentes por cima de Claude Code, Codex, OpenCode e Pi, na pasta de cada agente. As sessões já chegam pelas fontes; do OpenBot só faltava o nome e o cargo. Lê-se só o cadastro, em modo somente leitura. |
| **Uma porta só** (`server/http/static.ts`) | Depois do `npm run build`, `npm start` basta. Arquivo com hash do Vite fica em cache; o resto revalida por ETag. |
| **Modo demonstração isolado** | Com `--demo` não existe histórico, contas reais não são lidas e o que é gravado vai para `demo/` dentro da pasta de dados. Há teste de ponta a ponta (`server/index.demo.test.ts`). |
| **Desenho sob demanda** (`ritmo.ts`) | O laço decide entre desenhar, só simular ou não fazer nada. Medido no modo demonstração: aba oculta 0 quadros/s; nada vivo à vista ~1; gente à vista 30. |
| **Cidade parada no zoom** | Carros e luzes só animam com a câmera longe do prédio. |
| **Pessoas em malha única** (`pessoa.glb`) | Geradas por script do Blender (`assets-src/pessoa/gerar.py`), com variações por código. Substituem as cápsulas antigas. |
| **Quem já estava no prédio nasce no lugar** | No primeiro snapshot real da página ninguém refaz a entrada. Só quem chega depois entra pela calçada, em fila (um a cada 1,4 s; aperta para 0,5 s com mais de 8 esperando). |
| **Saída até a calçada** | Quem vai embora desce de elevador e sai pela porta, em vez de sumir no elevador do andar. |
| **Elevador em mão dupla; chegada sobe direto** | Entra-se por um lado da porta e sai-se pelo outro; quem trabalha no andar 2 não desce mais no 1 para subir de novo. |
| **Desvio ao cruzar** (`desvio.ts`) | Duas pessoas em sentidos opostos dão um passo para a própria direita. Não é desvio de obstáculo geral. |
| **Placa some no zoom** | A placa suspensa da fileira fica transparente a menos de 5 m da câmera e some a 2,4 m: colada na lente ela tapava a tela. |
| **Vista centrada na área livre** | Com a lista ou o detalhe abertos, a cena é deslocada para o meio do espaço que sobra (`deslocamentoDaVista`). |
| **Letreiro configurável** | O nome na fachada vem de `client/public/local/predio.json` (fora do git); o padrão é `BUILDAGENT`. |
| **Node 22.13 ou mais novo** | `node:sqlite` só dispensa a opção experimental a partir do 22.13. Testado aqui no Node 24; o 22 fica coberto pela CI. |
| **Nome da fileira com luz própria** (`placa.ts`) | A placa é um painel retroiluminado: só com a luz do ambiente, a mais distante da luminária ficava ilegível à noite. |
| **Letreiro em letras-caixa** (`fachada.ts`) | Cada letra é extrudada separada, com respiro entre elas, frente clara e lateral escura. Juntas num bloco só, as letras colavam de longe. |
| **Vista 3 em diagonal** | De frente, a coluna do meio do andar tapava duas placas. Em diagonal as quatro aparecem inteiras. |
| **Noite com silhueta** (`mundo.ts`, `cidade.ts`) | Céu e luz da lua mais claros e janelas de cor e brilho variados: antes as torres sumiam no preto e sobravam quadrados creme soltos. |
| **`.env` lido pelos scripts** | `npm start`, `dev` e `demo` passam `--env-file-if-exists=.env`. Antes o `.env.example` existia, mas copiar para `.env` não fazia nada. |
| **Autor do commit sem e-mail** (`server/deliveries/git.ts`) | A rota `/api/deliveries` devolve só o nome do autor. E-mail não trafega pela API. |
| **OpenBot fora do modo demonstração** | Com `--demo` o cadastro do OpenBot não é aberto: o demo não lê nada real da máquina. |
| **Lista mostra o que cada agente faz agora** (`painel/lista.ts`) | O selo "TRABALHANDO" se repetia em quase toda linha e não dizia nada. A segunda linha virou a atividade ao vivo; selo só para exceção (precisa de você, ocioso, concluído), e quem precisa de você sobe para um bloco fixo no topo. |
| **Cor do projeto igual no menu e no prédio** (`cor-projeto.ts`) | O trilho da lista usa a mesma tabela do cordão do crachá e da fileira. Uma tabela só, importada pelo 3D e pelo painel. |
| **Cor de projeto não repete até o 11º** (`corDaChave`, `reservarCores`) | Só com o sorteio, 4 de 6 projetos saíam lilás. Agora o projeto parte da cor do sorteio e, se ela já tem dono, pega a próxima livre; as chaves são reservadas em ordem alfabética quando o snapshot chega, então o mesmo conjunto dá as mesmas cores. A paleta tem 10 matizes, sem vermelho, laranja nem âmbar (esses são alerta, trabalho e atenção). |
| **Cada cor do painel diz uma coisa só** | Vermelho: precisa de você ou limite crítico. Laranja: trabalhando agora (ícone, ponto do avatar, pontos do projeto). Âmbar: uso em atenção. O resto é neutro: logo do provedor em cinza, texto da atividade claro, "leitura antiga" em cinza. |
| **Um sinal por linha na lista** | Ponto da conta só na conta minoritária do provedor; "ocioso" some quando há "Concluiu em…"; a frase vermelha de quem precisa de você fica só no bloco do topo. Nada abaixo de 12 px. |
| **Faixa de planos ordenada por aperto** (`painel/uso.ts`) | A conta mais perto do limite vem primeiro e ganha moldura; o % da janela mais apertada é o maior elemento do cartão; contas sem número encolhem para um chip. Quando não cabe, a faixa rola por setas numa coluna própria (nunca por cima de um cartão). Recolhida, vira uma pílula por conta. Sem projeção de esgotamento: o servidor não entrega esse número. |
| **Demonstração com quatro contas fictícias** (`server/demo/simulator.ts`) | Uma por ferramenta; Claude e Codex com uso (uma perto do limite). Com a conta única sem números, a faixa de planos aparecia vazia para quem acabou de baixar. |
| **Marca de quem usa fica fora do repositório** (`client/public/local/`) | Logo da fachada, nome do letreiro, símbolo do painel (`simbolo.svg`, lido por `barra.ts`) e a fonte General Sans (licença não permite redistribuir) vivem na pasta local, fora do git. O público recebe o glifo de prédio e a fonte do sistema no corpo. |
| **Licenças de terceiros na pasta `licenses/`** | Space Grotesk (OFL) e Helvetiker (MgOpen) exigem o texto da licença junto do arquivo; o NOTICE aponta para lá. |
| **Cabeçalhos em toda resposta** (`server/index.ts`) | `nosniff`, `X-Frame-Options: DENY` e `frame-ancestors 'none'`: o painel não pode ser embutido em outra página. |
| **Título de sessão sempre mascarado** (`titleOf`, `opencode/db.ts`) | Título custom, nome do agente e título gerado saem da conversa; antes só o último prompt passava pelo mascarador de segredos. |
| **`git log` ignora a configuração do repositório lido** (`deliveries/git.ts`) | `-c log.showSignature=false -c core.fsmonitor=false`: uma pasta com `.git/config` hostil não manda executar programa. |
| **Vitest 5** | A cadeia do Vitest 2 tinha 6 avisos do `npm audit` (2 críticos, só em desenvolvimento). Com o 5, zero. |

## Limites assumidos

- Sem pathfinding: rotas são retas entre pontos fixos. Em 100 s de demonstração sobra, em média, um
  esbarrão (< 0,35 m) entre pessoas que se cruzam em diagonal.
- Variáveis de ambiente mantêm o prefixo `HABBLAUD_` do projeto de origem, e `server/config.ts` ainda
  interpreta opções de partes que não foram portadas (acesso remoto, terminal). Elas não têm efeito.
- A interface e os comentários estão em português.
