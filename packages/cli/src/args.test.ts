import { describe, expect, it } from 'vitest';
import { GHOST_IDS, UsageError, parseHauntArgs } from './args';

describe('parseHauntArgs', () => {
  it('applies the documented defaults', () => {
    expect(parseHauntArgs(['haunt', 'http://127.0.0.1:3000'])).toEqual({
      url: 'http://127.0.0.1:3000',
      ghosts: [...GHOST_IDS],
      budget: 60,
      seed: 42,
      out: './haunting',
      bench: false,
      possess: 'clean',
    });
  });

  it('reads every flag', () => {
    const o = parseHauntArgs(['haunt', 'http://localhost:3000', '--ghosts', 'glitch,night-owl,glitch', '--budget', '15', '--seed', '7', '--out', 'x', '--bench', '--possess', 'demo']);
    expect(o).toMatchObject({ ghosts: ['glitch', 'night-owl'], budget: 15, seed: 7, out: 'x', bench: true, possess: 'demo' });
  });

  it.each([
    [[]],
    [['scan', 'http://x']],
    [['haunt']],
    [['haunt', 'http://x', 'extra']],
    [['haunt', 'http://x', '--ghosts', 'zombie']],
    [['haunt', 'http://x', '--budget', '0']],
    [['haunt', 'http://x', '--budget', '1.5']],
    [['haunt', 'http://x', '--budget', 'abc']],
    [['haunt', 'http://x', '--seed', '-1']],
    [['haunt', 'http://x', '--possess', 'evil']],
    [['haunt', 'http://x', '--out', ' ']],
    [['haunt', 'http://x', '--skip-ownership']],
  ])('rejects %j', (argv) => {
    expect(() => parseHauntArgs(argv)).toThrow(UsageError);
  });
});
