// Guarda de versão do Node: o servidor recusa subir abaixo do 22.13 (SQLite embutido sem flag).
import { describe, expect, it } from 'vitest';
import { nodeVersionSupported } from './index';

describe('nodeVersionSupported', () => {
  it('aceita 22.13 em diante e recusa o que vem antes', () => {
    expect(nodeVersionSupported('22.13.0')).toBe(true);
    expect(nodeVersionSupported('22.20.1')).toBe(true);
    expect(nodeVersionSupported('23.0.0')).toBe(true);
    expect(nodeVersionSupported('24.11.0')).toBe(true);
    expect(nodeVersionSupported('22.12.9')).toBe(false);
    expect(nodeVersionSupported('21.99.0')).toBe(false);
    expect(nodeVersionSupported('20.19.1')).toBe(false);
  });

  it('versão ilegível conta como antiga (recusa em vez de subir pela metade)', () => {
    expect(nodeVersionSupported('')).toBe(false);
    expect(nodeVersionSupported('abc')).toBe(false);
  });
});
