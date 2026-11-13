// Posturas da vida social — alvos de pose puros.
// Sem relógio global nem alocação: `t` e `fase` já vêm prontos, `saida` é reutilizada
// pelo chamador (Pessoa.atualizar) e é preenchida no lugar a cada passo.

// Alvos da tabela 4.4. Os nomes batem 1:1 com os campos que Pessoa.atualizar amortiza
// no bloco de pose (client/src/people.ts); campo que a postura não sobrepõe fica no valor de pé.
export interface AlvosPostura {
  hipsY: number;
  hipsZ: number;
  spineX: number;
  spineZ: number;
  headX: number;
  leftShoulderX: number;
  rightShoulderX: number;
  leftShoulderY: number;
  rightShoulderY: number;
  leftShoulderZ: number;
  rightShoulderZ: number;
  leftElbowX: number;
  rightElbowX: number;
  leftHipX: number;
  rightHipX: number;
  leftKneeX: number;
  rightKneeX: number;
}

// `fase` = fase própria da pessoa; `lado` = lado do par (ping-pong: 0 oeste, 1 leste).
export type NomePostura = 'sentado' | 'assistindo' | 'comemorar' | 'fliperama' | 'pingpong' | 'ler';

// fracionário em [0,1) — usado na janela de rebatida do ping-pong.
const frac = (x: number): number => x - Math.floor(x);

// Valor de pé: os alvos neutros de Pessoa.atualizar sem andar (respiração derivada de t/fase,
// mesmo amortecimento que a pessoa já faz — postura é só o que sobrepõe).
function valorDePe(saida: AlvosPostura, t: number, fase: number): void {
  const resp = Math.sin(t * 1.35 + fase);
  saida.hipsY = 0.8 + resp * 0.004;
  saida.hipsZ = 0;
  saida.spineX = resp * 0.012;
  saida.spineZ = Math.sin(t * 0.42 + fase) * 0.018;
  saida.headX = -resp * 0.01;
  saida.leftShoulderX = 0.04 + resp * 0.025;
  saida.rightShoulderX = 0.04 - resp * 0.025;
  saida.leftShoulderY = 0;
  saida.rightShoulderY = 0;
  saida.leftShoulderZ = -0.075;
  saida.rightShoulderZ = 0.075;
  saida.leftElbowX = -0.22 - resp * 0.02;
  saida.rightElbowX = -0.22 + resp * 0.02;
  saida.leftHipX = 0;
  saida.rightHipX = 0;
  saida.leftKneeX = 0;
  saida.rightKneeX = 0;
}

// Base sentada (sofá/poltrona): coxas e joelhos travados, mãos no colo.
function sentado(saida: AlvosPostura): void {
  saida.hipsY = 0.55;
  saida.hipsZ = 0.1;
  saida.spineX = -0.05;
  saida.headX = 0;
  saida.leftHipX = -1.32;
  saida.rightHipX = -1.32;
  saida.leftKneeX = 1.32;
  saida.rightKneeX = 1.32;
  saida.leftShoulderX = -0.25;
  saida.rightShoulderX = -0.25;
  saida.leftElbowX = -0.5;
  saida.rightElbowX = -0.5;
}

// Preenche `saida` com os alvos da postura `nome` (null = volta ao valor de pé).
// Puro: só sin/frac sobre `t` e `fase` — sem Date.now, Math.random nem aloc.
export function posturaAlvos(
  saida: AlvosPostura,
  nome: NomePostura | null,
  t: number,
  fase: number,
  lado = 0,
): AlvosPostura {
  valorDePe(saida, t, fase);
  switch (nome) {
    case 'sentado':
      sentado(saida);
      break;
    case 'assistindo':
      // Mesma base do sentado, cabeça levemente inclinada + balanço suave (valores de partida, ajustados a olho).
      sentado(saida);
      saida.headX = -0.05 + Math.sin(t * 0.6 + fase) * 0.03;
      break;
    case 'comemorar':
      // Sentado com braços levantados e pulso do quadril no GOL.
      sentado(saida);
      saida.leftShoulderX = -2.8;
      saida.rightShoulderX = -2.8;
      saida.leftElbowX = -0.3;
      saida.rightElbowX = -0.3;
      saida.hipsY = 0.55 + 0.03 * Math.sin(t * 14);
      break;
    case 'fliperama':
      // De pé, tronco adiantado, ombros abertos e cotovelos apertando botões.
      saida.spineX = 0.12;
      saida.headX = -0.1;
      saida.leftShoulderX = -0.9;
      saida.rightShoulderX = -0.9;
      saida.leftShoulderY = 0.25;
      saida.rightShoulderY = -0.25;
      saida.leftElbowX = -1.1 + 0.08 * Math.sin(t * 11 + fase);
      saida.rightElbowX = -1.1 + 0.08 * Math.sin(t * 11 + fase);
      break;
    case 'pingpong':
      // De pé baixo, joelhos flexionados, braço esquerdo estacionário; o direito rebate em janela.
      saida.spineX = 0.2;
      saida.hipsY = 0.76;
      saida.leftKneeX = 0.3;
      saida.rightKneeX = 0.3;
      saida.leftShoulderX = -0.5;
      saida.leftElbowX = -0.8;
      // Janela de rebatida deslocada .5 por lado: os dois lados batem em instantes diferentes.
      const f = frac(t / 1.1 + 0.5 * lado);
      if (f < 0.22) saida.rightShoulderX = -0.9 - 0.8 * Math.sin((Math.PI * f) / 0.22);
      break;
    case 'ler':
      // De pé diante da estante, cabeça baixada folheando.
      saida.spineX = 0.1;
      saida.headX = 0.25;
      saida.leftShoulderX = -0.7;
      saida.rightShoulderX = -0.7;
      saida.leftElbowX = -1.3;
      saida.rightElbowX = -1.3;
      break;
    default:
      break; // null: ficou só o valor de pé
  }
  return saida;
}
