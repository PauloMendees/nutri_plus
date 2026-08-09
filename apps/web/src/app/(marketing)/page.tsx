import type { Metadata } from 'next';
import { LandingPage } from '@/components/marketing/landing-page';

export const metadata: Metadata = {
  title: 'iNutri | Planos com IA e app do paciente para o nutri solo',
  description:
    'Menos tempo montando plano. Mais tempo no atendimento. IA para planos, app grátis para o paciente, agenda e Silhueta. 7 dias grátis. Cancele quando quiser.',
  openGraph: {
    title: 'iNutri | Menos tempo no plano. Mais tempo no consultório.',
    description:
      'Software para nutricionistas solo: planos com IA, app do paciente e Silhueta. 7 dias grátis.',
    locale: 'pt_BR',
    type: 'website',
  },
};

export default function MarketingHomePage() {
  return <LandingPage />;
}
