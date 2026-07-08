import { describe, it, expect, vi, beforeEach } from 'vitest';

const redirect = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirect(path),
}));

import AppIndexPage from './page';

beforeEach(() => redirect.mockReset());

describe('(app) index', () => {
  it('redirects to /patients', () => {
    AppIndexPage();
    expect(redirect).toHaveBeenCalledWith('/patients');
  });
});
