import { buildCorsOptions } from './cors.options';

describe('buildCorsOptions', () => {
  it('uses the provided web origin with credentials', () => {
    expect(buildCorsOptions('https://app.inutri.com')).toEqual({
      origin: 'https://app.inutri.com',
      credentials: true,
    });
  });

  it('defaults to the local web dev origin', () => {
    expect(buildCorsOptions(undefined)).toEqual({
      origin: 'http://localhost:3001',
      credentials: true,
    });
  });
});
