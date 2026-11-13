// Dados do prédio: lê o snapshot do servidor local (SSE) e, sem agentes, cai no modo demo (claramente marcado).
import type { Estado } from './people';
import type { AgenteEntrada } from './vida/tipos';

export interface PessoaDado {
  id: string;
  nome: string;
  papel: string;
  estado: Estado;
  atividade?: { kind: string; at: number }; // fictícia no DEMO; nunca vem do servidor aqui
}
export interface ProjetoDado {
  id: string;
  nome: string;
  pessoas: PessoaDado[];
}

// Converte o snapshot do servidor (salas + agentes) em projetos com pessoas. Offline e concluídos ficam de fora.
export function projetosDoSnapshot(s: any): ProjetoDado[] {
  const salas = [...(s?.rooms ?? [])].sort((a: any, b: any) => (a.slot ?? 0) - (b.slot ?? 0));
  const porSala = new Map<string, PessoaDado[]>();
  for (const a of s?.agents ?? []) {
    if (a.status === 'offline' || a.status === 'done') continue;
    const l = porSala.get(a.roomId) ?? [];
    l.push({ id: a.id, nome: a.name, papel: a.title ?? a.role ?? '', estado: a.status });
    porSala.set(a.roomId, l);
  }
  return salas
    .filter((r: any) => porSala.has(r.id))
    .map((r: any) => ({ id: r.id, nome: r.name, pessoas: porSala.get(r.id)! }));
}

// Mapeia UM agente do snapshot do servidor para a entrada da "vida" do prédio.
// Privacidade: só passa `activity.kind` e `activity.at` — nunca `text`, `detail` nem `waitingFor`.
// `atividade`/`shells` só existem na saída quando existem na entrada ("ausente" de verdade, não undefined).
export function agenteDoSnapshot(a: any): AgenteEntrada {
  const out: AgenteEntrada = {
    id: a.id, kind: a.kind, provider: a.provider, parentId: a.parentId, roomId: a.roomId, name: a.name,
    role: a.role, title: a.title, sessionId: a.sessionId, account: a.account, status: a.status,
    startedAt: a.startedAt, lastEventAt: a.lastEventAt, statusSince: a.statusSince,
  };
  if (a.look === 'f' || a.look === 'm') out.look = a.look;
  // Semente de aparência: só inteiro ≥ 0 (NaN, negativa ou fracionária quebraria o `% 8` do arquétipo e o rosto).
  if (Number.isInteger(a.seed) && a.seed >= 0) out.seed = a.seed;
  if (a.activity) out.atividade = { kind: a.activity.kind, at: a.activity.at };
  if (a.shells) out.shells = a.shells.length; // só a contagem de shells em segundo plano
  return out;
}

// Demo do protótipo: nomes e projetos fictícios, só para ver o prédio quando não há sessão aberta.
// `atividade` é falsa (declarada como demo no HUD): edit/run/read/web deixam ver os modos de tela.
export const DEMO: ProjetoDado[] = [
  {
    id: 'demo-a',
    nome: 'Projeto Exemplo A',
    pessoas: [
      { id: 'a1', nome: 'Iris', papel: 'Interface', estado: 'working', atividade: { kind: 'edit', at: Date.now() } },
      { id: 'a2', nome: 'Dedalo', papel: 'Servidor', estado: 'working', atividade: { kind: 'run', at: Date.now() } },
      { id: 'a3', nome: 'Argos', papel: 'Testes', estado: 'idle' },
    ],
  },
  {
    id: 'demo-b',
    nome: 'Projeto Exemplo B',
    pessoas: [
      { id: 'b1', nome: 'Minos', papel: 'Revisão', estado: 'waiting' },
      { id: 'b2', nome: 'Iris', papel: 'Interface', estado: 'working', atividade: { kind: 'read', at: Date.now() } },
      { id: 'b3', nome: 'Hades', papel: 'Banco', estado: 'idle', atividade: { kind: 'web', at: Date.now() } },
    ],
  },
];

// Abre o stream e chama `aoMudar` a cada snapshot. Devolve true se está usando dados reais.
// `aoBruto` recebe o snapshot completo (agentes e salas) quando há dados reais; sem sessão, recebe null (modo demo).
// `aoSnapshot` recebe o snapshot cru sempre (os painéis de lista e atividade precisam dos campos que o mapping corta).
export function conectar(
  aoMudar: (p: ProjetoDado[], real: boolean) => void,
  aoEstado: (t: string) => void,
  aoBruto?: (snapshot: any | null) => void,
  aoSnapshot?: (s: any) => void,
) {
  let ultimo: ProjetoDado[] = [];
  const es = new EventSource('/api/stream');
  es.addEventListener('snapshot', (ev) => {
    try {
      const d = JSON.parse((ev as MessageEvent).data);
      ultimo = projetosDoSnapshot(d.snapshot ?? d);
      aoSnapshot?.(d.snapshot ?? d);
      if (ultimo.length) {
        // Modo demonstração do servidor (`npm run demo`): deixa claro na tela que os dados são fictícios.
        const modo = (d.snapshot ?? d).meta?.demo ? 'demonstração (dados fictícios)' : 'ao vivo';
        aoEstado(`${modo} · ${ultimo.length} projetos · ${ultimo.reduce((n, p) => n + p.pessoas.length, 0)} agentes`);
        aoMudar(ultimo, true);
        aoBruto?.(d.snapshot ?? d);
      } else {
        aoEstado('demo (nenhuma sessão ativa)');
        aoMudar(DEMO, false);
        aoBruto?.(null);
      }
    } catch {
      /* quadro quebrado: ignora e espera o próximo */
    }
  });
  es.onerror = () => {
    aoEstado('demo (servidor fora do ar, reconectando)');
    if (!ultimo.length) { aoMudar(DEMO, false); aoBruto?.(null); }
  };
}
