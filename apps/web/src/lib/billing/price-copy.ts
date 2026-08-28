import { PLAN_CATALOG } from '@nutri-plus/shared-types';

// Frases de preço usadas fora da pricing-section (hero, tabelas comparativas).
// Derivadas do PLAN_CATALOG: uma mudança de tabela não pode deixar a landing
// anunciando um preço que o checkout não cobra.
export const entryMonthlyBrl = PLAN_CATALOG.ESSENCIAL.monthlyBrl;

export const entryPriceLabel = `A partir de R$${entryMonthlyBrl}/mês`;

export const entryPriceWithDaily = `${entryPriceLabel} · menos de R$${Math.ceil(
  entryMonthlyBrl / 30,
)}/dia`;
