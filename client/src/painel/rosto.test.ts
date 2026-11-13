// Testes do rosto pixel-art da lista (Frente B): determinismo por seed,
// fidelidade ao boneco 3D (mesma seed = mesma pele/cabelo/roupa) e as peças
// do snapshot (AppearanceParts) por cima. Puro — roda em node, sem DOM.
import { describe, expect, it } from 'vitest';
import { CLOTHES, HAIR, SKIN_TONES, aparencia } from '../people';
import { HAIR_STYLES, TOP_STYLES } from '../../../shared/appearance';
import { LADO, corHex, gradeDoRosto, paletaDoRosto, riscarMeio, rostoSvg, siglaCont } from './rosto';

describe('rostoSvg', () => {
  it('é determinístico: a mesma seed gera o mesmo SVG, com ou sem partes', () => {
    expect(rostoSvg(42)).toBe(rostoSvg(42));
    const partes = { top: '#315f57', facialHair: 'beard' } as const;
    expect(rostoSvg(42, partes)).toBe(rostoSvg(42, partes));
  });

  it('gera rostos distintos para sementes diferentes (variedade igual ao prédio)', () => {
    const vistos = new Set(Array.from({ length: 40 }, (_, i) => rostoSvg(1000 + i)));
    expect(vistos.size).toBe(40);
  });

  it('a pele do rosto bate com SKIN_TONES da seed (mesma pessoa do prédio 3D)', () => {
    for (const seed of [1, 7, 42, 99, 12345]) {
      const esperada = corHex(SKIN_TONES[aparencia(seed).skin]).toLowerCase();
      expect(paletaDoRosto(seed).pele).toBe(esperada);
      // A pele aparece no SVG (cor da face), não some.
      expect(rostoSvg(seed)).toContain(esperada);
    }
  });

  it('cabelo e roupa vêm das mesmas listas do boneco 3D (HAIR/CLOTHES)', () => {
    for (const seed of [3, 9, 55]) {
      const look = aparencia(seed);
      expect(paletaDoRosto(seed).cabelo).toBe(corHex(HAIR[look.hairColor]).toLowerCase());
      expect(paletaDoRosto(seed).roupa).toBe(corHex(CLOTHES[look.color]).toLowerCase());
    }
  });

  it('peças do snapshot sobrepõem a seed (pele/cabelo/roupa)', () => {
    const base = paletaDoRosto(3, {});
    const partes = { skin: '#6b4129', hair: '#d3c9b1', top: '#e9e5db' };
    const com = paletaDoRosto(3, partes);
    expect(com.pele).toBe('#6b4129');
    expect(com.cabelo).toBe('#d3c9b1');
    expect(com.roupa).toBe('#e9e5db');
    expect(com).not.toEqual(base);
    expect(rostoSvg(3, partes)).toContain('#e9e5db'); // a gola do SVG usa a peça
  });

  it('óculos do snapshot aparecem; "none" remove os da seed', () => {
    const com = gradeDoRosto(3, { accessory: 'glasses' });
    const sem = gradeDoRosto(3, { accessory: 'none' });
    const pele = paletaDoRosto(3).pele;
    // Aro de grau nas laterais do olho esquerdo (x=4, y=7) — na pele quando não há óculos.
    expect(com[7][4]).not.toBe(pele);
    expect(sem[7][4]).toBe(pele);
    expect(rostoSvg(3, { accessory: 'sunglasses' })).toContain('#252b32'); // armação escura
    expect(rostoSvg(3, { accessory: 'none' })).not.toContain('#252b32');
  });

  it('cada penteado e cada gola do editor muda o desenho (nada é ignorado)', () => {
    const base = { accessory: 'none', facialHair: 'none' } as const;
    const porPenteado = new Set(HAIR_STYLES.map((hairStyle) => rostoSvg(21, { ...base, hairStyle })));
    expect(porPenteado.size).toBe(HAIR_STYLES.length);
    const porGola = new Set(TOP_STYLES.map((topStyle) => rostoSvg(21, { ...base, topStyle })));
    expect(porGola.size).toBe(TOP_STYLES.length);
  });

  it('chave desconhecida no editor (inclusive herdada, ex.: "constructor") cai na seed', () => {
    const estranha = { hairStyle: 'constructor', topStyle: '__proto__' } as unknown as Parameters<typeof rostoSvg>[1];
    expect(rostoSvg(21, estranha)).toBe(rostoSvg(21));
  });

  it('rosto legível: olhos com brilho, boca e contorno sempre presentes', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 42, 99]) {
      const g = gradeDoRosto(seed);
      const p = paletaDoRosto(seed);
      expect(g[7][5]).toBe('#f6f3ee'); // brilho do olho esquerdo (sem óculos escuros na seed)
      expect(g[8][6]).toBe(p.olho);
      expect(g[10][7]).toBe(p.boca);
      expect(g.flat()).toContain('#0e0b0a'); // contorno do sprite
      expect(g[15].every((c) => c !== '')).toBe(true); // ombros sangram pela base
    }
  });

  it('o SVG é 16×16 com pixels nítidos e namespace (DOMParser do detalhe)', () => {
    const svg = rostoSvg(5);
    expect(LADO).toBe(16);
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('viewBox="0 0 16 16"');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    for (const m of svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)"/g)) {
      const x = Number(m[1]);
      const y = Number(m[2]);
      const w = Number(m[3]);
      expect(x + w).toBeLessThanOrEqual(16);
      expect(y).toBeLessThanOrEqual(15);
      expect(w).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('siglaCont (selo curto da conta)', () => {
  it('limita a 3 letras em maiúsculas e corta com reticência', () => {
    expect(siglaCont('Conta Extra')).toBe('CON'); // lista as 3 primeiras letras; `short` (≤3) já chega pronto em agrupar.ts
    expect(siglaCont('.codex')).toBe('.CO');
    expect(siglaCont('c')).toBe('C');
  });
  it('vazio = traço neutro', () => {
    expect(siglaCont('   ')).toBe('—');
    expect(siglaCont('')).toBe('—');
  });
});

describe('riscarMeio (caminho do grupo riscado no meio)', () => {
  it('texto curto não muda', () => {
    expect(riscarMeio('/projetos/buildagent', 28)).toBe('/projetos/buildagent');
  });
  it('texto longo corta o miolo com reticência', () => {
    const r = riscarMeio('/home/dev/projetos/muito/longo/aqui/de/muito/caminho', 18);
    expect(r).toContain('…');
    expect(r.length).toBeLessThanOrEqual(18);
    expect(r).toBe(r.trim()); // sem espaços nas bordas
  });
});

describe('rostoSvg: cor vinda do snapshot nunca vira marcação (innerHTML)', () => {
  it('cor fora de #rrggbb cai na cor da seed e o SVG não ganha script nem aspas soltas', () => {
    const maliciosa = {
      skin: '"><script>alert(1)</script>',
      hair: 'red" onload="x',
      eyes: 'url(javascript:1)',
      top: '#12345',
      topAccent: '#zzzzzz',
      accessoryColor: '"/><foreignObject>',
    } as unknown as Parameters<typeof rostoSvg>[1];
    const svg = rostoSvg(7, maliciosa);
    expect(svg).not.toMatch(/script|onload|javascript|alert|foreignObject/i);
    // Todo fill do SVG é "#rrggbb" e nada mais.
    for (const m of svg.matchAll(/fill="([^"]*)"/g)) expect(m[1]).toMatch(/^#[0-9a-f]{6}$/);
    expect(svg).toBe(rostoSvg(7)); // tudo inválido = mesmo rosto da seed pura
    expect(paletaDoRosto(7, maliciosa).pele).toBe(paletaDoRosto(7).pele);
  });
  it('cor válida em maiúscula é aceita e normalizada', () => {
    expect(paletaDoRosto(7, { skin: '#AABBCC' }).pele).toBe('#aabbcc');
  });
  it('cor de acessório inválida cai no padrão; válida chega ao boné', () => {
    const ruim = { accessory: 'cap', accessoryColor: 'red;}' } as unknown as Parameters<typeof rostoSvg>[1];
    expect(paletaDoRosto(7, ruim).acessorio).toBe('#f4682a');
    expect(rostoSvg(7, { accessory: 'cap', accessoryColor: '#2E7FD4' })).toContain('#2e7fd4');
  });
});
