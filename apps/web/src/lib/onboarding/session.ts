export function parseTourSearch(
  search: string,
): { tourId: string; chapterId: string; replay: boolean } | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const tourId = params.get('tour');
  const chapterId = params.get('chapter');
  if (!tourId || !chapterId) return null;
  return { tourId, chapterId, replay: params.get('replay') === '1' };
}

export function buildTourSearch(opts: { tourId: string; chapterId: string; replay: boolean }): string {
  const params = new URLSearchParams();
  params.set('tour', opts.tourId);
  params.set('chapter', opts.chapterId);
  if (opts.replay) params.set('replay', '1');
  return `?${params.toString()}`;
}
