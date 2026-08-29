import { PLAN_CATALOG } from '@nutri-plus/shared-types';

// Frases de preço usadas fora da pricing-section (hero, tabelas comparativas).
// Derivadas do PLAN_CATALOG: uma mudança de tabela não pode deixar a landing
// anunciando um preço que o checkout não cobra.
export const entryMonthlyBrl = PLAN_CATALOG.ESSENCIAL.monthlyBrl;

export const entryPriceLabel = `A partir de R$${entryMonthlyBrl}/mês`;

// Arredonda para cima: a frase promete um teto, então nunca pode subestimar.
export const entryDailyCeilBrl = Math.ceil(entryMonthlyBrl / 30);

export const entryDailyLabel = `Menos de R$${entryDailyCeilBrl} por dia`;

export const entryPriceWithDaily = `${entryPriceLabel} · menos de R$${entryDailyCeilBrl}/dia`;
