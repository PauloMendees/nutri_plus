import { SEMANTIC_LIGHT, SEMANTIC_DARK } from './config';

describe('semantic theme tokens', () => {
  it('defines the same token keys in light and dark', () => {
    expect(Object.keys(SEMANTIC_LIGHT).sort()).toEqual(Object.keys(SEMANTIC_DARK).sort());
  });

  it('keeps the current dark values', () => {
    expect(SEMANTIC_DARK['--background']).toBe('13 20 17');
    expect(SEMANTIC_DARK['--foreground']).toBe('231 236 233');
    expect(SEMANTIC_DARK['--primary']).toBe('20 191 166');
    expect(SEMANTIC_DARK['--destructive']).toBe('229 72 77');
  });

  it('defines a light palette distinct from dark', () => {
    expect(SEMANTIC_LIGHT['--background']).toBe('246 250 248');
    expect(SEMANTIC_LIGHT['--foreground']).toBe('13 20 17');
    expect(SEMANTIC_LIGHT['--primary']).toBe('15 158 136');
    expect(SEMANTIC_LIGHT['--background']).not.toBe(SEMANTIC_DARK['--background']);
  });
});
