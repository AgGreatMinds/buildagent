// Contrato da "vida" do prédio: quem são as pessoas (identidade) e o que cada uma quer fazer agora (social).
// Lógica pura, sem three.js e sem relógio global: o tempo entra sempre como argumento (reprodutível em gravação).

export type Estado = 'working' | 'waiting' | 'idle' | 'shell' | 'done' | 'offline';

// Subconjunto do AgentInfo do servidor que a identidade usa (ver shared/types.ts).
export interface AgenteEntrada {
  id: string;
  kind: 'main' | 'sub';
  provider?: string; // ausente = 'claude'
  parentId?: string;
  roomId: string; // pasta do projeto
  name: string; // nome humano automático dado pelo servidor
  role: string; // principal: "Agente principal"; sub: tipo do subagente ("Explore", "iris"...)
  title?: string;
  sessionId: string; // o "chat"
  account: string;
  status: Estado;
  startedAt: number;
  lastEventAt: number;
  statusSince: number;
  look?: 'f' | 'm'; // dica de gênero do nome automático (snapshot): o corpo 3D e o rosto da lista concordam com o nome
  seed?: number; // semente de aparência do servidor — a MESMA do rosto da lista (antes o 3D usava outra e divergia)
  atividade?: { kind: string; at: number }; // só o "tipo" e o "quando" da atividade (privacidade: nunca o texto)
  shells?: number; // quantos shells em segundo plano (só a contagem; nunca o conteúdo)
}

// Uma pessoa no prédio. Vários agentes iguais no mesmo chat viram UMA pessoa com contagem.
export interface PessoaId {
  chave: string; // estável: identifica a pessoa entre snapshots
  nome: string; // nome exibido ("Iris", ou nome humano automático)
  nomeAutomatico: boolean; // true = agente sem nome próprio (Explore, Plan, principal...)
  papel: string;
  roomId: string;
  provider: string;
  sessionId: string;
  agenteIds: string[]; // agentes ativos agrupados nesta pessoa
  contagem: number; // quantos agentes ativos (badge ×N quando > 1)
  estado: Estado; // o "melhor" estado entre os agentes ativos; 'done' quando todos concluíram
  entrouEm: number; // primeira vez vista (epoch ms)
  concluidoEm?: number; // quando todos os agentes terminaram
  semente: number; // 32 bits estáveis para aparência e decisões
  look?: 'f' | 'm'; // gênero do nome do agente (o mesmo do rosto da lista); ausente = sorteio da semente
  seedVisual?: number; // semente de aparência do servidor (a do rosto da lista; na nomeada, a do agente de menor id); ausente = `semente`
}

export type Destino =
  | 'entrada' | 'mesa' | 'copa' | 'banheiro' | 'lounge' | 'conversa'
  | 'tv' | 'fliperama' | 'pingpong' | 'estante' // agenda ociosa
  | 'guerra' | 'terraco' | 'galeria' | 'descanso' | 'saida';

export type FaseEntrada = 'rua' | 'porta' | 'recepcao' | 'elevador' | 'andar';

export interface Intencao {
  chave: string;
  destino: Destino;
  slot: number; // índice do lugar dentro do destino (assento, banqueta, ponto de conversa...)
  conversaCom?: string; // chave da outra pessoa, quando destino === 'conversa'
  fase?: FaseEntrada; // só quando destino === 'entrada'
  desde: number;
  ate: number; // quando a intenção deve ser reavaliada (epoch ms)
}

export const MIN = 60_000;
export const PERMANENCIA_APOS_CONCLUIR = 30 * MIN;
export const ENTRADA_MAX = 8_000;
