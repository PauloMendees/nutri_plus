import { isAdminEmail, parseAdminEmails } from './admin-access';

describe('admin allowlist', () => {
  it('parses a comma list, trimming and lowercasing', () => {
    expect([...parseAdminEmails(' A@x.com, b@Y.com ,,')]).toEqual(['a@x.com', 'b@y.com']);
  });

  it('treats a missing or empty env as no admins', () => {
    expect(parseAdminEmails(undefined).size).toBe(0);
    expect(parseAdminEmails('  ').size).toBe(0);
    expect(isAdminEmail('a@x.com', undefined)).toBe(false);
  });

  it('matches ignoring case and spaces', () => {
    expect(isAdminEmail('  Paulo.H.Mendes25@Gmail.com ', 'paulo.h.mendes25@gmail.com')).toBe(true);
    expect(isAdminEmail('outro@x.com', 'paulo.h.mendes25@gmail.com')).toBe(false);
    expect(isAdminEmail(null, 'paulo.h.mendes25@gmail.com')).toBe(false);
  });
});
