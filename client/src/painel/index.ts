// Ponto de montagem do painel: liga a barra superior ao fluxo de snapshots.
// A barra, o painel de uso (Contas · uso) e o diálogo "Meu dia" rodam aqui;
// lista/atividade/ajuda já existem (lista.ts, feed.ts, ajuda.ts) e ganham seus
// abridores por aqui apenas como ASSINATURAS STUB — o objeto `stream` que
// montarPainel recebe é preenchido por quem monta a tela (ex.: `aoAlternarLista:
// () => ...`), sem reescrever este arquivo.
import { montarBarra } from './barra';
import { montarAvisos } from './avisos';
import { montarUso } from './uso';
import { montarMeuDia } from './meudia';
import { montarHistorico } from './historico';
import { montarConfig, type OpcoesConfig } from './config';
import type { PainelId, SnapPainel } from './types';
import type { Prefs } from './prefs';
import './painel.css';

/**
 * Encaixes de toggle (um por painel). Todos opcionais:
 * os botões da barra só repassam o clique — sem destino, nada acontece.
 */
export interface StreamPainel {
  /** Abre/fecha a lista de agentes (painel/lista.ts). */
  aoAlternarLista?: () => void;
  /** Abre/fecha a atividade (painel/feed.ts). */
  aoAlternarAtividade?: () => void;
  /** Abre/fecha a ajuda (painel/ajuda.ts). */
  aoAlternarAjuda?: () => void;
  /** Abre/fecha o player de replay (painel/replay.ts). */
  aoAlternarReplay?: () => void;
  /** Mudança de preferência vinda do diálogo de configurações. */
  aoMudarPrefs?: (p: Prefs) => void;
}

export interface ApiPainel {
  /** Repinta a barra e o painel de uso a cada snapshot do stream (mesmo snapshot que alimenta lista/feed). */
  atualizar(snap: SnapPainel): void;
  /** Remove a barra, o painel de uso e o diálogo "Meu dia" do DOM. */
  fecha(): void;
}

export function montarPainel(stream: StreamPainel): ApiPainel {
  // Cliques da barra viram o destino correspondente (lista, atividade, ajuda...).
  const uso = montarUso();
  const meudia = montarMeuDia(); // diálogo com fetch próprio — não depende do stream
  const historico = montarHistorico(); // diálogo de sessões antigas (fetch próprio)
  const avisos = montarAvisos(); // toasts de transição + sons + título da aba
  // Diálogo de configurações: prefs persistem na chave unificada; o motor
  // de som é o do avisos.ts (não se cria um 2º AudioContext). `aoMudarPrefs` dá
  // ao main.ts o ponto de aplicar modoConteudo/visibilidade nas superfícies.
  const opcoesConfig: OpcoesConfig = {
    aoMudar: (p) => stream.aoMudarPrefs?.(p),
  };
  const config = montarConfig(opcoesConfig);
  const aoTocarPainel = (id: PainelId) => {
    switch (id) {
      case 'lista':
        stream.aoAlternarLista?.();
        break;
      case 'atividade':
        stream.aoAlternarAtividade?.();
        break;
      case 'ajuda':
        stream.aoAlternarAjuda?.();
        break;
      case 'uso':
        uso.alternar();
        break;
      case 'meudia':
        meudia.alternar();
        break;
      case 'config':
        config.alternar();
        break;
      case 'historico':
        historico.alternar();
        break;
      case 'replay':
        stream.aoAlternarReplay?.();
        break;
    }
  };
  const barra = montarBarra(aoTocarPainel);
  // Esc fecha as configurações (os outros diálogos são <dialog> modais e já fecham sozinhos com Esc).
  const aoTeclar = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    const cfg = document.querySelector<HTMLElement>('.painel-config:not([hidden])');
    cfg?.querySelector<HTMLButtonElement>('button.painel-botoes')?.click();
  };
  document.addEventListener('keydown', aoTeclar);
  return {
    atualizar(snap) {
      barra.atualizar(snap);
      uso.atualizar(snap.accounts, Date.now());
      avisos.atualizar(snap);
    },
    fecha() {
      document.removeEventListener('keydown', aoTeclar);
      barra.fecha();
      uso.fecha();
      meudia.fecha();
      historico.fecha();
      config.fecha();
      avisos.fecha();
    },
  };
}
