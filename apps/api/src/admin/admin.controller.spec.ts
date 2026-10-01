import { GUARDS_METADATA } from '@nestjs/common/constants';
import { DECORATORS } from '@nestjs/swagger/dist/constants';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';

describe('AdminController route order', () => {
  // "report.pdf" precisa vir antes de ":id", senão o Nest o casa como id.
  it('declares nutritionists/report.pdf before nutritionists/:id', () => {
    const paths = Object.getOwnPropertyNames(AdminController.prototype).map(
      (name) => Reflect.getMetadata('path', (AdminController.prototype as any)[name]) as string | undefined,
    );
    const report = paths.indexOf('nutritionists/report.pdf');
    const byId = paths.indexOf('nutritionists/:id');
    expect(report).toBeGreaterThanOrEqual(0);
    expect(byId).toBeGreaterThan(report);
  });
});

describe('AdminController metadata', () => {
  // Sem o AdminGuard na classe, qualquer nutricionista logada veria o painel.
  it('is guarded by AdminGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminController)).toContain(AdminGuard);
  });

  // Painel oculto: fora do Swagger, para não revelar que as rotas existem.
  it('is excluded from Swagger', () => {
    expect(Reflect.getMetadata(DECORATORS.API_EXCLUDE_CONTROLLER, AdminController)).toEqual([true]);
  });
});
