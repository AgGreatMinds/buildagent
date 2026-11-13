// Cor de identidade de cada projeto: a MESMA no prédio 3D (cordão do crachá e fileira de mesas)
// e no painel (trilho e marca do cabeçalho da lista). Puro, sem three.js nem DOM: o 3D
// (interior.ts, people.ts, predio.ts) e o painel (painel/lista.ts) importam daqui, e os testes
// rodam em Node sem carregar a cena.

/** Prefixo da fileira compartilhada por um app de agentes (ex.: "app:openbot"): main.ts usa o mesmo. */
export const FILEIRA_APP = 'app:';

/** Hash FNV-1a de 32 bits: texto → semente estável (nome de pessoa, id de sala...). */
export function semente(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Paleta das fileiras de projeto (hex numérico do three.js): 10 matizes separados por 23° ou
 * mais — limão 67°, lima 96°, verde 128°, esmeralda 156°, turquesa 180°, azul 209°, anil 232°,
 * violeta 258°, orquídea 287°, magenta 327°. Sem vermelho, laranja nem âmbar: esses tons
 * pertencem a "precisa de você", "trabalhando" e "atenção" no painel. Todas passam de 1,7:1
 * sobre o piso claro do 3D e de 5:1 sobre o painel escuro.
 */
export const CORES_PROJETO = [0xa8b82a, 0x6fbf3a, 0x3bb04a, 0x1fa971, 0x3fb8b8, 0x4f97db, 0x6a7be6, 0x9473e0, 0xbd63d6, 0xd94f9c];

/** Cor "crua" do hash, sem o registro: o ponto de partida de `corDaChave` (e o que ela devolve do 11º projeto em diante). */
export function corDoProjeto(semente: number): number {
  return CORES_PROJETO[semente % CORES_PROJETO.length];
}

// ---------- Registro de cores da sessão: projeto não repete cor enquanto houver cor livre ----------
// Chave da fileira → índice na paleta. Vive até a página recarregar: uma chave atribuída nunca
// troca de cor (nem quando outro projeto sai), então trilho da lista, fileira e crachá no 3D
// ficam iguais o tempo todo — todos perguntam aqui pela mesma chave.
const registro = new Map<string, number>();

/** Índice para uma chave nova: o do hash; se outra chave já o tem, o próximo livre (volta ao início); tudo ocupado → o do hash. */
function indiceParaChaveNova(chave: string): number {
  const n = CORES_PROJETO.length;
  const doHash = semente(chave) % n;
  const ocupados = new Set(registro.values());
  for (let passo = 0; passo < n; passo++) {
    const i = (doHash + passo) % n; // sondagem linear circular
    if (!ocupados.has(i)) return i;
  }
  return doHash; // as 10 já têm dono: a partir do 11º projeto a cor repete (pelo hash)
}

/** Cor do projeto pela chave da fileira (`chaveDaFileira`): atribui na primeira consulta e guarda até o fim da sessão. */
export function corDaChave(chave: string): number {
  let i = registro.get(chave);
  if (i === undefined) {
    i = indiceParaChaveNova(chave);
    registro.set(chave, i);
  }
  return CORES_PROJETO[i];
}

/**
 * Registra as chaves ainda sem cor em ordem alfabética — chamado quando o snapshot chega, antes
 * da lista e do prédio pintarem. Assim a cor não depende de quem pergunta primeiro: o mesmo
 * conjunto de projetos dá as mesmas cores a cada recarga da página.
 */
export function reservarCores(chaves: string[]): void {
  for (const chave of [...new Set(chaves)].sort()) corDaChave(chave);
}

/** Zera o registro (só para os testes não vazarem estado entre si). */
export function limparCoresParaTeste(): void {
  registro.clear();
}

/**
 * Chave da fileira de uma sala — a mesma regra de main.ts (`fileiraDaSala`): salas abertas por
 * um app de agentes sentam juntas na fileira do app; as demais usam o próprio id.
 */
export function chaveDaFileira(salaId: string, lancador?: string): string {
  return lancador ? FILEIRA_APP + lancador : salaId;
}

/** Cor do projeto em CSS (`#rrggbb`) para a sala: a mesma que o prédio pinta na fileira e no crachá (mesmo registro, mesma chave). */
export function corCssDaSala(salaId: string, lancador?: string): string {
  return `#${corDaChave(chaveDaFileira(salaId, lancador)).toString(16).padStart(6, '0')}`;
}
