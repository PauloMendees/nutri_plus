import { NotFoundException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

function contextFor(user: unknown, req: Record<string, unknown> = { method: 'GET', originalUrl: '/v1/admin/patients' }) {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user, ...req }) }),
  } as any;
}

describe('AdminGuard', () => {
  const config = (value?: string) => ({ get: () => value }) as any;

  it('lets an allowlisted user through', () => {
    const guard = new AdminGuard(config('admin@x.com'));
    expect(guard.canActivate(contextFor({ email: 'x', user: { email: 'Admin@x.com' } }))).toBe(true);
  });

  it('answers 404 to a logged-in user who is not an admin', () => {
    const guard = new AdminGuard(config('admin@x.com'));
    expect(() => guard.canActivate(contextFor({ email: 'n@x.com', user: { email: 'n@x.com' } }))).toThrow(
      NotFoundException,
    );
  });

  it('answers 404 when no admin is configured', () => {
    const guard = new AdminGuard(config(undefined));
    expect(() => guard.canActivate(contextFor({ email: 'admin@x.com', user: { email: 'admin@x.com' } }))).toThrow(
      NotFoundException,
    );
  });

  it('answers 404 without a local user', () => {
    const guard = new AdminGuard(config('admin@x.com'));
    expect(() => guard.canActivate(contextFor({ email: 'admin@x.com', user: null }))).toThrow(NotFoundException);
  });

  // Mesma mensagem do 404 do roteador do Nest: o corpo não denuncia o painel.
  it('answers with the same body as an unknown route', () => {
    const guard = new AdminGuard(config('admin@x.com'));
    expect(() =>
      guard.canActivate(contextFor({ email: 'n@x.com', user: { email: 'n@x.com' } }, { method: 'GET', originalUrl: '/v1/admin/patients?page=2' })),
    ).toThrow('Cannot GET /v1/admin/patients?page=2');
  });

  it('falls back to req.url when originalUrl is missing', () => {
    const guard = new AdminGuard(config('admin@x.com'));
    expect(() =>
      guard.canActivate(contextFor({ email: 'n@x.com', user: { email: 'n@x.com' } }, { method: 'GET', url: '/v1/admin/nutritionists' })),
    ).toThrow('Cannot GET /v1/admin/nutritionists');
  });
});
