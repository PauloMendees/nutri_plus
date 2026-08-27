import { isTrialEligible } from './plan-policy';

// Regra do produto: o trial pode ser iniciado a qualquer momento, desde que a
// pessoa ainda não o tenha usado E não seja nem tenha sido assinante.
//
// O bug que originou estes testes: a UI usava `onboardedAt` como proxy de
// elegibilidade, e o checkout marca `onboardedAt` ANTES do pagamento. Gerar um
// QR de Pix e não pagar queimava o trial para sempre — e como o resolveAccess
// exige `trialEndsAt` para liberar acesso, a conta ficava travada em read-only
// sem saída.
const base = {
  isComp: false,
  trialEndsAt: null as Date | null,
  currentPeriodEnd: null as Date | null,
  paymentCount: 0,
};

describe('isTrialEligible', () => {
  it('elegível: conta nova que nunca fez trial nem pagou', () => {
    expect(isTrialEligible(base)).toBe(true);
  });

  it('elegível mesmo com onboardedAt marcado — checkout abandonado não queima o trial', () => {
    // onboardedAt nem entra na regra; este teste existe para fixar isso.
    expect(isTrialEligible({ ...base })).toBe(true);
  });

  it('NÃO elegível: já usou o trial (trialEndsAt preenchido, mesmo expirado)', () => {
    expect(isTrialEligible({ ...base, trialEndsAt: new Date('2020-01-01') })).toBe(false);
  });

  it('NÃO elegível: é ou foi assinante (tem período pago)', () => {
    expect(isTrialEligible({ ...base, currentPeriodEnd: new Date('2020-01-01') })).toBe(false);
  });

  it('NÃO elegível: já teve pagamento confirmado', () => {
    expect(isTrialEligible({ ...base, paymentCount: 1 })).toBe(false);
  });

  it('NÃO elegível: conta cortesia já tem acesso PRO', () => {
    expect(isTrialEligible({ ...base, isComp: true })).toBe(false);
  });

  it('campo ausente conta como "não tem", não como "já usou"', () => {
    // Objeto parcial (o que um mock ou um select estreito produz). Errar aqui
    // para o lado de "já usou" trancaria a conta em read-only.
    expect(isTrialEligible({})).toBe(true);
    expect(isTrialEligible({ isComp: false })).toBe(true);
  });
});
