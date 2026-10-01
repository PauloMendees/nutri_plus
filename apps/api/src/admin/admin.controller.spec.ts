import { AdminController } from './admin.controller';

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
