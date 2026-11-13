// TDD P2: exibição das salas — a pasta agent-<uuid> deve virar "Agente xxxx".
import { describe, expect, it } from 'vitest';
import { roomDisplayNames } from './rooms';

describe('roomDisplayNames', () => {
  it('nome normal continua o basename', () => {
    const rooms = new Map([
      ['1', '/home/x/projeto-alpha'],
      ['2', '/home/y/outro-app'],
    ]);
    expect([...roomDisplayNames(rooms).values()]).toEqual(['projeto-alpha', 'outro-app']);
  });

  it('basename repetido ganha as pastas pai (desambiguação atual)', () => {
    const rooms = new Map([
      ['1', '/home/x/applications/app'],
      ['2', '/home/y/outro/app'],
    ]);
    const nomes = roomDisplayNames(rooms);
    expect(nomes.get('1')).toBe('applications/app');
    expect(nomes.get('2')).toBe('outro/app');
  });

  it('pasta agent-<uuid> vira "Agente " + os 4 primeiros hex', () => {
    const rooms = new Map([['1', '/home/x/agent-135a2b3c-1234-5678-9abc-def012345678']]);
    expect(roomDisplayNames(rooms).get('1')).toBe('Agente 135a');
  });
});
