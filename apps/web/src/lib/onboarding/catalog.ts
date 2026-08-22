export type Advance = 'click' | 'next';

export type TourStep = {
  id: string;
  route: string | ((ctx: { demoPatientId: string }) => string);
  anchor: string;
  title: string;
  body: string;
  advance: Advance;
  fixture?: string;
};

export type TourChapter = {
  id: string;
  title: string;
  requires?: 'ai';
  requiresDemo?: boolean;
  steps: TourStep[];
};

export type TourDefinition = {
  id: 'patients';
  title: string;
  summary: string;
  chapters: TourChapter[];
};

const LIST_ROUTE = '/patients';
const CREATE_ROUTE = '/patients/new';

function patientRoute(ctx: { demoPatientId: string }): string {
  return `/patients/${ctx.demoPatientId}`;
}

function newPlanRoute(ctx: { demoPatientId: string }): string {
  return `/patients/${ctx.demoPatientId}/planos/novo`;
}

export const PATIENTS_TOUR: TourDefinition = {
  id: 'patients',
  title: 'Pacientes',
  summary: 'Cadastro, ficha, avaliações e planos alimentares.',
  chapters: [
    {
      id: 'lista',
      title: 'Lista',
      steps: [
        {
          id: 'search',
          route: LIST_ROUTE,
          anchor: '[data-tour="patients.search"]',
          title: 'Busca',
          body: 'Encontre pacientes pelo nome ou e-mail.',
          advance: 'next',
        },
        {
          id: 'new',
          route: LIST_ROUTE,
          anchor: '[data-tour="patients.new"]',
          title: 'Novo paciente',
          body: 'Clique para cadastrar. O tour usa um paciente de demonstração.',
          advance: 'click',
        },
      ],
    },
    {
      id: 'cadastro',
      title: 'Cadastro',
      steps: [
        {
          id: 'form',
          route: CREATE_ROUTE,
          anchor: '[data-tour="patients.create.form"]',
          title: 'Formulário',
          body: 'Preencha nome, e-mail e dados clínicos. Use dados fictícios se quiser.',
          advance: 'next',
          fixture: 'create-patient',
        },
        {
          id: 'submit',
          route: CREATE_ROUTE,
          anchor: '[data-tour="patients.create.submit"]',
          title: 'Salvar cadastro',
          body: 'Salve para criar o paciente de demonstração e abrir a ficha.',
          advance: 'click',
        },
      ],
    },
    {
      id: 'ficha',
      title: 'Ficha',
      requiresDemo: true,
      steps: [
        {
          id: 'header',
          route: patientRoute,
          anchor: '[data-tour="patients.detail.header"]',
          title: 'Cabeçalho',
          body: 'Foto, IMC e consentimento LGPD ficam no topo da ficha.',
          advance: 'next',
        },
        {
          id: 'dados',
          route: patientRoute,
          anchor: '[data-tour="patients.tab.dados"]',
          title: 'Aba Dados',
          body: 'Aqui estão os dados clínicos do paciente.',
          advance: 'click',
        },
      ],
    },
    {
      id: 'anamnese',
      title: 'Anamnese',
      requiresDemo: true,
      steps: [
        {
          id: 'tab',
          route: patientRoute,
          anchor: '[data-tour="patients.tab.anamnese"]',
          title: 'Aba Anamnese',
          body: 'Abra a anamnese para registrar histórico e hábitos.',
          advance: 'click',
        },
        {
          id: 'save',
          route: patientRoute,
          anchor: '[data-tour="patients.anamnese.save"]',
          title: 'Salvar anamnese',
          body: 'Preencha e salve a anamnese do paciente de demonstração.',
          advance: 'click',
          fixture: 'anamnese',
        },
      ],
    },
    {
      id: 'bioimpedancia',
      title: 'Bioimpedância',
      requiresDemo: true,
      steps: [
        {
          id: 'tab',
          route: patientRoute,
          anchor: '[data-tour="patients.tab.bioimpedancia"]',
          title: 'Aba Bioimpedância',
          body: 'Avaliações de composição corporal ficam nesta aba.',
          advance: 'click',
        },
        {
          id: 'save',
          route: patientRoute,
          anchor: '[data-tour="patients.assessment.save"]',
          title: 'Salvar avaliação',
          body: 'Registre uma medida para acompanhar a evolução.',
          advance: 'click',
          fixture: 'assessment',
        },
        {
          id: 'export',
          route: patientRoute,
          anchor: '[data-tour="patients.export-evolution"]',
          title: 'Exportar evolução',
          body: 'Exporte o histórico de avaliações quando precisar.',
          advance: 'next',
        },
      ],
    },
    {
      id: 'metas',
      title: 'Metas',
      requiresDemo: true,
      steps: [
        {
          id: 'tab',
          route: patientRoute,
          anchor: '[data-tour="patients.tab.metas"]',
          title: 'Aba Metas',
          body: 'Defina calorias e macronutrientes nesta aba.',
          advance: 'click',
        },
        {
          id: 'panel',
          route: patientRoute,
          anchor: '[data-tour="patients.metas"]',
          title: 'Calculadoras',
          body: 'Use as calculadoras para sugerir alvos e ajuste se necessário.',
          advance: 'next',
        },
      ],
    },
    {
      id: 'recordatorio-diario',
      title: 'Recordatório e diário',
      requiresDemo: true,
      steps: [
        {
          id: 'tab-recall',
          route: patientRoute,
          anchor: '[data-tour="patients.tab.recordatorio"]',
          title: 'Aba Recordatório',
          body: 'O recordatório 24h registra o que o paciente comeu.',
          advance: 'click',
        },
        {
          id: 'save',
          route: patientRoute,
          anchor: '[data-tour="patients.recall.save"]',
          title: 'Salvar recordatório',
          body: 'Preencha uma refeição e salve o recordatório.',
          advance: 'click',
          fixture: 'food-recall',
        },
        {
          id: 'tab-diario',
          route: patientRoute,
          anchor: '[data-tour="patients.tab.diario"]',
          title: 'Aba Diário',
          body: 'O diário mostra o que o paciente registra no app.',
          advance: 'click',
        },
        {
          id: 'diario',
          route: patientRoute,
          anchor: '[data-tour="patients.diario"]',
          title: 'Histórico do diário',
          body: 'Filtre por 30, 90 dias ou tudo. Este passo não cria registros.',
          advance: 'next',
        },
      ],
    },
    {
      id: 'plano-manual',
      title: 'Plano manual',
      requiresDemo: true,
      steps: [
        {
          id: 'tab',
          route: patientRoute,
          anchor: '[data-tour="patients.tab.planos"]',
          title: 'Aba Planos',
          body: 'Planos alimentares ficam nesta aba.',
          advance: 'click',
        },
        {
          id: 'new',
          route: patientRoute,
          anchor: '[data-tour="patients.plan.new"]',
          title: 'Novo plano',
          body: 'Abra um plano em branco para montar as refeições.',
          advance: 'click',
        },
        {
          id: 'save',
          route: newPlanRoute,
          anchor: '[data-tour="patients.plan.save"]',
          title: 'Salvar plano',
          body: 'Monte refeições com a TACO e salve o plano.',
          advance: 'click',
          fixture: 'meal-plan',
        },
        {
          id: 'pdf',
          route: newPlanRoute,
          anchor: '[data-tour="patients.plan.pdf"]',
          title: 'Exportar PDF',
          body: 'Exporte o plano em PDF para enviar ao paciente.',
          advance: 'click',
        },
      ],
    },
    {
      id: 'gerar-ia',
      title: 'Gerar com IA',
      requires: 'ai',
      requiresDemo: true,
      steps: [
        {
          id: 'tab',
          route: patientRoute,
          anchor: '[data-tour="patients.tab.planos"]',
          title: 'Aba Planos',
          body: 'A geração com IA também começa nesta aba.',
          advance: 'click',
        },
        {
          id: 'ai',
          route: patientRoute,
          anchor: '[data-tour="patients.plan.ai"]',
          title: 'Gerar com IA',
          body: 'Abra o diálogo de geração. Isso consome 1 ação de IA da cota mensal.',
          advance: 'click',
        },
        {
          id: 'confirm',
          route: patientRoute,
          anchor: '[data-tour="patients.plan.ai.confirm"]',
          title: 'Confirmar geração',
          body: 'Confirme para gerar o rascunho. Isso consome 1 ação de IA da cota mensal.',
          advance: 'click',
          fixture: 'ai-instructions',
        },
      ],
    },
  ],
};

export function getTour(id: string): TourDefinition | undefined {
  return id === PATIENTS_TOUR.id ? PATIENTS_TOUR : undefined;
}
