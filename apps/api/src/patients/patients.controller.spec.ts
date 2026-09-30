import 'reflect-metadata';
import { BILLING_EXEMPT_KEY } from '../billing/decorators';
import { PatientsController } from './patients.controller';

describe('PatientsController billing', () => {
  // Exclusão pode ser um pedido de LGPD do paciente: tem de funcionar mesmo com
  // a assinatura da nutricionista vencida (read-only), como a exportação (GET).
  it('lets a read-only tenant delete a patient', () => {
    expect(Reflect.getMetadata(BILLING_EXEMPT_KEY, PatientsController.prototype.remove)).toBe(true);
  });

  it('keeps billing on other writes (e.g. updating a patient)', () => {
    expect(Reflect.getMetadata(BILLING_EXEMPT_KEY, PatientsController.prototype.update)).toBeUndefined();
  });
});
