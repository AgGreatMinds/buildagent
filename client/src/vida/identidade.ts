// Identidade das pessoas do prédio: agrupa agentes em pessoas estáveis entre snapshots.
// Lógica pura (como tipos.ts): sem relógio global, o tempo entra por `agora` (epoch ms).

import type { AgenteEntrada, PessoaId } from './tipos';
import { PERMANENCIA_APOS_CONCLUIR } from './tipos';

// Status que contam como "no prédio agora". done/offline não entram em contagem nem em agenteIds.
export const ATIVOS = ['working', 'waiting', 'idle', 'shell'] as const;

// Roles genéricos (sem nome próprio, comparação sem maiúsculas): cada um vira pessoa automática distinta.
export const GENERICOS = ['explore', 'plan', 'general-purpose', 'fork', 'build', 'agent', 'task', 'subagent'];

// Prioridade de estado quando vários ativos se agrupam: waiting > working > shell > idle.
const PRIORIDADE: Array<'waiting' | 'working' | 'shell' | 'idle'> = ['waiting', 'working', 'shell', 'idle'];

// FNV-1a de 32 bits: semente estável (apariência/decisões) derivada da chave. >>>0 mantém unsigned.
function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Estado entre snapshots: chave -> pessoa. `entrouEm` preserva a primeira vez vista;
// `concluidoEm` grava na transição 1→0 ativos e limpa quando volta a ter ativo.
export interface Memoria {
  pessoas: Map<string, PessoaId>;
}

export function novaMemoria(): Memoria {
  return { pessoas: new Map() };
}

function providerDe(a: AgenteEntrada): string {
  return a.provider ?? 'claude';
}

// Sub com role fora da lista genérica (case-insensitive) → pessoa nomeada, agrupada pela chave.
function temNomeProprio(a: AgenteEntrada): boolean {
  if (a.kind !== 'sub') return false;
  return !GENERICOS.includes(a.role.toLowerCase());
}

// Pessoa nomeada: agrupa por role(minúsculo)|pasta|provider|chat → vários agentes iguais = uma pessoa.
// Pessoa automática (principal ou sub genérico): cada agente é uma pessoa distinta (chave auto|id).
function chaveDe(a: AgenteEntrada): string {
  if (temNomeProprio(a)) {
    const nome = a.role.toLowerCase(); // "Iris" e "iris" caem na mesma chave
    return `${nome}|${a.roomId}|${providerDe(a)}|${a.sessionId}`;
  }
  return `auto|${a.id}`;
}

function nomeExibido(a: AgenteEntrada): string {
  if (temNomeProprio(a)) return a.role.charAt(0).toUpperCase() + a.role.slice(1);
  return a.name; // nome humano automático dado pelo servidor
}

// Melhor estado entre os ativos; 'done' quando não há nenhum.
function estadoDosAtivos(ativos: AgenteEntrada[]): PessoaId['estado'] {
  if (ativos.length === 0) return 'done';
  for (const p of PRIORIDADE) if (ativos.some((a) => a.status === p)) return p;
  return 'idle';
}

export function consolidar(agentes: AgenteEntrada[], agora: number, mem: Memoria): PessoaId[] {
  // Agrupa o snapshot por chave de identidade (a ordem de entrada não afeta a saída: ela é ordenada no fim).
  const grupos = new Map<string, AgenteEntrada[]>();
  for (const a of agentes) {
    const chave = chaveDe(a);
    const g = grupos.get(chave);
    if (g) g.push(a);
    else grupos.set(chave, [a]);
  }

  // Chaves presentes no snapshot: atualiza (ou cria, só se houver ativo) a pessoa.
  for (const [chave, membros] of grupos) {
    const ativos = membros.filter((m) => (ATIVOS as readonly string[]).includes(m.status));
    const rep = membros[0]; // mesma chave ⇒ mesmo nome/papel/pasta/provider/chat
    let pessoa = mem.pessoas.get(chave);

    if (!pessoa) {
      // Primeira vez que a chave é vista: nascida done/offline → nunca entrou no prédio, ignora.
      if (ativos.length === 0) continue;
      // Aparência = a do rosto da lista (seed/look do servidor) para TODA pessoa — antes a
      // nomeada ("Iris") usava `fnv1a32(chave)` no 3D e o boneco não batia com o rosto da
      // lista. Nomeada agrupa vários agentes: vale o de menor id (independe da ordem do
      // snapshot), fixado na criação — corpo estável enquanto a pessoa existe.
      const visual = membros.reduce((m, a) => (a.id < m.id ? a : m));
      pessoa = {
        chave,
        nome: nomeExibido(rep),
        nomeAutomatico: !temNomeProprio(rep),
        papel: rep.role,
        roomId: rep.roomId,
        provider: providerDe(rep),
        sessionId: rep.sessionId,
        agenteIds: [],
        contagem: 0,
        estado: 'idle',
        entrouEm: agora, // primeira vez vista
        semente: fnv1a32(chave),
        // O corpo segue o gênero do nome e a semente do rosto da lista (sem seed: cai em `semente`).
        look: visual.look,
        seedVisual: visual.seed,
      };
      mem.pessoas.set(chave, pessoa);
    }

    if (ativos.length === 0) {
      // 1→0 (ou snapshot com todos concluídos): grava a conclusão uma vez só; estado fica 'done'.
      if (pessoa.concluidoEm === undefined) pessoa.concluidoEm = agora;
      pessoa.estado = 'done';
      pessoa.agenteIds = [];
      pessoa.contagem = 0;
    } else {
      // Voltou a ter ativo: limpa a conclusão e atualiza o agrupamento (só ativos entram).
      delete pessoa.concluidoEm;
      pessoa.estado = estadoDosAtivos(ativos);
      pessoa.agenteIds = ativos.map((a) => a.id).sort();
      pessoa.contagem = ativos.length;
    }
  }

  // Chaves da memória ausentes deste snapshot que ainda tinham ativo: agentes sumiram →
  // transição 1→0 em `agora`, e a pessoa segue visível pela janela de permanência.
  for (const [chave, p] of mem.pessoas) {
    if (grupos.has(chave) || p.contagem === 0) continue;
    if (p.concluidoEm === undefined) p.concluidoEm = agora;
    p.estado = 'done';
    p.agenteIds = [];
    p.contagem = 0;
  }

  // Expira concluídas: ao completar PERMANENCIA_APOS_CONCLUIR, some do resultado e da memória.
  for (const [chave, p] of mem.pessoas) {
    if (p.concluidoEm !== undefined && agora - p.concluidoEm >= PERMANENCIA_APOS_CONCLUIR) {
      mem.pessoas.delete(chave);
    }
  }

  // Presentes: ativos, ou concluídos dentro da janela. Ordem determinística: entrouEm, depois chave.
  const presentes = [...mem.pessoas.values()].filter(
    (p) => p.contagem > 0 || (p.concluidoEm !== undefined && agora - p.concluidoEm < PERMANENCIA_APOS_CONCLUIR),
  );
  presentes.sort((a, b) => (a.entrouEm - b.entrouEm) || (a.chave < b.chave ? -1 : a.chave > b.chave ? 1 : 0));
  return presentes;
}
