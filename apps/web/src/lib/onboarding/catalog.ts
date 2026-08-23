import type { OnboardingTourId } from '@nutri-plus/shared-types';
import { UserRole } from '@nutri-plus/shared-types';
import { canBrowseFoods, canManagePatients, canManageSettings } from '@/lib/auth/access';

export type DemoKind = 'patient' | 'appointment' | 'transaction';

export type Advance = 'click' | 'next';

export type TourRouteCtx = { demoPatientId: string; pathname?: string };

export type TourStep = {
  id: string;
  route: string | ((ctx: TourRouteCtx) => string | null);
  anchor: string;
  title: string;
  body: string;
  advance: Advance;
  fixture?: string;
  /** Mutating clicks: do not auto-advance; wait for notifyChapterActionSucceeded. */
  awaitAction?: boolean;
};

export type TourChapter = {
  id: string;
  title: string;
  requires?: 'ai';
  requiresDemo?: boolean;
  createsDemo?: DemoKind;
  steps: TourStep[];
};

export type TourDefinition = {
  id: OnboardingTourId;
  title: string;
  summary: string;
  canStart: (role: UserRole) => boolean;
  startLockedText?: string;
  chapters: TourChapter[];
};

const LIST_ROUTE = '/patients';
const CREATE_ROUTE = '/patients/new';

function patientRoute(ctx: { demoPatientId: string }): string {
  return `/patients/${ctx.demoPatientId}`;
}

function newPlanRoute(ctx: TourRouteCtx): string {
  return `/patients/${ctx.demoPatientId}/planos/novo`;
}

function newRecallRoute(ctx: TourRouteCtx): string {
  return `/patients/${ctx.demoPatientId}/recordatorios/novo`;
}

function savedPlanRoute(ctx: TourRouteCtx): string | null {
  const prefix = `/patients/${ctx.demoPatientId}/planos/`;
  const path = ctx.pathname ?? '';
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length);
  if (!rest || rest === 'novo' || rest.includes('/')) return null;
  return path;
}

export const PATIENTS_TOUR: TourDefinition = {
  id: 'patients',
  title: 'Pacientes',
  summary: 'Cadastro, ficha, avaliações e planos alimentares.',
  canStart: canManagePatients,
  startLockedText: 'Este tutorial é feito pelo nutricionista (cadastro de pacientes).',
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
      createsDemo: 'patient',
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
          awaitAction: true,
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
          awaitAction: true,
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
          id: 'new',
          route: patientRoute,
          anchor: '[data-tour="patients.assessment.new"]',
          title: 'Nova avaliação',
          body: 'Abra o formulário para registrar peso e medidas.',
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
          awaitAction: true,
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
          id: 'new',
          route: patientRoute,
          anchor: '[data-tour="patients.recall.new"]',
          title: 'Novo recordatório',
          body: 'Abra um recordatório em branco para registrar as refeições.',
          advance: 'click',
        },
        {
          id: 'save',
          route: newRecallRoute,
          anchor: '[data-tour="patients.recall.save"]',
          title: 'Salvar recordatório',
          body: 'Preencha uma refeição e salve o recordatório.',
          advance: 'click',
          fixture: 'food-recall',
          awaitAction: true,
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
          awaitAction: true,
        },
        {
          id: 'pdf',
          route: savedPlanRoute,
          anchor: '[data-tour="patients.plan.pdf"]:not([disabled])',
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
          awaitAction: true,
        },
      ],
    },
  ],
};

export const AGENDA_TOUR: TourDefinition = {
  id: 'agenda',
  title: 'Agenda',
  summary: 'Agendamentos, visões de mês e lista, e categorias.',
  canStart: () => true,
  chapters: [
    {
      id: 'visao-geral',
      title: 'Visão geral',
      steps: [
        {
          id: 'view',
          route: '/agenda',
          anchor: '[data-tour="agenda.view"]',
          title: 'Sua agenda',
          body: 'Veja os atendimentos do mês ou em lista. Tudo começa aqui.',
          advance: 'next',
        },
        {
          id: 'toggle',
          route: '/agenda',
          anchor: '[data-tour="agenda.toggle"]',
          title: 'Mês ou lista',
          body: 'Alterne entre a grade do mês e a lista de atendimentos.',
          advance: 'next',
        },
        {
          id: 'nav',
          route: '/agenda',
          anchor: '[data-tour="agenda.nav"]',
          title: 'Navegação',
          body: 'Avance ou volte meses e retorne a hoje com um clique.',
          advance: 'next',
        },
      ],
    },
    {
      id: 'agendamento',
      title: 'Agendamento',
      createsDemo: 'appointment',
      steps: [
        {
          id: 'new',
          route: '/agenda',
          anchor: '[data-tour="agenda.new"]',
          title: 'Novo agendamento',
          body: 'Clique para abrir o formulário. O tour cria um agendamento de demonstração.',
          advance: 'click',
        },
        {
          id: 'form',
          route: '/agenda',
          anchor: '[data-tour="agenda.form"]',
          title: 'Formulário',
          body: 'A categoria preenche o título e o paciente é opcional. Use dados fictícios se quiser.',
          advance: 'next',
          fixture: 'appointment',
        },
        {
          id: 'save',
          route: '/agenda',
          anchor: '[data-tour="agenda.save"]',
          title: 'Salvar agendamento',
          body: 'Salve para criar o agendamento de demonstração.',
          advance: 'click',
          awaitAction: true,
        },
      ],
    },
    {
      id: 'categorias',
      title: 'Categorias',
      steps: [
        {
          id: 'list',
          route: '/agenda/categorias',
          anchor: '[data-tour="agenda.categories"]',
          title: 'Categorias',
          body: 'Organize os tipos de atendimento. A categoria padrão vem pré-selecionada.',
          advance: 'next',
        },
        {
          id: 'new',
          route: '/agenda/categorias',
          anchor: '[data-tour="agenda.category.new"]',
          title: 'Nova categoria',
          body: 'Abra o formulário de categoria. Nada será salvo neste passo.',
          advance: 'click',
        },
        {
          id: 'form',
          route: '/agenda/categorias',
          anchor: '[data-tour="agenda.category.form"]',
          title: 'Cor e padrão',
          body: 'Escolha uma cor e marque como padrão se quiser pré-selecionar.',
          advance: 'next',
        },
        {
          id: 'cancel',
          route: '/agenda/categorias',
          anchor: '[data-tour="agenda.category.cancel"]',
          title: 'Fechar sem salvar',
          body: 'Clique em Cancelar para fechar. O tour não cria categoria.',
          advance: 'click',
        },
      ],
    },
  ],
};

export const CONTABILIDADE_TOUR: TourDefinition = {
  id: 'contabilidade',
  title: 'Contabilidade',
  summary: 'Extrato mensal, lançamentos e categorias financeiras.',
  canStart: () => true,
  chapters: [
    {
      id: 'extrato',
      title: 'Extrato',
      steps: [
        {
          id: 'view',
          route: '/contabilidade',
          anchor: '[data-tour="contabilidade.view"]',
          title: 'Seu extrato',
          body: 'Receitas e despesas do mês, com saldo acumulado.',
          advance: 'next',
        },
        {
          id: 'chart',
          route: '/contabilidade',
          anchor: '[data-tour="contabilidade.chart"]',
          title: 'Entradas x Saídas',
          body: 'O gráfico compara os últimos 12 meses.',
          advance: 'next',
        },
        {
          id: 'cards',
          route: '/contabilidade',
          anchor: '[data-tour="contabilidade.cards"]',
          title: 'Resumo do mês',
          body: 'Entradas, saídas e saldo do mês selecionado.',
          advance: 'next',
        },
        {
          id: 'nav',
          route: '/contabilidade',
          anchor: '[data-tour="contabilidade.nav"]',
          title: 'Troca de mês',
          body: 'Navegue entre os meses do extrato.',
          advance: 'next',
        },
      ],
    },
    {
      id: 'lancamento',
      title: 'Lançamento',
      createsDemo: 'transaction',
      steps: [
        {
          id: 'new',
          route: '/contabilidade',
          anchor: '[data-tour="contabilidade.new"]',
          title: 'Nova transação',
          body: 'Clique para registrar. O tour cria um lançamento de demonstração.',
          advance: 'click',
        },
        {
          id: 'form',
          route: '/contabilidade',
          anchor: '[data-tour="contabilidade.form"]',
          title: 'Formulário',
          body: 'O tipo filtra as categorias e o valor é em reais. Use dados fictícios se quiser.',
          advance: 'next',
          fixture: 'transaction',
        },
        {
          id: 'save',
          route: '/contabilidade',
          anchor: '[data-tour="contabilidade.save"]',
          title: 'Salvar lançamento',
          body: 'Salve para registrar o lançamento de demonstração.',
          advance: 'click',
          awaitAction: true,
        },
        {
          id: 'table',
          route: '/contabilidade',
          anchor: '[data-tour="contabilidade.table"]',
          title: 'No extrato',
          body: 'O lançamento aparece na tabela. Clique numa linha para editar.',
          advance: 'next',
        },
      ],
    },
    {
      id: 'categorias',
      title: 'Categorias',
      steps: [
        {
          id: 'list',
          route: '/contabilidade/categorias',
          anchor: '[data-tour="contabilidade.categories"]',
          title: 'Categorias',
          body: 'Separe receitas e despesas por categoria.',
          advance: 'next',
        },
        {
          id: 'new',
          route: '/contabilidade/categorias',
          anchor: '[data-tour="contabilidade.category.new"]',
          title: 'Nova categoria',
          body: 'Abra o formulário de categoria. Nada será salvo neste passo.',
          advance: 'click',
        },
        {
          id: 'form',
          route: '/contabilidade/categorias',
          anchor: '[data-tour="contabilidade.category.form"]',
          title: 'Nome e tipo',
          body: 'Defina o nome e se é receita ou despesa.',
          advance: 'next',
        },
        {
          id: 'cancel',
          route: '/contabilidade/categorias',
          anchor: '[data-tour="contabilidade.category.cancel"]',
          title: 'Fechar sem salvar',
          body: 'Clique em Cancelar para fechar. O tour não cria categoria.',
          advance: 'click',
        },
      ],
    },
  ],
};

export const ALIMENTOS_TOUR: TourDefinition = {
  id: 'alimentos',
  title: 'Alimentos',
  summary: 'Busca na tabela TACO com dados nutricionais.',
  canStart: canBrowseFoods,
  startLockedText: 'Este tutorial é feito pelo nutricionista (busca de alimentos).',
  chapters: [
    {
      id: 'busca',
      title: 'Busca',
      steps: [
        {
          id: 'search',
          route: '/alimentos',
          anchor: '[data-tour="alimentos.search"]',
          title: 'Busca TACO',
          body: 'Digite ao menos 2 letras — ou use os dados fictícios para buscar "arroz".',
          advance: 'next',
          fixture: 'foods-search',
        },
        {
          id: 'table',
          route: '/alimentos',
          anchor: '[data-tour="alimentos.table"]',
          title: 'Valores por 100 g',
          body: 'Energia, macros, fibra e sódio de cada alimento.',
          advance: 'next',
        },
      ],
    },
  ],
};

export const CONFIGURACOES_TOUR: TourDefinition = {
  id: 'configuracoes',
  title: 'Configurações',
  summary: 'Plano alimentar, aparência, aplicativo do paciente e assinatura.',
  canStart: canManageSettings,
  startLockedText: 'Este tutorial é feito pelo nutricionista (configurações da conta).',
  chapters: [
    {
      id: 'plano-alimentar',
      title: 'Plano alimentar',
      steps: [
        {
          id: 'tabs',
          route: '/configuracoes',
          anchor: '[data-tour="config.tabs"]',
          title: 'As 4 áreas',
          body: 'Plano alimentar, aparência, aplicativo do paciente e assinatura.',
          advance: 'next',
        },
        {
          id: 'plano',
          route: '/configuracoes',
          anchor: '[data-tour="config.plano"]',
          title: 'PDF do plano',
          body: 'Logomarca, nome de exibição e instruções padrão da IA. Nada é salvo no tour.',
          advance: 'next',
        },
      ],
    },
    {
      id: 'aparencia',
      title: 'Aparência',
      steps: [
        {
          id: 'tab',
          route: '/configuracoes',
          anchor: '[data-tour="config.tab.aparencia"]',
          title: 'Aba Aparência',
          body: 'Abra a aba de aparência.',
          advance: 'click',
        },
        {
          id: 'theme',
          route: '/configuracoes',
          anchor: '[data-tour="config.aparencia"]',
          title: 'Tema',
          body: 'Escolha entre tema claro e escuro.',
          advance: 'next',
        },
      ],
    },
    {
      id: 'aplicativo',
      title: 'Aplicativo Paciente',
      steps: [
        {
          id: 'tab',
          route: '/configuracoes',
          anchor: '[data-tour="config.tab.app"]',
          title: 'Aba Aplicativo',
          body: 'Abra as configurações do app do paciente.',
          advance: 'click',
        },
        {
          id: 'content',
          route: '/configuracoes',
          anchor: '[data-tour="config.app"]',
          title: 'Padrões do app',
          body: 'WhatsApp de contato e permissões padrão para novos pacientes. Nada é salvo no tour.',
          advance: 'next',
        },
      ],
    },
    {
      id: 'assinatura',
      title: 'Assinatura',
      steps: [
        {
          id: 'tab',
          route: '/configuracoes',
          anchor: '[data-tour="config.tab.assinatura"]',
          title: 'Aba Assinatura',
          body: 'Abra os dados da assinatura.',
          advance: 'click',
        },
        {
          id: 'content',
          route: '/configuracoes',
          anchor: '[data-tour="config.assinatura"]',
          title: 'Seu plano',
          body: 'Plano atual, forma de pagamento e faturas.',
          advance: 'next',
        },
      ],
    },
  ],
};

export const ALL_TOURS: TourDefinition[] = [
  PATIENTS_TOUR,
  AGENDA_TOUR,
  CONTABILIDADE_TOUR,
  ALIMENTOS_TOUR,
  CONFIGURACOES_TOUR,
];

export function getTour(id: string): TourDefinition | undefined {
  return ALL_TOURS.find((tour) => tour.id === id);
}
