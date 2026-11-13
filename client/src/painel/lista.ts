// Adaptado de marmottajr/habblaud@faa1a01 client/src/ui/sidebar.ts, rows.ts, model.ts, format.ts (MIT)
// Lista de agentes (item 1 do painel): painel lateral esquerdo recolhível, agrupado por sala
// (projeto), com busca e filtro por conta. Refino "atividade ao vivo":
// - cada linha diz O QUE o agente faz agora (ícone + atividade na cor do estado); selo só
//   para exceção (precisa de você / ocioso / concluído);
// - bloco "Precisam de você" fixo no topo quando alguém espera uma resposta;
// - cabeçalho do projeto com a cor da fileira do prédio 3D e um ponto por agente;
// - DOM atualizado no lugar (linhas por id): o relógio de 1 s e os snapshots não roubam
//   foco, rolagem nem seleção.
// A lógica vive em agrupar.ts/tempo.ts/salas.ts (testada); aqui só o DOM.
// Fonte de verdade dos dados: shared/types.ts.
import type { AgentStatus, OfficeSnapshot, Provider } from '../../../shared/types';
import {
  agruparPorSala,
  buscar,
  contagemDeEstados,
  contagemPorConta,
  estadosDoGrupo,
  linhaDaAtividade,
  precisamDeVoce,
  coresDeExcecao,
  type GrupoSala,
  type ItemAgente,
} from './agrupar';
import { NOME_MAX, definirApelido, moverSala, nomeEfetivo, ordenarGrupos } from './salas';
import { texto } from './texto';
import { tempoDesde } from './tempo';
import { rostoSvg } from './rosto';
import { seloDoProvedor } from './provedores';
import { iconeDaAtividade } from './icone-atividade';
import { corCssDaSala } from '../cor-projeto';
import './painel.css';
import './lista-refino.css'; // refino da lista: só seletores .painel-lista (tokens --ia-* de identidade.css)

export interface OpcoesLista {
  /** Chama com o id do agente clicado — main.ts liga isso ao foco de câmera. */
  aoSelecionar: (id: string) => void;
  /**
   * Apelido/ordem de sala mudou (rename ↑↓ da lista): main.ts repinta os rótulos 3D
   * do prédio (o apelido vive só no localStorage — nunca chega ao servidor).
   */
  aoMudarSala?: () => void;
}

export interface ApiLista {
  /** Elemento raiz (position:fixed cuida do posicionamento; anexe onde quiser). */
  raiz: HTMLDivElement;
  /** Alimenta o painel com um snapshot novo; `agora` controla o relógio (padrão Date.now()). */
  atualizar(snapshot: Pick<OfficeSnapshot, 'rooms' | 'agents' | 'accounts'>, agora?: number): void;
  /**
   * Modo conteúdo (privacidade): true troca nomes/títulos por rótulos genéricos.
   * Padrão = desligado (mostra tudo — uso local).
   */
  setModoConteudo(ligado: boolean): void;
  /** Abre/fecha o painel (botão "Lista" da barra); devolve o estado novo. */
  alternar(): boolean;
  /** Guarda/restaura a seleção destacada (a câmera escolhe o agente por id). */
  definirSelecionado(id: string | null): void;
  fecha(): void;
}

/** Partes de uma linha de agente que mudam a cada pintura (o resto nasce uma vez). */
interface RefsLinha {
  btn: HTMLButtonElement;
  rosto: HTMLElement;
  ponto: HTMLElement;
  nome: HTMLElement;
  titulo: HTMLElement;
  conta: HTMLElement;
  contaLogo: HTMLElement;
  /** Ponto na cor da conta (só quando o provedor tem 2+ contas). */
  contaCor: HTMLElement;
  selo: HTMLElement;
  icone: HTMLElement;
  atividade: HTMLElement;
  tempo: HTMLElement;
  /** Assinaturas do último SVG pintado: só refaz o innerHTML quando o desenho muda. */
  assRosto: string;
  assIcone: string;
  assLogo: string;
}

/** Partes do bloco de uma sala (projeto). */
interface RefsSala {
  bloco: HTMLDivElement;
  rotulo: HTMLDivElement;
  marca: HTMLElement;
  nome: HTMLElement;
  contagem: HTMLElement;
  estados: HTMLElement;
  lapis: HTMLButtonElement;
  sobe: HTMLButtonElement;
  desce: HTMLButtonElement;
  itens: HTMLDivElement;
  linhas: Map<string, RefsLinha>;
  /** Vizinhos na lista visível (↑↓ desabilitam no primeiro/último) — atualizados a cada pintura. */
  vizinhoAcima?: string;
  vizinhoAbaixo?: string;
  /** Rename inline em curso: a pintura não toca no rótulo até salvar/cancelar. */
  renomeando: boolean;
  /** Assinatura dos pontos de estado (só recria os pontos quando muda). */
  assEstados: string;
}

/** Chip do filtro de contas. */
interface RefsChip {
  btn: HTMLButtonElement;
  nome: HTMLElement;
  n: HTMLElement;
}

/** Teto de pontos no cabeçalho do projeto; o resto vira "+n". */
const PONTOS_MAX = 8;

/**
 * Coloca `filhos` dentro de `pai` na ordem dada, movendo só o que está fora do lugar
 * (mover um nó tira o foco dele — então nada se move quando a ordem não mudou) e removendo
 * os que sobraram.
 */
function reconciliar(pai: HTMLElement, filhos: HTMLElement[]): void {
  filhos.forEach((el, i) => {
    if (pai.children[i] !== el) pai.insertBefore(el, pai.children[i] ?? null);
  });
  while (pai.children.length > filhos.length) pai.lastElementChild!.remove();
}

/** Monta o painel; o DOM é criado sozinho e anexado ao body. */
export function montarLista({ aoSelecionar, aoMudarSala }: OpcoesLista): ApiLista {
  const tl = texto.lista;
  // Estado do painel fora do DOM: busca, filtro de conta, seleção e modo conteúdo.
  let termo = '';
  let conta = '';
  let selecionado: string | null = null;
  let modoConteudo = false;
  let grupos: GrupoSala[] = [];
  let contas: OfficeSnapshot['accounts'] = [];
  let coresConta = new Map<string, string>();
  let ultimoRelogio = 0;
  let agoraAtual = Date.now();

  // ---------- esqueleto do DOM ----------
  const raiz = document.createElement('div');
  raiz.className = 'painel-lista painel';

  const cab = document.createElement('div');
  cab.className = 'painel-lista-cab';
  const titulo = document.createElement('h2');
  titulo.textContent = texto.tituloPainel;
  const spacer = document.createElement('span');
  spacer.className = 'grow';
  const btnRecolher = document.createElement('button');
  btnRecolher.type = 'button';
  btnRecolher.className = 'painel-botoes';
  btnRecolher.title = tl.ariaRecolher;
  btnRecolher.setAttribute('aria-label', tl.ariaRecolher);
  btnRecolher.textContent = '‹';
  cab.append(titulo, spacer, btnRecolher);

  // Busca + chips de conta (os chips só aparecem com 2+ contas com agentes — com uma, filtrar não tem o que separar).
  const filtros = document.createElement('div');
  filtros.className = 'painel-lista-filtros';
  const inputBusca = document.createElement('input');
  inputBusca.type = 'search';
  inputBusca.placeholder = texto.dicaBusca;
  inputBusca.setAttribute('aria-label', texto.dicaBusca);
  const chips = document.createElement('div');
  chips.className = 'painel-lista-contas';
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', tl.filtroContas);
  filtros.append(inputBusca, chips);

  // Bloco "Precisam de você": fora da rolagem, logo abaixo dos filtros — sempre à vista.
  const urgente = document.createElement('section');
  urgente.className = 'painel-lista-urgente';
  urgente.setAttribute('aria-labelledby', 'painel-lista-urgente-titulo');
  const urgenteCab = document.createElement('div');
  urgenteCab.className = 'painel-lista-urgente-cab';
  const urgenteTitulo = document.createElement('h3');
  urgenteTitulo.id = 'painel-lista-urgente-titulo';
  urgenteTitulo.textContent = tl.precisamDeVoce;
  const urgenteN = document.createElement('span');
  urgenteN.className = 'painel-lista-urgente-n';
  urgenteCab.append(urgenteTitulo, urgenteN);
  const urgenteItens = document.createElement('div');
  urgenteItens.className = 'painel-lista-urgente-itens';
  urgente.append(urgenteCab, urgenteItens);
  urgente.hidden = true;

  const corpo = document.createElement('div');
  corpo.className = 'painel-lista-corpo';
  // Estado vazio (nenhum agente / busca sem resultado): título + dica ou ação de saída.
  const vazio = document.createElement('div');
  vazio.className = 'painel-vazio';
  const vazioTitulo = document.createElement('p');
  vazioTitulo.className = 'painel-vazio-titulo';
  const vazioDica = document.createElement('p');
  vazioDica.className = 'painel-vazio-dica';
  const vazioLimpar = document.createElement('button');
  vazioLimpar.type = 'button';
  vazioLimpar.className = 'painel-vazio-acao';
  vazioLimpar.textContent = tl.limparFiltros;
  vazio.append(vazioTitulo, vazioDica, vazioLimpar);
  raiz.append(cab, filtros, urgente, corpo);

  // Gaveta mobile: ombrella (fundo escurecido) + botão flutuante para abrir. A raiz é fixa
  // e não tem irmãos no body, então a sincronização classe↔ombrélla fica em JS (abaixo).
  const ombrella = document.createElement('div');
  ombrella.className = 'painel-lista-ombrella';
  const btnFlutuante = document.createElement('button');
  btnFlutuante.type = 'button';
  btnFlutuante.className = 'painel-lista-flutuante painel';
  btnFlutuante.textContent = '☰';
  btnFlutuante.title = tl.ariaAbrir;
  btnFlutuante.setAttribute('aria-label', tl.ariaAbrir);
  document.body.append(raiz, ombrella, btnFlutuante);
  // Aberto em desktop; no mobile começa fechada (a gaveta é tratada pelo CSS) — antes
  // nascia aberta sempre e o celular abria com a gaveta + escurecido cobrindo o prédio.
  let aberto = !matchMedia('(max-width: 760px)').matches;
  function aplicarEstadoGaveta() {
    const emGaveta = matchMedia('(max-width: 760px)').matches;
    raiz.classList.toggle('fechada', !aberto);
    ombrella.classList.toggle('visivel', emGaveta && aberto);
    btnFlutuante.hidden = aberto; // painel recolhido: sobra o botão para trazê-lo de volta
    // A barra e o feed se alinham pelo espaço que sobra à direita da lista.
    document.documentElement.style.setProperty('--lista-w', aberto && !emGaveta ? 'var(--painel-largura, 320px)' : '0px');
  }
  aplicarEstadoGaveta();
  addEventListener('resize', aplicarEstadoGaveta);

  // ---------- linha de agente (pai, filhado ou urgente) ----------
  // Nasce uma vez por id e contexto; `atualizarLinha` só troca texto/classe/SVG que mudou.
  // Anatomia: [rosto + ponto] | linha 1: nome · título (a linha inteira: o título é o que identifica o trabalho)
  //                           | linha 2: [selo] [ícone] atividade ...... [logo (• cor da conta)] tempo
  function criarLinha(id: string): RefsLinha {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.id = id;

    // Avatar: rosto pixel-art (a MESMA pessoa do prédio 3D) + ponto de status no canto.
    const avatar = document.createElement('span');
    avatar.className = 'painel-agente-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    const rosto = document.createElement('span');
    rosto.className = 'painel-agente-rosto';
    const ponto = document.createElement('span');
    avatar.append(rosto, ponto);

    // Linha 1: nome + título da sessão, com a largura toda (a conta desceu para a linha 2).
    const l1 = document.createElement('span');
    l1.className = 'painel-agente-linha1';
    const nome = document.createElement('span');
    nome.className = 'painel-agente-nome';
    const titulo = document.createElement('span');
    titulo.className = 'painel-agente-titulo';
    const contaEl = document.createElement('span');
    contaEl.className = 'painel-agente-conta';
    const contaLogo = document.createElement('span');
    contaLogo.className = 'painel-agente-conta-logo';
    const contaCor = document.createElement('span');
    contaCor.className = 'painel-agente-conta-cor';
    contaEl.append(contaLogo, contaCor);
    l1.append(nome, titulo);

    // Linha 2: selo de exceção + ícone + atividade ao vivo; à direita o logo da conta e o tempo.
    const l2 = document.createElement('span');
    l2.className = 'painel-agente-linha2';
    const selo = document.createElement('span');
    selo.className = 'painel-agente-selo';
    const icone = document.createElement('span');
    icone.className = 'painel-agente-icone';
    icone.setAttribute('aria-hidden', 'true');
    const atividade = document.createElement('span');
    atividade.className = 'painel-agente-atividade';
    const tempo = document.createElement('span');
    tempo.className = 'painel-agente-quando';
    l2.append(selo, icone, atividade, contaEl, tempo);

    const corpoAg = document.createElement('span');
    corpoAg.className = 'painel-agente-corpo';
    corpoAg.append(l1, l2);
    btn.append(avatar, corpoAg);
    btn.addEventListener('click', () => {
      selecionado = id;
      aoSelecionar(id);
      pintar(agoraAtual);
    });
    return { btn, rosto, ponto, nome, titulo, conta: contaEl, contaLogo, contaCor, selo, icone, atividade, tempo, assRosto: '', assIcone: '', assLogo: '' };
  }

  /**
   * Repinta uma linha. `filho` = subagente aninhado (mais compacto); `salaNome` presente =
   * linha do bloco "Precisam de você" (o projeto toma o lugar do título, com a cor do projeto).
   */
  function atualizarLinha(r: RefsLinha, a: ItemAgente, agora: number, filho: boolean, sala?: { nome: string; cor: string }): void {
    const cls = `painel-agente status-${a.status}${filho ? ' painel-agente-filho' : ''}${sala ? ' painel-agente-urgente' : ''}${a.id === selecionado ? ' selecionado' : ''}`;
    if (r.btn.className !== cls) r.btn.className = cls;
    r.ponto.className = `painel-agente-ponto status-${a.status}`;

    // Rosto: SVG determinístico (rostoSvg) — só refaz quando a aparência ou o modo muda.
    const assRosto = modoConteudo ? 'oculto' : `${a.seed}|${a.look ?? ''}|${JSON.stringify(a.partes ?? null)}`;
    if (assRosto !== r.assRosto) {
      r.assRosto = assRosto;
      if (modoConteudo) r.rosto.textContent = '·'; // placeholder neutro (nunca dado do agente)
      else r.rosto.innerHTML = rostoSvg(a.seed, a.partes, a.look);
      r.rosto.classList.toggle('oculto', modoConteudo);
    }

    // Linha 1: nome (genérico no modo conteúdo) + título ou projeto.
    const nome = modoConteudo ? (filho ? texto.generico.subagente : texto.generico.principal) : a.nome;
    if (r.nome.textContent !== nome) r.nome.textContent = nome;
    const tit = sala ? sala.nome : modoConteudo ? '' : (a.titulo ?? a.papel ?? '');
    if (r.titulo.textContent !== tit) r.titulo.textContent = tit;
    r.titulo.hidden = !tit;
    r.titulo.title = tit; // o título corta em "…" a 320 px: o texto inteiro fica na dica
    if (sala) r.titulo.style.setProperty('--sala-c', sala.cor);

    // Conta: logo do provedor em cinza (+ ponto na cor da conta só quando ela não é a dominante do provedor);
    // nenhum texto na linha — a conta por extenso fica no title (o nome curto continua nos chips do filtro).
    const prov: Provider = a.provedor ?? 'claude';
    if (r.assLogo !== prov) {
      r.assLogo = prov;
      r.contaLogo.innerHTML = seloDoProvedor(prov);
    }
    const corConta = coresConta.get(a.conta) ?? '';
    r.contaCor.style.setProperty('--conta-c', corConta);
    r.contaCor.hidden = !corConta;
    r.conta.title = `${texto.provedor[prov]} · ${a.contaRotulo}`;

    // Linha 2: atividade ao vivo; no modo conteúdo o texto (pode citar arquivo) vira o nome do estado.
    const linha = linhaDaAtividade(a);
    const seloTxt = linha.selo ? tl.selos[a.status as 'waiting' | 'idle' | 'done' | 'offline'] ?? '' : '';
    // "Precisa de você" nunca vira selo na linha: quem espera já está no bloco do topo (o título
    // do bloco diz), e na linha do projeto o ponto vermelho + a frase bastam — o selo só cortava a frase.
    const mostraSelo = !!seloTxt && a.status !== 'waiting';
    if (r.selo.textContent !== seloTxt) r.selo.textContent = seloTxt;
    r.selo.hidden = !mostraSelo;
    r.selo.classList.toggle('forte', linha.selo === 'forte');
    const txt = modoConteudo && linha.texto ? tl.estados[a.status] : linha.texto;
    if (r.atividade.textContent !== txt) r.atividade.textContent = txt;
    r.atividade.hidden = !txt;
    const assIcone = txt && linha.icone ? linha.icone : '';
    if (assIcone !== r.assIcone) {
      r.assIcone = assIcone;
      r.icone.innerHTML = assIcone ? iconeDaAtividade(linha.icone!) : '';
    }
    r.icone.hidden = !assIcone;

    // Tempo no estado, à direita, números tabulares (sem o ponto solto de antes).
    const quando = tempoDesde(a.statusDesde, agora);
    if (r.tempo.textContent !== quando) r.tempo.textContent = quando;
    r.tempo.title = `${tl.noEstadoHa} ${quando}`;

    // Dica da linha: título completo (a linha corta com reticências) e modelo.
    const dica = [modoConteudo ? '' : a.titulo, a.modelo].filter(Boolean).join(' · ');
    if (r.btn.title !== dica) r.btn.title = dica;
  }

  // ---------- bloco de sala (projeto) ----------
  const salasDom = new Map<string, RefsSala>();

  function botaoSala(classe: string, simbolo: string, dica: string, aoClicar: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `painel-sala-acao ${classe}`;
    b.title = dica;
    b.setAttribute('aria-label', dica);
    b.textContent = simbolo;
    b.addEventListener('click', aoClicar);
    return b;
  }

  // Cabeçalho: [marca na cor do projeto] nome · contagem ........ pontos de estado [✎ ↑ ↓ no hover].
  // O caminho do projeto saiu da linha e foi para a dica (title) do rótulo.
  function criarSala(g: GrupoSala): RefsSala {
    const bloco = document.createElement('div');
    bloco.className = 'painel-sala';
    bloco.dataset.sala = g.id;
    const rotulo = document.createElement('div');
    rotulo.className = 'painel-sala-rotulo';
    const marca = document.createElement('span');
    marca.className = 'painel-sala-marca';
    marca.setAttribute('aria-hidden', 'true');
    const nome = document.createElement('span');
    nome.className = 'painel-sala-nome';
    const contagem = document.createElement('span');
    contagem.className = 'painel-sala-contagem';
    const estados = document.createElement('span');
    estados.className = 'painel-sala-estados';
    estados.setAttribute('role', 'img');
    const acoes = document.createElement('span');
    acoes.className = 'painel-sala-acoes';
    const itens = document.createElement('div');
    itens.className = 'painel-sala-itens';
    const r: RefsSala = {
      bloco, rotulo, marca, nome, contagem, estados, itens,
      lapis: botaoSala('painel-sala-lapis', '✎', texto.salas.dicaLapis, () => renomear(g.id)),
      sobe: botaoSala('', '↑', texto.salas.dicaSobe, () => mover(g.id, false)),
      desce: botaoSala('', '↓', texto.salas.dicaDesce, () => mover(g.id, true)),
      linhas: new Map(),
      renomeando: false,
      assEstados: '',
    };
    acoes.append(r.lapis, r.sobe, r.desce);
    rotulo.append(marca, nome, contagem, estados, acoes);
    bloco.append(rotulo, itens);
    return r;
  }

  // Reordenar grupos: a gravação em salas.ts usa a lista completa (grupos), então
  // reordenar com filtro ativo continua determinístico.
  function mover(id: string, paraBaixo: boolean): void {
    const r = salasDom.get(id);
    const ref = paraBaixo ? r?.vizinhoAbaixo : r?.vizinhoAcima;
    if (!ref || !moverSala(grupos.map((x) => x.id), id, ref, paraBaixo)) return;
    aoMudarSala?.();
    pintar(agoraAtual);
    // O botão continua no DOM (o bloco só mudou de lugar): o foco volta para ele.
    (paraBaixo ? r!.desce : r!.sobe).focus();
  }

  // Renomear inline (Enter salva, Esc cancela, blur salva, vazio volta ao nome do snapshot —
  // adaptado do RoomRenamer do projeto de origem, sem fetch: o apelido vive só em localStorage).
  function renomear(id: string): void {
    const r = salasDom.get(id);
    const g = grupos.find((x) => x.id === id);
    if (!r || !g) return;
    r.renomeando = true;
    let fim = false;
    const campo = document.createElement('input');
    campo.className = 'painel-sala-campo';
    campo.maxLength = NOME_MAX;
    campo.spellcheck = false;
    campo.value = nomeEfetivo(g.id, g.nome);
    campo.title = texto.salas.dicaRenomear; // tooltip: Enter salva · Esc cancela · vazio volta ao nome
    campo.setAttribute('aria-label', texto.salas.ariaCampo);
    const encerrar = (salvar: boolean) => {
      if (fim) return;
      fim = true;
      if (salvar) {
        definirApelido(g.id, campo.value); // vazio apaga → volta ao nome do snapshot
        aoMudarSala?.();
      }
      r.renomeando = false;
      campo.replaceWith(r.nome);
      r.rotulo.classList.remove('editando');
      pintar(agoraAtual);
      r.lapis.focus();
    };
    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        encerrar(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        encerrar(false);
      }
    });
    campo.addEventListener('blur', () => encerrar(true));
    r.rotulo.classList.add('editando');
    r.nome.replaceWith(campo);
    campo.focus();
    campo.select();
  }

  function atualizarSala(r: RefsSala, g: GrupoSala, indice: number, ordem: string[], agora: number): void {
    const cor = corCssDaSala(g.id, g.lancador); // a mesma cor da fileira e do crachá no prédio
    r.bloco.style.setProperty('--sala-c', cor);
    r.vizinhoAcima = indice > 0 ? ordem[indice - 1] : undefined;
    r.vizinhoAbaixo = indice < ordem.length - 1 ? ordem[indice + 1] : undefined;
    r.sobe.disabled = !r.vizinhoAcima;
    r.desce.disabled = !r.vizinhoAbaixo;

    if (!r.renomeando) {
      const nome = nomeEfetivo(g.id, g.nome);
      if (r.nome.textContent !== nome) r.nome.textContent = nome;
      r.rotulo.title = g.path; // o caminho completo mora na dica
    }
    // Contagem e pontos: todos os agentes do grupo visível (principais + subagentes).
    const est = estadosDoGrupo(g);
    const total = est.length;
    r.contagem.textContent = String(total);
    r.contagem.title = `${total} ${total === 1 ? tl.agente : tl.agentes}`;
    const ass = est.join(',');
    if (ass !== r.assEstados) {
      r.assEstados = ass;
      const pontos = est.slice(0, PONTOS_MAX).map((s) => {
        const p = document.createElement('span');
        p.className = `painel-sala-ponto status-${s}`;
        return p;
      });
      if (est.length > PONTOS_MAX) {
        const mais = document.createElement('span');
        mais.className = 'painel-sala-mais';
        mais.textContent = `+${est.length - PONTOS_MAX}`;
        pontos.push(mais);
      }
      r.estados.replaceChildren(...pontos);
      const leitura = contagemDeEstados(est).map(([s, n]) => `${n} ${tl.estados[s as AgentStatus]}`).join(', ');
      r.estados.setAttribute('aria-label', leitura);
      r.estados.title = leitura;
    }

    // Linhas: principal seguido dos seus subagentes, na ordem de agrupar.ts.
    const vistos = new Set<string>();
    const els: HTMLElement[] = [];
    const linha = (a: ItemAgente, filho: boolean) => {
      vistos.add(a.id);
      let l = r.linhas.get(a.id);
      if (!l) {
        l = criarLinha(a.id);
        r.linhas.set(a.id, l);
      }
      atualizarLinha(l, a, agora, filho);
      els.push(l.btn);
    };
    for (const a of g.agentes) {
      linha(a, false);
      for (const f of a.filhados) linha(f, true);
    }
    for (const id of [...r.linhas.keys()]) if (!vistos.has(id)) r.linhas.delete(id);
    reconciliar(r.itens, els);
  }

  // ---------- chips de conta ----------
  const chipsDom = new Map<string, RefsChip>();
  function chip(id: string, provedor: Provider | null): RefsChip {
    let c = chipsDom.get(id);
    if (c) return c;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'painel-lista-conta';
    if (provedor) {
      const logo = document.createElement('span');
      logo.className = 'painel-lista-conta-logo';
      logo.setAttribute('aria-hidden', 'true');
      logo.innerHTML = seloDoProvedor(provedor);
      btn.append(logo);
    }
    const nome = document.createElement('span');
    nome.className = 'painel-lista-conta-nome';
    const n = document.createElement('span');
    n.className = 'painel-lista-conta-n';
    btn.append(nome, n);
    btn.addEventListener('click', () => {
      conta = conta === id || id === '' ? '' : id; // clicar no chip ativo volta para "Todas"
      pintar(agoraAtual);
    });
    c = { btn, nome, n };
    chipsDom.set(id, c);
    return c;
  }

  function pintarChips(): void {
    const porConta = contagemPorConta(grupos);
    // Só contas com agente agora (ou a filtrada, para dar como desfazer).
    const comAgente = contas.filter((c) => (porConta.get(c.id) ?? 0) > 0 || c.id === conta);
    chips.hidden = comAgente.length < 2 && !conta;
    if (chips.hidden) return;
    const total = [...porConta.values()].reduce((s, n) => s + n, 0);
    const els: HTMLElement[] = [];
    const todas = chip('', null);
    todas.nome.textContent = tl.todas;
    todas.n.textContent = String(total);
    todas.btn.setAttribute('aria-pressed', String(!conta));
    els.push(todas.btn);
    for (const c of comAgente) {
      const ch = chip(c.id, c.provider ?? 'claude');
      ch.nome.textContent = c.name;
      const n = porConta.get(c.id) ?? 0;
      ch.n.textContent = String(n);
      ch.btn.setAttribute('aria-pressed', String(conta === c.id));
      ch.btn.title = `${texto.provedor[c.provider ?? 'claude']} · ${c.name} · ${n} ${n === 1 ? tl.agente : tl.agentes}`;
      els.push(ch.btn);
    }
    const ids = new Set(['', ...comAgente.map((c) => c.id)]);
    for (const id of [...chipsDom.keys()]) if (!ids.has(id)) chipsDom.delete(id);
    reconciliar(chips, els);
  }

  // ---------- bloco "Precisam de você" ----------
  const urgentesDom = new Map<string, RefsLinha>();
  function pintarUrgentes(visiveis: GrupoSala[], agora: number): void {
    const lista = precisamDeVoce(visiveis);
    urgente.hidden = lista.length === 0;
    urgenteN.textContent = String(lista.length);
    // Botão flutuante (lista recolhida): ponto vermelho + rótulo com a contagem.
    btnFlutuante.classList.toggle('urgente', lista.length > 0);
    const rotFlut = lista.length ? tl.ariaAbrirUrgente.replace('{0}', String(lista.length)) : tl.ariaAbrir;
    btnFlutuante.setAttribute('aria-label', rotFlut);
    btnFlutuante.title = rotFlut;
    const els: HTMLElement[] = [];
    const vistos = new Set<string>();
    for (const u of lista) {
      vistos.add(u.item.id);
      let l = urgentesDom.get(u.item.id);
      if (!l) {
        l = criarLinha(u.item.id);
        urgentesDom.set(u.item.id, l);
      }
      atualizarLinha(l, u.item, agora, false, { nome: nomeEfetivo(u.salaId, u.salaNome), cor: corCssDaSala(u.salaId, u.lancador) });
      els.push(l.btn);
    }
    for (const id of [...urgentesDom.keys()]) if (!vistos.has(id)) urgentesDom.delete(id);
    reconciliar(urgenteItens, els);
  }

  // ---------- render ----------
  function pintar(agora: number) {
    agoraAtual = agora;
    pintarChips();
    const visiveis = grupos.length ? buscar(grupos, termo, conta) : [];
    pintarUrgentes(visiveis, agora);

    // Sem agentes (antes de todo snapshot ou escritório vazio) ou busca/filtro sem resultado.
    if (!visiveis.length) {
      const semNenhum = !grupos.length;
      vazioTitulo.textContent = semNenhum ? tl.semAgentes : tl.semResultados;
      vazioDica.textContent = semNenhum ? tl.semAgentesDica : '';
      vazioDica.hidden = !semNenhum;
      vazioLimpar.hidden = semNenhum;
      reconciliar(corpo, [vazio]);
      return;
    }
    // Grupos na ordem guardada (salas.ts); ids que nunca foram ordenados vão para o
    // fim, na ordem de chegada — a ordem do snapshot é o fallback.
    const porId = new Map(visiveis.map((g) => [g.id, g] as const));
    const ordem = ordenarGrupos(visiveis.map((g) => g.id));
    const blocos: HTMLElement[] = [];
    for (const [i, id] of ordem.entries()) {
      let r = salasDom.get(id);
      if (!r) {
        r = criarSala(porId.get(id)!);
        salasDom.set(id, r);
      }
      atualizarSala(r, porId.get(id)!, i, ordem, agora);
      blocos.push(r.bloco);
    }
    for (const id of [...salasDom.keys()]) if (!porId.has(id)) salasDom.delete(id);
    reconciliar(corpo, blocos);
  }

  // ---------- eventos ----------
  inputBusca.addEventListener('input', () => {
    termo = inputBusca.value;
    pintar(agoraAtual);
  });
  vazioLimpar.addEventListener('click', () => {
    termo = '';
    conta = '';
    inputBusca.value = '';
    pintar(agoraAtual);
    inputBusca.focus();
  });
  const alternar = () => {
    aberto = !aberto;
    aplicarEstadoGaveta();
    return aberto;
  };
  btnRecolher.addEventListener('click', alternar);
  btnFlutuante.addEventListener('click', () => {
    aberto = true;
    aplicarEstadoGaveta();
  });
  ombrella.addEventListener('click', () => {
    aberto = false;
    aplicarEstadoGaveta();
  });

  // Relógio do "no status": repinta 1×/s apenas com o painel aberto e com agentes.
  // A pintura é incremental (só texto que mudou), então não rouba foco nem hover.
  const timer = setInterval(() => {
    if (raiz.classList.contains('fechada') || !grupos.length) return;
    const agora = Date.now();
    if (Math.abs(ultimoRelogio - agora) > 60_000) return; // replay: o relógio é o do quadro, não o de parede
    if (agora - ultimoRelogio >= 1000) {
      ultimoRelogio = agora;
      pintar(agora);
    }
  }, 1000);

  return {
    raiz,
    alternar,
    atualizar(snapshot, agora = Date.now()) {
      ultimoRelogio = agora;
      grupos = agruparPorSala({ rooms: snapshot.rooms, agents: snapshot.agents, accounts: snapshot.accounts });
      contas = snapshot.accounts ?? [];
      coresConta = coresDeExcecao(contas, contagemPorConta(grupos));
      // Conta filtrada que sumiu do snapshot: volta para "todas".
      if (conta && !contas.some((c) => c.id === conta)) conta = '';
      pintar(agora);
    },
    setModoConteudo(ligado) {
      modoConteudo = ligado;
      pintar(agoraAtual);
    },
    definirSelecionado(id) {
      selecionado = id;
      pintar(agoraAtual);
    },
    fecha() {
      clearInterval(timer);
      raiz.remove();
      ombrella.remove();
      btnFlutuante.remove();
    },
  };
}
