export type PlanTier = 'ESSENCIAL' | 'PRO';
export type BillingPeriod = 'MONTHLY' | 'YEARLY';
export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
export type BillingErrorCode =
  | 'READ_ONLY'
  | 'AI_QUOTA_EXCEEDED'
  | 'FEATURE_PRO_ONLY'
  | 'SEAT_LIMIT';
export type PlanFeature = 'silhueta' | 'transcription' | 'employees';

export type PaymentMethod = 'PIX' | 'CREDIT_CARD';

export interface PixQrCode {
  encodedImage: string;
  payload: string;
}

export interface CardInput {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
}

export interface CardHolderInfo {
  postalCode: string;
  addressNumber: string;
  phone: string;
}

export interface PaymentMethodRequest {
  method: PaymentMethod;
  cpfCnpj?: string;
  card?: CardInput;
  holderInfo?: CardHolderInfo;
}

export interface PlanConfig {
  tier: PlanTier;
  monthlyBrl: number;
  yearlyBrl: number;
  aiActionsPerMonth: number; // MEAL_PLAN_GENERATION + MEAL_PLAN_ADJUSTMENT
  silhuetaPerMonth: number;
  transcriptionPerMonth: number;
  employeeSeats: number;
  features: PlanFeature[];
}

// Fonte ÚNICA dos planos (server enforcement + web display). Não é segredo.
export const PLAN_CATALOG: Record<PlanTier, PlanConfig> = {
  ESSENCIAL: {
    tier: 'ESSENCIAL',
    monthlyBrl: 49,
    yearlyBrl: 490,
    aiActionsPerMonth: 30,
    silhuetaPerMonth: 0,
    transcriptionPerMonth: 0,
    employeeSeats: 0,
    features: [],
  },
  PRO: {
    tier: 'PRO',
    monthlyBrl: 99,
    yearlyBrl: 990,
    aiActionsPerMonth: 200,
    silhuetaPerMonth: 40,
    transcriptionPerMonth: 30,
    employeeSeats: 2,
    features: ['silhueta', 'transcription', 'employees'],
  },
};

export interface Entitlements {
  tier: PlanTier;
  isReadOnly: boolean;
  features: Record<PlanFeature, boolean>;
  aiQuota: number; // ações de IA/mês do tier vigente
  aiUsed: number; // gen + adjust no mês corrente
}

export interface SubscriptionPaymentView {
  id: string;
  amount: number;
  status: string;
  billingType: string | null;
  dueDate: string | null; // ISO
  paidAt: string | null; // ISO
}

export interface SubscriptionView {
  status: SubscriptionStatus;
  isComp: boolean;
  trialEndsAt: string | null; // ISO
  plan: PlanTier | null;
  billingPeriod: BillingPeriod | null;
  currentPeriodEnd: string | null; // ISO
  cancelAtPeriodEnd: boolean;
  entitlements: Entitlements;
  recentPayments: SubscriptionPaymentView[];
  onboardedAt: string | null;
  paymentMethod: PaymentMethod | null;
  cardLast4: string | null;
  cardBrand: string | null;
}

export interface CheckoutRequest {
  plan: PlanTier;
  period: BillingPeriod;
  cpfCnpj: string;
  method: PaymentMethod;
  card?: CardInput;
  holderInfo?: CardHolderInfo;
}

export type CheckoutResponse =
  | { method: 'PIX'; pixQrCode: PixQrCode }
  | { method: 'CREDIT_CARD'; status: 'ACTIVE' | 'PENDING' }
