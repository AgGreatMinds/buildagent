// Lógica pura do tempo "no status" da lista: "agora", "2 m", "1 h 4 m". Sem DOM.
// O relógio nunca entra aqui — `agora` é parâmetro, para o teste controlar.

/**
 * Durações em PT-BR, curto. Regras:
 * - < 15 s → "agora";
 * - 15 s – 59 m → minutos, arredondados para cima (59 m 30 s → "60 m");
 * - 1 h ou mais → "X h Y m" quando sobram minutos; "X h" puro sem resto.
 * Diferença negativa (statusSince no futuro — relógio desalinhado) → "agora".
 */
export function tempoDesde(epoch: number, agora: number): string {
  const seg = Math.max(0, Math.floor((agora - epoch) / 1000));
  if (seg < 15) return 'agora';
  const min = Math.ceil(seg / 60);
  if (min < 60) return `${min} m`;
  const h = Math.floor(min / 60);
  const resto = min - h * 60;
  return resto ? `${h} h ${resto} m` : `${h} h`;
}
