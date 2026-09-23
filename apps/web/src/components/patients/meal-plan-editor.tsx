'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Loader2, Lock, Sparkles } from 'lucide-react';
import {
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type Path,
  type Resolver,
  type UseFormRegister,
  type UseFormSetValue,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { AiJobDetail, Food, MealPlan, MealPlanDraft } from '@nutri-plus/shared-types';
import { macrosForPortion } from '@nutri-plus/shared-types';
import { mealPlanSchema, type MealPlanFormValues } from '@/lib/validation/meal-plan';
import { registerFixture } from '@/lib/onboarding/fixtures';
import { useTour } from '@/components/onboarding/tour-provider';
import {
  useCreateMealPlan,
  useDeleteMealPlan,
  useMealPlan,
  useUpdateMealPlan,
} from '@/lib/queries/meal-plans';
import { ApiError } from '@/lib/api/client';
import { downloadMealPlanPdf } from '@/lib/api/meal-plans';
import { getAiJob } from '@/lib/api/ai-jobs';
import { adjustmentInFlightFor, useAiJobs, useConsumeAiJob } from '@/lib/queries/ai-jobs';
import { useNutritionTargets } from '@/lib/queries/nutrition-targets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { AiAdjustDialog } from '@/components/patients/ai-adjust-dialog';
import { FoodPickerDialog } from '@/components/patients/food-picker-dialog';

type ItemValues = { foodName: string; foodId: string; quantity: string; grams: string; calories: string; protein: string; carbs: string; fats: string; fiber: string; sodium: string };
type OptionValues = { label: string; items: ItemValues[] };
type FormValues = {
  title: string;
  objective: string;
  targetCalories: string;
  targetProtein: string;
  targetCarbs: string;
  targetFats: string;
  meals: { name: string; timeLabel: string; instructions: string; options: OptionValues[] }[];
};

const blankItem = (): ItemValues => ({ foodName: '', foodId: '', quantity: '', grams: '', calories: '', protein: '', carbs: '', fats: '', fiber: '', sodium: '' });
const blankOption = (): OptionValues => ({ label: '', items: [blankItem()] });
const blankMeal = () => ({ name: '', timeLabel: '', instructions: '', options: [blankOption()] });

function blankDefaults(): FormValues {
  return {
    title: '', objective: '', targetCalories: '', targetProtein: '', targetCarbs: '', targetFats: '',
    meals: [blankMeal()],
  };
}

const numToStr = (n: number | null) => (n == null ? '' : String(n));

function toDefaults(plan: MealPlan): FormValues {
  return {
    title: plan.title ?? '',
    objective: plan.objective ?? '',
    targetCalories: numToStr(plan.targetCalories),
    targetProtein: numToStr(plan.targetProtein),
    targetCarbs: numToStr(plan.targetCarbs),
    targetFats: numToStr(plan.targetFats),
    meals: plan.meals.map((m) => ({
      name: m.name ?? '',
      timeLabel: m.timeLabel ?? '',
      instructions: m.instructions ?? '',
      options: m.options.map((o) => ({
        label: o.label ?? '',
        items: o.items.map((it) => ({
          foodName: it.foodName ?? '',
          foodId: it.foodId ?? '',
          quantity: quantityText(it.quantity ?? null, it.grams ?? null),
          grams: numToStr(it.grams),
          calories: numToStr(it.calories),
          protein: numToStr(it.protein),
          carbs: numToStr(it.carbs),
          fats: numToStr(it.fats),
          fiber: numToStr(it.fiber),
          sodium: numToStr(it.sodium),
        })),
      })),
    })),
  };
}

// A IA preenche ora `quantity` ("1 xícara"), ora só `grams`, ora nenhum dos dois.
// O editor mostra um campo só, então a leitura normaliza: sem texto e com gramas,
// o texto passa a ser "120 g".
function quantityText(quantity: string | null, grams: number | null): string {
  const q = (quantity ?? '').trim();
  if (q) return q;
  return grams != null && grams > 0 ? `${grams} g` : '';
}

function draftToDefaults(d: MealPlanDraft): FormValues {
  return {
    title: d.title ?? '',
    objective: d.objective ?? '',
    targetCalories: numToStr(d.targetCalories ?? null),
    targetProtein: numToStr(d.targetProtein ?? null),
    targetCarbs: numToStr(d.targetCarbs ?? null),
    targetFats: numToStr(d.targetFats ?? null),
    meals: (d.meals ?? []).map((m) => ({
      name: m.name ?? '',
      timeLabel: m.timeLabel ?? '',
      instructions: m.instructions ?? '',
      options: (m.options ?? []).map((o) => ({
        label: o.label ?? '',
        items: (o.items ?? []).map((it) => ({
          foodName: it.foodName ?? '',
          foodId: it.foodId ?? '',
          quantity: quantityText(it.quantity ?? null, it.grams ?? null),
          grams: numToStr(it.grams ?? null),
          calories: numToStr(it.calories ?? null),
          protein: numToStr(it.protein ?? null),
          carbs: numToStr(it.carbs ?? null),
          fats: numToStr(it.fats ?? null),
          fiber: numToStr(it.fiber ?? null),
          sodium: numToStr(it.sodium ?? null),
        })),
      })),
    })),
  };
}

const TARGETS = [
  { key: 'targetCalories', total: 'calories', label: 'Kcal' },
  { key: 'targetProtein', total: 'protein', label: 'Proteína' },
  { key: 'targetCarbs', total: 'carbs', label: 'Carbo' },
  { key: 'targetFats', total: 'fats', label: 'Gordura' },
] as const;

type MacroKey = 'calories' | 'protein' | 'carbs' | 'fats' | 'fiber' | 'sodium';
type MacroDef = { key: MacroKey; label: string };

// Os quatro com meta ficam sempre à vista; fibra e sódio só com "Ver outros
// macros", devolvendo largura aos inputs usados em toda consulta.
const PRIMARY_MACROS: readonly MacroDef[] = [
  { key: 'calories', label: 'Kcal' },
  { key: 'protein', label: 'P' },
  { key: 'carbs', label: 'C' },
  { key: 'fats', label: 'G' },
];

const SECONDARY_MACROS: readonly MacroDef[] = [
  { key: 'fiber', label: 'Fib' },
  { key: 'sodium', label: 'Na' },
];

const ITEM_MACROS: readonly MacroDef[] = [...PRIMARY_MACROS, ...SECONDARY_MACROS];

const macrosToShow = (showAll: boolean): readonly MacroDef[] =>
  showAll ? ITEM_MACROS : PRIMARY_MACROS;

// macro -> chave de meta (só os 4 têm meta; fibra/sódio não).
const MACRO_TARGET: Partial<Record<MacroKey, (typeof TARGETS)[number]['key']>> = {
  calories: 'targetCalories',
  protein: 'targetProtein',
  carbs: 'targetCarbs',
  fats: 'targetFats',
};

// Somar floats gera 175.20000000000002. Arredondamos na exibição e na gravação
// automática de macros; o que já está no banco não é tocado.
const MACRO_DECIMALS: Record<MacroKey, number> = {
  calories: 0, protein: 1, carbs: 1, fats: 1, fiber: 1, sodium: 0,
};

export function fmtMacro(macro: MacroKey, value: number): string {
  const fixed = value.toFixed(MACRO_DECIMALS[macro]);
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
}

// Extrai gramas de uma quantidade escrita à mão: "120 g", "1 xícara (120 g)",
// "0,5 kg", "200 ml". Usa a ÚLTIMA ocorrência, para que a medida caseira que vem
// antes ("1 xícara") não roube o número. Vírgula decimal aceita (pt-BR).
// ml e l entram como 1 g/ml — aproximação usual, exata só para água.
export function parseGrams(text: string): number | null {
  const matches = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|gramas|grama|g|ml|l)\b/gi)];
  const last = matches[matches.length - 1];
  if (!last) return null;
  const n = Number(last[1].replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = last[2].toLowerCase();
  return unit === 'kg' || unit === 'l' ? n * 1000 : n;
}

// Auto-grow single-line text fields: sized like the Inputs they replace, but the
// shadcn Textarea's `field-sizing-content` lets them grow vertically with content.
const GROW = 'min-h-8 resize-none py-1';
const GROW_SM = 'min-h-7 resize-none py-1';

// Com fibra e sódio ocultos sobram duas colunas de espaço na tabela — os quatro
// macros restantes ganham largura. Em w-16 valores de 3 dígitos ("220", "105")
// e decimais ("0,5") saíam cortados.
const MACRO_INPUT_WIDTH = (showAllMacros: boolean) => (showAllMacros ? 'w-16' : 'w-24');

function sum(values: string[]): number {
  return values.reduce((acc, v) => acc + (Number(v) || 0), 0);
}

export function MealPlanEditor({
  patientId,
  canEdit = true,
  planId,
}: {
  patientId: string;
  canEdit?: boolean;
  planId?: string;
}) {
  const isCreate = !planId;
  const query = useMealPlan(planId ?? '');
  const create = useCreateMealPlan(patientId);
  const update = useUpdateMealPlan(patientId);
  const remove = useDeleteMealPlan(patientId);
  const router = useRouter();
  const tour = useTour();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  // Fica true do início do fetch do detalhe até o fim do consumo — cobre a
  // janela em que o job já virou DONE mas o rascunho ainda não chegou ao
  // formulário, para o usuário não conseguir salvar valores antigos por cima.
  const [applying, setApplying] = useState(false);
  const aiJobs = useAiJobs(patientId);
  const consume = useConsumeAiJob();
  // Preferência por nutricionista: o editor é reaberto dezenas de vezes por dia,
  // e perder a escolha a cada abertura irrita. Lida no mount para não divergir do SSR.
  const [showAllMacros, setShowAllMacros] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem('mealPlan.showAllMacros') === '1') setShowAllMacros(true);
    } catch {
      // navegador sem storage: segue com o padrão (só os primários)
    }
  }, []);

  function toggleAllMacros() {
    setShowAllMacros((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('mealPlan.showAllMacros', next ? '1' : '0');
      } catch {
        // preferência não persiste, mas a sessão atual continua respeitando a escolha
      }
      return next;
    });
  }


  const form = useForm<FormValues>({
    resolver: zodResolver(mealPlanSchema) as unknown as Resolver<FormValues>,
    defaultValues: blankDefaults(),
  });
  const meals = useFieldArray({ control: form.control, name: 'meals' });
  // O RHF só mantém `formState.isDirty` atualizado depois que ele é lido durante
  // o render pelo menos uma vez — sem isto, ler isDirty só dentro do handler de
  // aplicação do ajuste (mais abaixo) sempre devolveria `false`.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { isDirty: _isDirtyTracked } = form.formState;

  // Só o ajuste DESTE plano. listForPatient devolve jobs do paciente inteiro, e
  // carregar o rascunho de outro plano aqui substituiria a árvore errada ao salvar.
  // Em modo criação (sem planId) nunca há faixa.
  const adjustInFlight = adjustmentInFlightFor(aiJobs.data, planId);

  const readyAdjust = planId
    ? (aiJobs.data ?? []).find(
        (j) => j.type === 'MEAL_PLAN_ADJUSTMENT' && j.status === 'DONE' && j.mealPlanId === planId,
      )
    : undefined;

  // Um job só pode ser aplicado uma vez. Sem essa trava, o polling (a cada 2s)
  // reaplicaria o mesmo rascunho — e cada aplicação dispara reset() + toast.
  const appliedJobIdRef = useRef<string | null>(null);

  // Job cujo carregamento falhou (getAiJob rejeitou, ou voltou sem `result`).
  // Existe para o formulário NUNCA ficar travado à toa: `useAiJobs` só faz
  // polling enquanto há job PENDING/RUNNING — um job DONE não gera mais
  // refetch automático, e mesmo que gerasse, o structuralSharing do React
  // Query preservaria a mesma referência (o efeito abaixo depende de
  // `readyAdjust` por identidade e não reexecutaria). Ou seja: sem esta
  // marca, uma falha de carga travaria a tela até a pessoa navegar para
  // outra página e voltar. Com ela, o job falho é excluído do cálculo de
  // `readyAdjustUnapplied` (destrava na hora) e uma faixa com "Tentar de
  // novo" assume a recuperação manualmente.
  const loadFailedJobIdRef = useRef<string | null>(null);

  // Verdadeiro enquanto existir um ajuste pronto para este plano que ainda não
  // foi aplicado ao formulário — cobre o intervalo entre o polling detectar o
  // DONE e o efeito abaixo terminar de buscar o detalhe e resetar o form. Uma
  // vez aplicado (ref marcado), um job que ficou DONE mas não pôde ser
  // marcado como consumido (falha de rede) deixa de travar a tela: o rascunho
  // já está na tela e reaplicá-lo de novo seria pior, não travar é o correto.
  // O mesmo vale para um job cujo CARREGAMENTO falhou (loadFailedJobIdRef):
  // nada foi aplicado, mas travar sem chance de recuperação automática seria
  // pior — a faixa de erro assume esse papel. Só entra em jogo com canEdit —
  // sem permissão de edição a aplicação automática nunca roda (o efeito
  // abaixo sai cedo), então não há o que proteger e travar a tela (inclusive
  // Exportar PDF) seria só confuso.
  const readyAdjustUnapplied =
    canEdit &&
    Boolean(readyAdjust) &&
    appliedJobIdRef.current !== readyAdjust?.id &&
    loadFailedJobIdRef.current !== readyAdjust?.id;

  // Verdadeiro quando o ajuste pronto deste plano é exatamente o que falhou
  // ao carregar — controla a faixa de erro com "Tentar de novo".
  const loadFailed = Boolean(readyAdjust) && loadFailedJobIdRef.current === readyAdjust?.id;

  async function applyReadyAdjust(jobId: string) {
    setApplying(true);
    try {
      let detail: AiJobDetail;
      try {
        detail = await getAiJob(jobId);
      } catch {
        // Falhou ao buscar o detalhe: não marca como aplicado (para uma
        // eventual repetição automática poder funcionar) e marca como
        // falho, para destravar a tela e oferecer "Tentar de novo".
        appliedJobIdRef.current = null;
        loadFailedJobIdRef.current = jobId;
        toast.error('Não foi possível carregar o ajuste.');
        return;
      }
      if (!detail.result) {
        // Job DONE mas sem rascunho para aplicar — sem isto não haveria o
        // que consumir, e o job ficaria pendurado sem toast, sem consumo e
        // sem chance de nova tentativa. Tratamos como falha de carga.
        appliedJobIdRef.current = null;
        loadFailedJobIdRef.current = jobId;
        toast.error('Não foi possível carregar o ajuste.');
        return;
      }
      // Uma tentativa anterior deste MESMO job pode ter falhado; carregou
      // agora, então a marca de falha não vale mais.
      loadFailedJobIdRef.current = null;
      // isDirty precisa ser lido ANTES do reset — reset() zera o dirty flag.
      const overwritingDirty = form.formState.isDirty;
      const draftValues = draftToDefaults(detail.result);
      form.reset(draftValues);

      // O ajuste só existe para um plano já salvo (nunca há faixa em modo
      // criação) — a guarda é redundante com o efeito que dispara esta
      // função (que já checa isCreate), mas fica explícita aqui também.
      if (!isCreate && planId) {
        try {
          // Usa os MESMOS valores do rascunho (não form.getValues() logo
          // após o reset) para não depender do momento em que o RHF propaga
          // o novo estado. Mesmo caminho de salvamento do onSubmit para um
          // plano existente.
          await update.mutateAsync({ id: planId, body: draftValues as unknown as MealPlanFormValues });
          // Reseta de novo com os MESMOS valores: se algo tiver disparado um
          // form.reset() concorrente durante o await acima (ex.: o efeito
          // que observa query.data, caso o cache seja invalidado), a tela
          // não pode divergir do que acabou de ser persistido — o que está
          // na tela precisa continuar sendo exatamente o que está salvo,
          // sem ficar "sujo" (isDirty).
          form.reset(draftValues);
          if (overwritingDirty) {
            toast.success(
              'Ajuste da IA aplicado e salvo por cima das suas alterações não salvas.',
              { duration: 8000 },
            );
          } else {
            toast.success('Ajuste da IA aplicado e salvo.');
          }
        } catch {
          // O rascunho fica na tela (não desfazemos o reset): desfazer
          // devolveria valores antigos sem aviso, pior do que deixar o
          // rascunho visível para revisão e salvamento manual.
          toast.error('Ajuste aplicado na tela, mas não foi possível salvar. Revise e salve.');
        }
      }

      try {
        await consume.mutateAsync(jobId);
      } catch {
        // O rascunho já está na tela e o ref já foi marcado (o efeito que
        // chamou esta função marca antes de chamar) — reaplicar no próximo
        // poll seria pior: apagaria em silêncio qualquer edição feita em
        // cima do rascunho recém-aplicado. Só avisamos.
        toast.info('Ajuste aplicado, mas não foi possível marcá-lo como concluído.');
      }
    } finally {
      setApplying(false);
    }
  }

  // Ação do botão "Tentar de novo" na faixa de erro: limpa a marca de falha
  // e dispara a aplicação de novo, desta vez por escolha explícita do
  // usuário. Marca appliedJobIdRef como o efeito automático faria — sem
  // isso, um retry BEM-SUCEDIDO deixaria `readyAdjustUnapplied` voltando a
  // `true` no render seguinte (nenhum ref bateria com o id do job) e a tela
  // travaria de novo logo depois de ter sido corrigida.
  function retryReadyAdjust() {
    if (!readyAdjust) return;
    loadFailedJobIdRef.current = null;
    appliedJobIdRef.current = readyAdjust.id;
    void applyReadyAdjust(readyAdjust.id);
  }

  // Carrega o rascunho pronto sozinho, sem esperar clique. Em modo criação
  // (sem planId) e sem permissão de edição, nunca aplica. Um job já marcado
  // como falho não é retomado automaticamente — só pelo clique em "Tentar de
  // novo" (evita reaplicar escondido logo depois que o usuário acabou de ver
  // o erro).
  useEffect(() => {
    if (isCreate || !canEdit || !readyAdjust) return;
    if (appliedJobIdRef.current === readyAdjust.id) return;
    if (loadFailedJobIdRef.current === readyAdjust.id) return;
    appliedJobIdRef.current = readyAdjust.id;
    void applyReadyAdjust(readyAdjust.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreate, canEdit, readyAdjust]);

  // Trava o formulário: ajuste em voo (PENDING/RUNNING), ajuste pronto ainda
  // não aplicado, ou aplicação em andamento (fetch do detalhe + consumo). Um
  // ajuste cujo carregamento falhou nunca trava — ver loadFailedJobIdRef.
  const locked = Boolean(adjustInFlight) || readyAdjustUnapplied || applying;

  // Com o overlay fixo cobrindo a janela, rolar a página por trás dele só
  // confunde: não dá para editar nada mesmo. Trava a rolagem enquanto durar e
  // devolve o valor anterior ao sair (inclusive se o componente desmontar).
  useEffect(() => {
    if (!canEdit || !locked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [canEdit, locked]);

  useEffect(() => {
    if (!isCreate && query.data) form.reset(toDefaults(query.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  useEffect(() => {
    if (isCreate || query.isLoading || !query.data) return;
    void tour.notifyChapterActionSucceeded();
  }, [isCreate, query.data, query.isLoading, tour]);

  useEffect(() => {
    return registerFixture('meal-plan', () => {
      form.reset({
        title: 'Plano demonstração',
        objective: '',
        targetCalories: '',
        targetProtein: '',
        targetCarbs: '',
        targetFats: '',
        meals: [
          {
            name: 'Café da manhã',
            timeLabel: '',
            instructions: '',
            options: [
              {
                label: 'Opção A',
                items: [
                  {
                    foodName: 'Aveia',
                    foodId: '',
                    quantity: '40 g',
                    grams: '',
                    calories: '',
                    protein: '',
                    carbs: '',
                    fats: '',
                    fiber: '',
                    sodium: '',
                  },
                ],
              },
            ],
          },
        ],
      });
    });
  }, [form]);

  const watched = form.watch('meals');
  // Options are interchangeable alternatives — the day total counts only the first
  // (primary) option of each meal.
  function totalFor(macro: MacroKey): number {
    return sum((watched ?? []).flatMap((m) => (m.options?.[0]?.items ?? []).map((it) => it[macro])));
  }

  const targetsQuery = useNutritionTargets(patientId);
  const latestTarget = targetsQuery.data?.[0];

  function applyLatestTarget() {
    if (!latestTarget) return;
    form.setValue('targetCalories', String(latestTarget.targetCalories));
    form.setValue('targetProtein', String(latestTarget.proteinGrams));
    form.setValue('targetCarbs', String(latestTarget.carbGrams));
    form.setValue('targetFats', String(latestTarget.fatGrams));
  }

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      if (isCreate) {
        const created = await create.mutateAsync({ patientId, ...(values as unknown as MealPlanFormValues) });
        toast.success('Plano criado.');
        router.replace(`/patients/${patientId}/planos/${created.id}`);
      } else {
        await update.mutateAsync({ id: planId!, body: values as unknown as MealPlanFormValues });
        toast.success('Plano salvo.');
        await tour.notifyChapterActionSucceeded();
      }
    } catch (err) {
      setFormError(
        err instanceof ApiError ? 'Não foi possível salvar o plano.' : 'Erro inesperado ao salvar.',
      );
    }
  }

  async function onExport() {
    if (isCreate) return;
    setExporting(true);
    try {
      await downloadMealPlanPdf(planId!);
    } catch {
      toast.error('Não foi possível exportar o PDF.');
    } finally {
      setExporting(false);
    }
  }

  async function onDelete() {
    if (isCreate) return;
    try {
      await remove.mutateAsync(planId!);
      toast.success('Plano excluído.');
      router.push(`/patients/${patientId}`);
    } catch {
      toast.error('Não foi possível excluir o plano.');
    }
  }

  if (!isCreate && query.isLoading) {
    return <Skeleton className="h-64 w-full max-w-5xl" />;
  }
  if (!isCreate && (query.isError || !query.data)) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <BackToPatient patientId={patientId} />
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Plano não encontrado.
        </div>
      </div>
    );
  }

  const pending = form.formState.isSubmitting || create.isPending || update.isPending;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <BackToPatient patientId={patientId} />
        {!isCreate && (
          <div className="flex gap-2">
            {canEdit && (
              <Button
                type="button"
                size="sm"
                className="rounded-full shadow-sm shadow-primary/30"
                onClick={() => setAdjusting(true)}
                disabled={locked}
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Solicitar ajustes à IA
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={onExport}
              disabled={exporting || locked}
              data-tour="patients.plan.pdf"
            >
              {exporting ? 'Exportando…' : 'Exportar PDF'}
            </Button>
          </div>
        )}
      </div>
      <div className="relative">
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <fieldset disabled={!canEdit || locked} className="m-0 min-w-0 space-y-4 border-0 p-0">
          {/* Header */}
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="mp-title">Título</label>
            <Textarea id="mp-title" rows={1} className={GROW} placeholder="Título do plano" {...form.register('title')} />
            <Textarea rows={1} className={GROW} placeholder="Objetivo" aria-label="Objetivo" {...form.register('objective')} />
          </div>

          {/* Metas (por dia) */}
          <div className="rounded-xl border bg-card p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Metas (por dia)</p>
              {canEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={applyLatestTarget}
                  disabled={!latestTarget}
                >
                  Usar Meta atual
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {TARGETS.map((t) => (
                <label key={t.key} className="text-xs">
                  <span className="mb-1 block text-muted-foreground">{t.label}</span>
                  <Input type="number" inputMode="decimal" step="any" {...form.register(t.key)} />
                </label>
              ))}
            </div>
          </div>

          {canEdit && loadFailed && (
            <div
              className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 text-sm text-muted-foreground"
              data-testid="adjust-load-failed"
            >
              <span>Não foi possível carregar o ajuste da IA.</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={retryReadyAdjust}
                disabled={applying}
              >
                Tentar de novo
              </Button>
            </div>
          )}

          {/* Totals bar (first option per meal) */}
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-4 rounded-xl border bg-card p-3">
            {macrosToShow(showAllMacros).map((m) => {
              const total = totalFor(m.key);
              const targetKey = MACRO_TARGET[m.key];
              const target = targetKey ? Number(form.watch(targetKey)) || 0 : 0;
              return (
                <div key={m.key} className="text-center">
                  <b data-testid={`total-${m.key}`} className="block text-sm">
                    {fmtMacro(m.key, total)}
                    {target > 0 && <span className="text-muted-foreground">/{target}</span>}
                  </b>
                  <span className="text-[10px] text-muted-foreground">{m.label}</span>
                </div>
              );
            })}
            <button
              type="button"
              className="ml-auto text-xs font-semibold text-primary"
              onClick={toggleAllMacros}
              aria-expanded={showAllMacros}
            >
              {showAllMacros ? 'Ocultar outros macros' : 'Ver outros macros'}
            </button>
          </div>

          {/* Meal cards */}
          {meals.fields.map((mealField, mealIndex) => (
            <MealCard
              key={mealField.id}
              control={form.control}
              register={form.register}
              setValue={form.setValue}
              mealIndex={mealIndex}
              canEdit={canEdit}
              showAllMacros={showAllMacros}
              isFirst={mealIndex === 0}
              isLast={mealIndex === meals.fields.length - 1}
              onRemove={() => meals.remove(mealIndex)}
              onMoveUp={() => meals.swap(mealIndex, mealIndex - 1)}
              onMoveDown={() => meals.swap(mealIndex, mealIndex + 1)}
            />
          ))}

          {canEdit && (
            <Button type="button" variant="outline" className="rounded-full" onClick={() => meals.append(blankMeal())}>
              + Adicionar refeição
            </Button>
          )}
        </fieldset>

        {formError && <p className="text-sm text-destructive">{formError}</p>}

        {canEdit && (
          <div className="flex items-center gap-2 border-t pt-4">
            {!isCreate &&
              (confirmingDelete ? (
                <span className="mr-auto flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Excluir? Esta ação não pode ser desfeita.</span>
                  <Button type="button" variant="outline" className="rounded-full" onClick={() => setConfirmingDelete(false)}>
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={onDelete}
                    disabled={remove.isPending || locked}
                  >
                    Excluir
                  </Button>
                </span>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="mr-auto rounded-full text-destructive"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={locked}
                >
                  Excluir
                </Button>
              ))}
            <Button
              type="submit"
              className="rounded-full"
              disabled={pending || locked}
              data-tour="patients.plan.save"
            >
              {pending ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        )}
      </form>

      {canEdit && locked && (
        <div
          data-testid="adjust-lock-overlay"
          role="status"
          aria-live="polite"
          // `fixed`, não `absolute`: num plano longo o container do formulário fica
          // muito mais alto que a tela, e um overlay absoluto centraliza o cartão no
          // meio do formulário — longe da vista de quem está no topo. Fixo, ele fica
          // sempre no centro da janela.
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-[2px]"
        >
          <div className="flex flex-col items-center gap-2 rounded-xl border bg-card px-6 py-5 text-center shadow-lg">
            <span className="relative flex h-10 w-10 items-center justify-center">
              <Loader2 className="absolute h-10 w-10 animate-spin text-primary/40" aria-hidden="true" />
              <Lock className="h-5 w-5 text-primary" aria-hidden="true" />
            </span>
            <p className="text-sm font-semibold">Ajuste em andamento</p>
            <p className="text-xs text-muted-foreground">
              A IA está reescrevendo este plano. O formulário fica bloqueado até terminar.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => router.push(`/patients/${patientId}`)}
            >
              Voltar para o paciente
            </Button>
          </div>
        </div>
      )}
      </div>

      {!isCreate && (
        <AiAdjustDialog
          open={adjusting}
          onOpenChange={setAdjusting}
          planId={planId!}
          patientId={patientId}
        />
      )}
    </div>
  );
}

function MealCard({
  control,
  register,
  setValue,
  mealIndex,
  canEdit,
  showAllMacros,
  isFirst,
  isLast,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  setValue: UseFormSetValue<FormValues>;
  mealIndex: number;
  canEdit: boolean;
  showAllMacros: boolean;
  isFirst: boolean;
  isLast: boolean;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const options = useFieldArray({ control, name: `meals.${mealIndex}.options` as const });

  return (
    <div data-testid="meal-card" className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Textarea rows={1} className={`max-w-48 ${GROW}`} placeholder="Refeição" aria-label="Nome da refeição" {...register(`meals.${mealIndex}.name`)} />
        <Textarea rows={1} className={`max-w-28 ${GROW}`} placeholder="08:00" aria-label="Horário" {...register(`meals.${mealIndex}.timeLabel`)} />
        {canEdit && (
          <span className="ml-auto flex gap-1">
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onMoveUp} disabled={isFirst} aria-label="Mover refeição para cima">↑</Button>
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onMoveDown} disabled={isLast} aria-label="Mover refeição para baixo">↓</Button>
            <Button type="button" variant="outline" size="sm" className="rounded-full text-destructive" onClick={onRemove} aria-label="Remover refeição">✕</Button>
          </span>
        )}
      </div>

      <Textarea rows={1} placeholder="Instruções (opcional)" aria-label="Instruções" {...register(`meals.${mealIndex}.instructions`)} />

      <div className="mt-3 space-y-3">
        {options.fields.map((optionField, optionIndex) => (
          <OptionCard
            key={optionField.id}
            control={control}
            register={register}
            setValue={setValue}
            mealIndex={mealIndex}
            optionIndex={optionIndex}
            canEdit={canEdit}
            showAllMacros={showAllMacros}
            isFirst={optionIndex === 0}
            isLast={optionIndex === options.fields.length - 1}
            onRemove={() => options.remove(optionIndex)}
            onMoveUp={() => options.swap(optionIndex, optionIndex - 1)}
            onMoveDown={() => options.swap(optionIndex, optionIndex + 1)}
          />
        ))}
      </div>

      {canEdit && (
        <button type="button" className="mt-3 text-xs font-semibold text-primary" onClick={() => options.append(blankOption())} aria-label="Adicionar opção">
          + Adicionar opção
        </button>
      )}
    </div>
  );
}

function OptionCard({
  control,
  register,
  setValue,
  mealIndex,
  optionIndex,
  canEdit,
  showAllMacros,
  isFirst,
  isLast,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  setValue: UseFormSetValue<FormValues>;
  mealIndex: number;
  optionIndex: number;
  canEdit: boolean;
  showAllMacros: boolean;
  isFirst: boolean;
  isLast: boolean;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const items = useFieldArray({ control, name: `meals.${mealIndex}.options.${optionIndex}.items` as const });
  const watchedItems = useWatch({ control, name: `meals.${mealIndex}.options.${optionIndex}.items` }) as ItemValues[] | undefined;
  const subtotal = (macro: MacroKey) =>
    sum((watchedItems ?? []).map((it) => it[macro]));

  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const foodCache = useRef<Record<string, Food>>({});

  const setField = (itemIndex: number, field: string, value: string) =>
    setValue(
      `meals.${mealIndex}.options.${optionIndex}.items.${itemIndex}.${field}` as Path<FormValues>,
      value,
    );

  function fillMacros(itemIndex: number, food: Food, grams: number) {
    const m = macrosForPortion(food, grams);
    for (const { key } of ITEM_MACROS) setField(itemIndex, key, fmtMacro(key, m[key]));
  }

  function onPickFood(itemIndex: number, food: Food) {
    foodCache.current[food.id] = food;
    setField(itemIndex, 'foodId', food.id);
    setField(itemIndex, 'foodName', food.name);
    let grams = parseGrams(watchedItems?.[itemIndex]?.quantity ?? '');
    // Sem porção declarada, 100 g é o padrão da TACO — deixamos explícito no
    // campo em vez de assumir em silêncio.
    if (grams == null) {
      grams = 100;
      setField(itemIndex, 'quantity', '100 g');
    }
    setField(itemIndex, 'grams', String(grams));
    fillMacros(itemIndex, food, grams);
  }

  // `grams` continua existindo no formulário e no banco — some só da tela. É ele
  // que alimenta o recálculo pela TACO, então segue sincronizado com o texto.
  function onQuantityChange(itemIndex: number, text: string) {
    const grams = parseGrams(text);
    setField(itemIndex, 'grams', grams == null ? '' : String(grams));
    const foodId = watchedItems?.[itemIndex]?.foodId;
    const food = foodId ? foodCache.current[foodId] : undefined;
    if (food && grams != null) fillMacros(itemIndex, food, grams);
  }

  return (
    <div data-testid="option-card" className="rounded-lg border bg-background p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Textarea
          rows={1}
          className={`max-w-40 ${GROW_SM}`}
          placeholder={`Opção ${optionIndex + 1}`}
          aria-label="Rótulo da opção"
          {...register(`meals.${mealIndex}.options.${optionIndex}.label`)}
        />
        {canEdit && (
          <span className="ml-auto flex gap-1">
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onMoveUp} disabled={isFirst} aria-label="Mover opção para cima">↑</Button>
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onMoveDown} disabled={isLast} aria-label="Mover opção para baixo">↓</Button>
            <Button type="button" variant="outline" size="sm" className="rounded-full text-destructive" onClick={onRemove} aria-label="Remover opção">✕</Button>
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase text-muted-foreground">
              {canEdit && <th />}
              <th className="py-1">Alimento</th>
              <th className="py-1">Quantidade</th>
              {macrosToShow(showAllMacros).map((m) => (
                <th key={m.key} className="py-1">{m.label}</th>
              ))}
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {items.fields.map((itemField, itemIndex) => {
              const quantityField = register(
                `meals.${mealIndex}.options.${optionIndex}.items.${itemIndex}.quantity`,
              );
              return (
              <tr key={itemField.id}>
                {canEdit && (
                  <td className="py-1 pr-1 align-top">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      aria-label="Buscar alimento"
                      onClick={() => setPickerFor(itemIndex)}
                    >
                      🔍
                    </Button>
                  </td>
                )}
                <td className="py-1 pr-1 align-top"><Textarea rows={1} className={`w-48 ${GROW_SM}`} aria-label="Alimento" {...register(`meals.${mealIndex}.options.${optionIndex}.items.${itemIndex}.foodName`)} /></td>
                <td className="py-1 pr-1 align-top">
                  <Textarea
                    rows={1}
                    className={`w-40 ${GROW_SM}`}
                    placeholder="120 g"
                    aria-label="Quantidade"
                    {...quantityField}
                    onChange={(e) => {
                      void quantityField.onChange(e);
                      onQuantityChange(itemIndex, e.target.value);
                    }}
                  />
                </td>
                {macrosToShow(showAllMacros).map((m) => (
                  <td key={m.key} className="py-1 pr-1 align-top">
                    <Input className={`h-7 ${MACRO_INPUT_WIDTH(showAllMacros)}`} type="number" inputMode="decimal" step="any" aria-label={m.label}
                      {...register(`meals.${mealIndex}.options.${optionIndex}.items.${itemIndex}.${m.key}` as const)} />
                  </td>
                ))}
                {canEdit && (
                  <td className="py-1 align-top">
                    <span className="flex gap-1">
                      <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => items.swap(itemIndex, itemIndex - 1)} disabled={itemIndex === 0} aria-label="Mover item para cima">↑</Button>
                      <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => items.swap(itemIndex, itemIndex + 1)} disabled={itemIndex === items.fields.length - 1} aria-label="Mover item para baixo">↓</Button>
                      <Button type="button" variant="outline" size="sm" className="rounded-full text-destructive" onClick={() => items.remove(itemIndex)} aria-label="Remover item">✕</Button>
                    </span>
                  </td>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        {macrosToShow(showAllMacros).map((m) => (
          <span key={m.key} data-testid={`option-subtotal-${m.key}`}>
            {m.label} {fmtMacro(m.key, subtotal(m.key))}
          </span>
        ))}
      </div>

      {canEdit && (
        <button type="button" className="mt-2 text-xs font-semibold text-primary" onClick={() => items.append(blankItem())}>
          + Adicionar item
        </button>
      )}

      <FoodPickerDialog
        open={pickerFor !== null}
        onOpenChange={(o) => { if (!o) setPickerFor(null); }}
        onPick={(food) => { if (pickerFor !== null) onPickFood(pickerFor, food); setPickerFor(null); }}
      />
    </div>
  );
}

function BackToPatient({ patientId }: { patientId: string }) {
  return (
    <Link
      href={`/patients/${patientId}`}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      Voltar ao paciente
    </Link>
  );
}
