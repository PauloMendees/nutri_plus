import { describe, it, expect } from 'vitest';
import { buildTourSearch, parseTourSearch } from './session';

describe('parseTourSearch', () => {
  it('reads tour, chapter and replay from the query string', () => {
    expect(parseTourSearch('?tour=patients&chapter=cadastro&replay=1')).toEqual({
      tourId: 'patients',
      chapterId: 'cadastro',
      replay: true,
    });
  });

  it('returns null when tour is missing', () => {
    expect(parseTourSearch('?chapter=cadastro&replay=1')).toBeNull();
    expect(parseTourSearch('')).toBeNull();
  });

  it('treats replay as false unless replay=1', () => {
    expect(parseTourSearch('?tour=patients&chapter=lista')).toEqual({
      tourId: 'patients',
      chapterId: 'lista',
      replay: false,
    });
  });
});

describe('buildTourSearch', () => {
  it('round-trips with parseTourSearch', () => {
    const withReplay = buildTourSearch({ tourId: 'patients', chapterId: 'cadastro', replay: true });
    expect(parseTourSearch(withReplay)).toEqual({
      tourId: 'patients',
      chapterId: 'cadastro',
      replay: true,
    });
    const withoutReplay = buildTourSearch({ tourId: 'patients', chapterId: 'lista', replay: false });
    expect(parseTourSearch(withoutReplay)).toEqual({
      tourId: 'patients',
      chapterId: 'lista',
      replay: false,
    });
  });
});
