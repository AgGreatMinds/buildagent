// Texto central do painel de lista de agentes: tudo que aparece no DOM sai daqui.
// Nenhum string solto em lista.ts — para trocar um rótulo, é só editar este arquivo.
import type { AgentStatus, Provider } from '../../../shared/types';

export const texto = {
  tituloPainel: 'Agentes',
  dicaBusca: 'Buscar agente, projeto ou conta…',
  modeloNaoInformado: 'modelo não informado',
  // Rótulos genéricos do "modo conteúdo" (quando ligado, nome/título viram isto).
  generico: { principal: 'Agente', subagente: 'Subagente' },
  // Grupo da lista (Frente B + refino "atividade ao vivo"): contagem, filtro de contas,
  // bloco "Precisam de você", selos de exceção, estados vazios e rótulos de acessibilidade.
  // Espelhado em texto-en.ts (mesmo formato).
  lista: {
    agente: 'agente',
    agentes: 'agentes',
    // Chips do filtro de contas (só aparecem com 2+ contas com agentes).
    filtroContas: 'Filtrar por conta',
    todas: 'Todas',
    // Bloco fixo no topo: quem espera uma resposta sua.
    precisamDeVoce: 'Precisam de você',
    // Selo de exceção por estado (trabalhando e esperando shell não têm selo: a atividade fala por eles).
    selos: { waiting: 'precisa de você', idle: 'ocioso', done: 'concluído', offline: 'ausente' },
    // Nome de cada estado na dica e no leitor de tela dos pontos do cabeçalho do projeto.
    estados: {
      working: 'trabalhando',
      waiting: 'precisa de você',
      shell: 'esperando shell',
      idle: 'ocioso',
      done: 'concluído',
      offline: 'ausente',
    } satisfies Record<AgentStatus, string>,
    // Dica do tempo à direita da linha.
    noEstadoHa: 'neste estado há',
    conta: 'Conta',
    // Estados vazios: nenhum agente aberto / busca ou filtro sem resultado (com ação de saída).
    semAgentes: 'Nenhum agente aberto agora',
    semAgentesDica: 'Abra uma sessão do Claude Code, Codex, OpenCode ou Pi: ela aparece aqui, agrupada por projeto.',
    semResultados: 'Nenhum agente encontrado',
    limparFiltros: 'Limpar busca e filtro',
    // Botões de ícone: o rótulo diz o que o clique faz.
    ariaRecolher: 'Recolher a lista de agentes',
    ariaAbrir: 'Abrir a lista de agentes',
    // Botão flutuante com a lista recolhida: "2 precisam de você".
    ariaAbrirUrgente: 'Abrir a lista de agentes · {0} precisam de você',
  },
  // Salas (projetos): lápis de renomear (apelido local, só localStorage) e ordenação dos grupos.
  salas: {
    dicaLapis: 'Renomear esta sala (apelido local — não é gravado no servidor)',
    dicaRenomear: 'Enter salva · Esc cancela · vazio volta ao nome',
    ariaCampo: 'Nome da sala',
    dicaSobe: 'Subir esta sala na lista',
    dicaDesce: 'Descer esta sala na lista',
  },
  status: {
    working: 'trabalhando',
    waiting: 'precisa de você',
    shell: 'esperando shell',
    idle: 'ocioso',
    done: 'concluído',
    offline: 'ausente',
  } satisfies Record<AgentStatus, string>,
  // Selo de provedor (o campo é opcional no snapshot; ausente = claude).
  provedor: { claude: 'Claude', codex: 'Codex', opencode: 'OpenCode', pi: 'Pi' } satisfies Record<Provider, string>,
  // Painel de atividade (feed inferior): cabeçalho, estado vazio e máscaras de modo conteúdo.
  feed: {
    tituloPainel: 'Atividade',
    dicaRecolher: 'Mostrar/ocultar',
    vazio: 'As mudanças dos agentes aparecem aqui assim que acontecem.',
    semTitulo: 'sem título',
    tituloMascarado: 'atividade (conteúdo oculto)',
    ticker: 'Último evento',
  },
  // Diálogo de ajuda "Como ler o prédio" (botão ?).
  ajuda: {
    titulo: 'Como ler o prédio',
    dicaBotao: 'Como ler o prédio',
    fechar: 'Fechar ajuda',
    intro: 'Cada projeto aberto vira uma fileira no andar 1: cada mesa é um agente, com nome, papel e status.',
    secoes: {
      status: 'Status e cores',
      espaco: 'O espaço',
      controles: 'Câmeras e teclas',
      exemplo: 'Dados de EXEMPLO',
    },
    status: [
      ['working', 'Na mesa: está processando um pedido.'],
      ['waiting', 'Mão levantada: espera resposta sua (permissão, pergunta ou escolha).'],
      ['shell', 'Ampulheta: terminou o turno e espera um comando em segundo plano terminar.'],
      ['idle', 'Terminou o turno: circula pelo prédio até a próxima instrução.'],
      ['done', 'Concluiu o pedido: fica 30 min no prédio e só então some.'],
      ['offline', 'Sessão encerrada: o agente saiu do prédio.'],
    ] as Array<[AgentStatus, string]>,
    espaco: [
      'Térreo: recepção, espera, café — áreas comuns onde os ociosos circulam. Quem conclui o turno fica 30 min no prédio e só então some.',
      'Andar 1: as fileiras de mesa — cada fileira é um projeto, cada mesa um agente. A cor da fileira é a identidade do projeto.',
      'Sala de guerra (andar 2): mesa grande de 12 lugares; reúne os subagentes quando um projeto escala.',
      'Andar 2: social e decorativo — salas de reunião, jardim, biblioteca, terraço.',
    ],
    controles: [
      ['1–8', 'vistas de câmera (1 visão geral, 3 andar 1, 7/8 andar 2…)'],
      ['d', 'liga/desliga o drone (órbita lenta em volta do prédio)'],
      ['c', 'alterna o corte por andar (todos / andar 1 / andar 2)'],
      ['arrastar + roda', 'gira e aproxima a câmera livre'],
    ] as Array<[string, string]>,
    exemplo: 'As TVs e telas do andar 2 mostram dados de EXEMPLO — decoração. Só o feed e a lista trazem o status real dos agentes.',
  },
  // Faixa "Contas · uso" (Frente A): cartões, rótulos de janela, selos de estado,
  // resumo compacto e diálogo curto.
  uso: {
    tituloPainel: 'Contas · uso',
    dicaRecolher: 'Recolher',
    dicaAbrir: 'Abrir',
    vazio: 'Nenhuma conta detectada.',
    grupos: { claude: 'Claude', codex: 'Codex', opencode: 'OpenCode', pi: 'Pi' },
    // Rótulos das barras de uso.
    janela5h: '5 h',
    janelaSemana: 'Semana',
    // Rótulos curtos das micro-barras do cartão (o nome longo fica na dica).
    janela5hCurta: '5h',
    janelaSemanaCurta: 'semana',
    semJanela: '—',
    renovada: 'renovada',
    reinicia: 'reinicia',
    // Mensagens no lugar das barras e selo de idade.
    semDados: 'sem dados de uso',
    semCota: 'sem cota',
    semLimite: 'sem limite de uso informado',
    // Chips compactos das contas sem número (no fim da faixa).
    semDadosCurto: 'sem dados',
    semLimiteCurto: 'sem limite',
    // "Como ativar" no chip compacto: ícone "?" com este rótulo ({0} = nome da conta).
    ariaComoAtivar: 'Como ativar o uso de {0}',
    // Faixa recolhida: pior 5 h e pior semana entre as contas; sem número em nenhuma conta.
    resumoVazio: 'sem dados de uso',
    // Setas da faixa quando nem todas as contas cabem (rolam um cartão por vez).
    contasAnteriores: 'Contas anteriores',
    // Leitura antiga (estado 'stale'), escrita na legenda do cartão.
    leituraAntiga: 'leitura antiga',
    maisContas: 'Mais contas',
    // Dica do pontinho de leitura antiga (substitui o selo "antigo").
    dicaAntigo: 'Leitura antiga: rode /usage nesta conta para atualizar',
    // Botão + diálogo "Como ativar".
    comoAtivar: 'Como ativar',
    dicaComoAtivar: 'Como mostrar o uso desta conta',
    dialogo: {
      titulo: 'Como ativar o uso',
      fechar: 'Fechar',
      corpo: [
        'O uso (janela de 5 h e semana) chega por uma das duas formas abaixo.',
        '1. statusline (opcional, passo a passo no README): com o script scripts/statusline-uso.mjs ligado como statusline do Claude Code, o uso da conta é gravado em um arquivo local (~/.buildagent/usage/<conta>.json) e se atualiza enquanto a sessão roda. A barra mostra percentual e "reinicia em" a partir dele.',
        '2. /usage: rode o comando /usage na conta para atualizar o cache; os números envelhecem até a próxima vez — por isso a barra marca leituras antigas como "antigo".',
        'Sem fonte ligada, a conta aparece "sem dados de uso". Contas do Codex só registram uso enquanto alguma sessão roda; "sem cota" significa que a conta está sem cota nem créditos agora (não é 0% usado).',
      ],
    },
  },
  // Diálogo "Meu dia": KPIs, cartões por hora/projeto/esperas e estados.
  meudia: {
    titulo: 'Meu dia',
    fechar: 'Fechar Meu dia',
    carregando: 'Carregando…',
    // Cabeçalho de crédito: hora do servidor do último carregamento.
    atualizadoBase: 'Atualizado às {0} · atualiza a cada 30 s',
    erro: 'Não foi possível carregar as estatísticas do dia',
    tentar: 'Tentar de novo',
    vazio: 'Ainda não há tempo registrado hoje. Os números aparecem assim que um agente trabalhar com o BuildAgent rodando.',
    // Ressalva do rodapé (mesma regra de contagem da referência).
    nota: 'O tempo de agente é a soma de todos eles: dois agentes trabalhando por 1 hora contam 2 horas. “Esperando você” é o tempo de mão levantada no escritório (permissão, pergunta ou escolha). O BuildAgent só conta o que acontece enquanto ele está rodando.',
    destaqueTitulo: 'Destaques do dia',
    // KPIs: rótulo, valor e subtexto.
    esperandoVoce: 'Esperando você',
    trabalhando: 'Trabalhando',
    somaAgentes: 'soma do tempo de todos os agentes',
    sessoes: 'Sessões · subs',
    sessoesSub: 'sessões principais · subagentes',
    pedidos: 'Pedidos',
    ferramentasSub: 'ferramentas',
    tarefasSub: 'tarefas concluídas',
    tokens: 'Tokens',
    entrada: 'entrada',
    saida: 'saída',
    custo: 'Custo',
    custoDica: 'Custo calculado pelo próprio Claude Code',
    custoNaoGravado: 'Os transcripts não trouxeram o custo',
    semGasto: 'Nenhum gasto registrado',
    esperasSub: 'esperas',
    espera: 'espera',
    maiorEspera: 'maior espera',
    alguemEsperou: 'alguém esperou por você durante',
    nenhumaEspera: 'nenhuma espera',
    // Cartões.
    porHora: 'Por hora',
    porHoraSub: 'Tempo de agente em cada hora do dia',
    porProjeto: 'Por projeto',
    porProjetoSub: 'Ordenado pelo tempo esperando você',
    maiorEsperas: 'Maiores esperas',
    maiorEsperasSub: 'Quanto tempo cada agente ficou de mão levantada esperando você',
    verTabela: 'Ver tabela',
    verGráfico: 'Ver gráfico',
    semProjetos: 'Nenhum projeto com tempo neste dia.',
    semEsperas: 'Nenhuma espera por você neste dia.',
    // Tabela alternativa / itens.
    total: 'total',
    agora: 'agora',
    desde: 'desde',
    emProjeto: 'em',
    esperandoAgora: 'esperando agora',
    // Rótulos dos status nos cartões (o mesmo vocabulário da lista).
    statusRotulos: {
      waiting: 'esperando você',
      working: 'trabalhando',
      idle: 'ocioso',
      shell: 'esperando o shell',
    },
    // Acessibilidade.
    graficoAria: 'Gráfico de barras: tempo de agente por hora do dia, separado por status',
  },
  // Diálogo "Histórico": sessões antigas (Claude/Codex/OpenCode) com
  // data, projeto, duração e status final — somente leitura; busca + filtro.
  // A rota s2 (/api/history) ainda não existe: estados vazio/erro ficam claros.
  historico: {
    titulo: 'Histórico',
    fechar: 'Fechar histórico',
    dicaBusca: 'Buscar por título, projeto ou provedor…',
    dicaStatus: 'Filtrar por status final',
    todosStatus: 'Todos',
    carregando: 'Carregando sessões…',
    vazio: 'Sem sessões ainda. O histórico aparece quando o servidor começar a expor GET /api/history.',
    erro: 'Não foi possível carregar o histórico',
    tentar: 'Tentar de novo',
    semTitulo: 'Sessão sem título',
    semResultado: 'Nenhuma sessão encontrada para',
    sessao: 'sessão',
    sessoes: 'sessões',
    // Campos opcionais que só aparecem quando o contrato s2 trouxer.
    semDuracao: 'duração não informada',
    semStatus: 'status não informado',
  },
  // Gaveta de detalhes do agente (direita): nome/papel, status, provedor/conta,
  // modelo, projeto, sessão, hierarquia e últimas ações. Strings que a gaveta reusa
  // (texto.status, texto.provedor, texto.modeloNaoInformado, texto.generico) ficam nos grupos delas.
  detalhe: {
    tituloPainel: 'Detalhes',
    dicaFechar: 'Fechar detalhes',
    // Acabamento: barra, hero e selo de
    // estado. Espelho idêntico em texto-en.ts; as strings antigas
    // noStatusHa/sumido/provedorConta saíram (substituídas por `ui`).
    ui: {
      tituloBarra: 'Detalhes',
      // Selos de estado em caixa alta (spec 2.4: a fonte entrega assim mesmo).
      selos: {
        working: 'Trabalhando',
        waiting: 'Precisa de você',
        idle: 'Ocioso',
        shell: 'Esperando shell',
        done: 'Concluído',
        offline: 'Ausente',
      } satisfies Record<AgentStatus, string>,
      noStatusHa: 'no status há',
      quandoAgora: 'agora',
      aoSeguir: 'Seguir',
      ariaSeguir: 'Seguir este agente na câmera',
      aoCentralizar: 'Centralizar',
      ariaCentralizar: 'Centralizar a câmera neste agente',
      sumidoAviso: 'Este agente já saiu do prédio.',
      // Passos 4/5 do acabamento: card "Agora" (2.5) e grade "Identificação" (2.6).
      identificacao: 'Identificação',
      agoraRotulo: 'Agora',
      agoraProcessando: 'Processando…',
      agoraEspera: 'Precisa de uma resposta sua',
      agoraShell: 'Esperando o shell terminar',
      agoraShellExtra: '{0} em segundo plano',
      agoraOcioso: 'Aguardando a próxima instrução',
      agoraUltimaAcao: 'Última ação: {0} · {1}',
      agoraConcluido: 'Concluiu a tarefa',
      caminho: 'Caminho',
      modeloNaoInformado: 'Não informado',
      caminhoNaoInformado: 'Caminho não informado',
      copiaFalhou: 'Não foi possível copiar',
      ariaCopiar: 'Copiar valor completo',
      // Passos 5/6 do acabamento (spec 2.8/2.9): paginação dos subagentes
      // e da linha do tempo — `{0}` = quantos ainda estão escondidos.
      mostrarMais: 'Mostrar mais {0}',
      mostrarMenos: 'Mostrar menos',
      // Passo 8 (specs 2.10/2.11): selo "simulado" no cabeçalho da Vida social
      // (`title` reusa `vidaSocialSimulado`), papel dos rivais, nota final.
      simulado: 'simulado',
      rival: 'Rival',
      notaFinal: 'Simulado, só pra diversão. Não vale nada.',
    },
    modelo: 'Modelo',
    projeto: 'Projeto',
    sessao: 'Sessão',
    subagentes: 'Subagentes',
    responsavel: 'Responsável',
    semSubagentes: 'Sem subagentes agora.',
    paiSumido: 'O agente principal já não está no prédio.',
    // Linha do tempo (passo 6 do acabamento: renomeada de "Últimas ações",
    // decisões do §7 do plano): cabeçalho, tempo relativo e estado vazio.
    acoes: 'Linha do tempo',
    ha: 'há',
    semAcoes: 'Sem ações recentes.',
    // Texto de ação mascarado no modo conteúdo (o texto traz nome de arquivo/pedido).
    acaoMascarada: 'atividade (conteúdo oculto)',
    // LACUNA: a conversa recente (markdown, só leitura) fica fora: o servidor não
    // expõe o texto da conversa — anotada em detalhe.ts.
    conversaLacuna: 'Conversa não exposta pelo servidor',
    // Estatísticas e Vida social.
    // Estatísticas (dados reais de AgentInfo.stats — nada inventado).
    estatisticas: 'Estatísticas',
    statFerramentas: 'Chamadas de ferramenta',
    statTokensIn: 'Tokens de entrada',
    statTokensOut: 'Tokens de saída',
    statSubagentes: 'Subagentes disparados',
    statModelo: 'Modelo',
    statPermissoes: 'Permissões',
    statSessao: 'Sessão',
    statInicio: 'Início',
    statDuracao: 'Duração',
    copiar: 'Copiar',
    copiado: 'Copiado',
    valorNaoInformado: '—',
    // Vida social: brincadeira local — a tela diz explicitamente que é simulado.
    vidaSocial: 'Vida social',
    vidaSocialSimulado: 'simulado, só pra diversão',
    tracos: {
      'mao-na-massa': { emoji: '🔨', rotulo: 'Mão na massa', dica: 'Muitas chamadas de ferramenta no dia' },
      competicao: { emoji: '⚔️', rotulo: 'Competição', dica: 'Quase sempre no trabalho' },
      foco: { emoji: '🎯', rotulo: 'Foco', dica: 'Pensa e planeja antes de tocar' },
      sonecas: { emoji: '😴', rotulo: 'Sonecas', dica: 'Ganhou vários intervalos de ocioso' },
    },
    bordoes: [
      'Hoje o prédio inteiro sabe que a mesa é minha.',
      'Café primeiro, commit depois. Sempre.',
      'O cronograma é sugestão; o prazo é comigo mesmo.',
      'Teste verde é o único verde que importa.',
      'Se está funcionando, nem toca — só olha.',
      'A linha do tempo agradece: sem drama, só deploy.',
      'Meu status: 99% foco, 1% café.',
      'O bug não some sozinho. Ele fica esperando você.',
    ],
    rivaisRotulo: 'Rivalidades da sala',
    rivaisVazio: 'Nenhum colega na sala agora.',
    rivaisSep: '×',
    moedasRotulo: 'Moedinhas',
    moedasDica: '1 a cada minuto trabalhando',
    extratoTitulo: 'Extrato',
    extratoChegou: 'chegou ao escritório',
    extratoConcluiu: 'concluiu em {0}',
  },
  // Barra superior: contadores (valor + rótulo singular/plural) e botões.
  barra: {
    marca: 'BuildAgent',
    dicaGrupo: 'Resumo do prédio',
    dicaBotaoPainel: 'Abrir/fechar painel',
    contadores: {
      salas: { singular: 'sala', plural: 'salas', dica: 'Salas de projeto abertas' },
      agentes: { singular: 'agente', plural: 'agentes', dica: 'Agentes no prédio (principais e subagentes)' },
      trabalhando: { singular: 'trabalhando', plural: 'trabalhando', dica: 'Agentes processando um pedido agora' },
      precisamDeVoce: { singular: 'precisa de você', plural: 'precisam de você', dica: 'Agentes esperando a sua resposta' },
    },
    botoes: {
      lista: 'Lista',
      atividade: 'Atividade',
      ajuda: 'Ajuda',
      emBreve: 'em breve',
      contas: 'Contas · uso',
      meuDia: 'Meu dia',
      historico: 'Histórico',
      replay: 'Replay',
      config: 'Configurações',
      dicaConfig: 'Configurações (som, avisos, painéis, idioma)',
    },
  },
  // Diálogo de configurações (engrenagem da barra): seções, rótulos,
  // dicas, reset. EN espelhado só neste grupo em texto-en.ts (o resto do app
  // segue PT — decisão do resumo final).
  config: {
    titulo: 'Configurações',
    fechar: 'Fechar configurações',
    secoes: {
      avisos: 'Avisos',
      conteudo: 'Conteúdo',
      paineis: 'Painéis',
      idioma: 'Idioma',
    },
    som: 'Som',
    dicaSom: 'Sino curto quando alguém precisa de você; estalo quando conclui',
    volume: 'Volume',
    dicaVolume: 'Volume dos sons de aviso',
    notificacoes: 'Notificações do navegador',
    dicaNotificacoes: 'Avisa quando um agente precisa de você com a aba oculta (pede permissão ao ligar)',
    notifLigadas: 'Ligadas',
    notifRecusadas: 'Bloqueadas pelo navegador: libere nas permissões do site',
    notifNaoSuportadas: 'Este navegador não oferece notificações',
    modoConteudo: 'Modo conteúdo / gravação',
    dicaModoConteudo: 'Ligado troca nomes e títulos por rótulos genéricos — ligue antes de gravar a tela',
    lista: 'Lista de agentes',
    dicaLista: 'Mostrar/ocultar o painel de agentes',
    atividade: 'Atividade',
    dicaAtividade: 'Mostrar/ocultar o feed de atividade',
    ajuda: 'Ajuda',
    dicaAjuda: 'Mostrar/ocultar a ajuda “Como ler o prédio”',
    idioma: 'Idioma da interface',
    dicaIdioma: 'Aplica a escolha e recarrega a página (o restante do app ainda está em português)',
    redefinir: 'Redefinir configurações',
    dicaRedefinir: 'Apaga as preferências salvas e recarrega a página',
  },
  // Avisos e sons: toasts, títulos, bloco de preferências compacto.
  avisos: {
    precisaDeVoce: 'Precisa de você',
    concluido: 'Concluído',
    fechar: 'Fechar aviso',
    dicaPrefs: 'Preferências de aviso',
    som: 'Som',
    dicaSom: 'Sino curto quando alguém precisa de você; estalo quando conclui',
    volume: 'Volume',
    dicaVolume: 'Volume dos sons de aviso',
    notificacoes: 'Notificações do navegador',
    dicaNotificacoes: 'Avisa quando um agente precisa de você com a aba oculta (pede permissão ao ligar)',
    notifLigadas: 'ligadas',
    notifRecusadas: 'recusadas',
    notifNaoSuportadas: 'não suportadas',
  },
};
