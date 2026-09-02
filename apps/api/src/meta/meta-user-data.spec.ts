import { buildUserData, hashEmail, hashName, sha256, splitName } from './meta-user-data';

describe('splitName', () => {
  it('separa primeiro e último nome', () => {
    expect(splitName('Ana Paula Silva')).toEqual({ first: 'Ana', last: 'Silva' });
  });

  it('descarta títulos, que entrariam como ruído na correspondência', () => {
    expect(splitName('Dra. Ana Silva')).toEqual({ first: 'Ana', last: 'Silva' });
    expect(splitName('Dr Carlos Souza')).toEqual({ first: 'Carlos', last: 'Souza' });
  });

  it('nome único vira só o primeiro', () => {
    expect(splitName('Ana')).toEqual({ first: 'Ana' });
  });

  it('devolve vazio quando sobra só título', () => {
    expect(splitName('Dra.')).toEqual({});
  });
});

describe('hashName', () => {
  it('normaliza acento, caixa e pontuação antes do hash', () => {
    expect(hashName('  Antônio ')).toBe(hashName('antonio'));
    expect(hashName('Silva-Souza')).toBe(hashName('silvasouza'));
  });
});

describe('buildUserData', () => {
  const browser = {
    fbp: 'fb.1.170.111',
    fbc: 'fb.1.170.abc',
    clientIpAddress: '203.0.113.9',
    clientUserAgent: 'Mozilla/5.0',
  };

  it('inclui os campos novos: external_id, fn, ln e country', () => {
    const data = buildUserData(
      { email: 'Ana@Clinica.com', name: 'Dra. Ana Silva', externalId: 'user-uuid-1' },
      browser,
    );
    expect(data).toEqual({
      em: [hashEmail('ana@clinica.com')],
      external_id: [sha256('user-uuid-1')],
      fn: [hashName('ana')],
      ln: [hashName('silva')],
      country: [sha256('br')],
      fbp: browser.fbp,
      fbc: browser.fbc,
      client_ip_address: browser.clientIpAddress,
      client_user_agent: browser.clientUserAgent,
    });
  });

  it('não hasheia fbp, fbc, IP nem user agent — o Meta os quer em claro', () => {
    const data = buildUserData({ email: 'a@b.c' }, browser);
    expect(data.fbp).toBe(browser.fbp);
    expect(data.client_ip_address).toBe('203.0.113.9');
  });

  it('country sai sempre, mesmo sem identidade nenhuma', () => {
    expect(buildUserData({}, {})).toEqual({ country: [sha256('br')] });
  });

  it('omite os campos ausentes em vez de mandar vazio', () => {
    const data = buildUserData({ email: 'a@b.c' }, {});
    expect(data).not.toHaveProperty('fn');
    expect(data).not.toHaveProperty('external_id');
  });

  it('nenhum identificador pessoal sai em claro', () => {
    const json = JSON.stringify(
      buildUserData({ email: 'ana@clinica.com', name: 'Ana Silva', externalId: 'uid-9' }, browser),
    );
    expect(json).not.toContain('ana@clinica.com');
    expect(json).not.toContain('Ana');
    expect(json).not.toContain('uid-9');
  });
});
