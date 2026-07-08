import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';

export interface PdfBranding {
  displayName: string | null;
  logoDataUrl: string | null;
}

export interface PdfMealItem {
  foodName: string | null;
  quantity: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
}

export interface PdfMealOption {
  label: string | null;
  items: PdfMealItem[];
}

export interface PdfMeal {
  name: string | null;
  timeLabel: string | null;
  instructions: string | null;
  options: PdfMealOption[];
}

export interface PdfMealPlan {
  title: string | null;
  objective: string | null;
  createdAt: Date | string;
  targetCalories: number | null;
  targetProtein: number | null;
  targetCarbs: number | null;
  targetFats: number | null;
  meals: PdfMeal[];
}

const num = (n: number | null) => (n == null ? 0 : n);
const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString('pt-BR');

export function buildMealPlanDocDefinition(
  plan: PdfMealPlan,
  branding: PdfBranding,
): TDocumentDefinitions {
  const content: Content[] = [];

  // Header: optional logo + display name.
  const headerCols: Content[] = [];
  if (branding.logoDataUrl) {
    headerCols.push({ image: branding.logoDataUrl, fit: [80, 80], width: 80 });
  }
  headerCols.push({
    text: branding.displayName ?? '',
    style: 'brand',
    margin: [branding.logoDataUrl ? 12 : 0, 8, 0, 0],
  });
  content.push({ columns: headerCols, columnGap: 8 });
  content.push({
    canvas: [{ type: 'line', x1: 0, y1: 4, x2: 515, y2: 4, lineWidth: 0.5, lineColor: '#cccccc' }],
    margin: [0, 4, 0, 8],
  });

  // Title / objective / date.
  content.push({ text: plan.title ?? 'Plano Alimentar', style: 'title' });
  if (plan.objective) content.push({ text: plan.objective, style: 'muted' });
  content.push({ text: fmtDate(plan.createdAt), style: 'muted', margin: [0, 0, 0, 8] });

  // Daily targets (omitted when all null).
  const hasTargets = [plan.targetCalories, plan.targetProtein, plan.targetCarbs, plan.targetFats].some(
    (t) => t != null,
  );
  if (hasTargets) {
    content.push({
      table: {
        widths: ['*', '*', '*', '*'],
        body: [
          [
            { text: 'Kcal', style: 'th' },
            { text: 'Proteína', style: 'th' },
            { text: 'Carbo', style: 'th' },
            { text: 'Gordura', style: 'th' },
          ],
          [
            { text: String(num(plan.targetCalories)) },
            { text: String(num(plan.targetProtein)) },
            { text: String(num(plan.targetCarbs)) },
            { text: String(num(plan.targetFats)) },
          ],
        ],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 12],
    });
  }

  // Meals -> options -> items.
  plan.meals.forEach((meal, mi) => {
    const heading = [meal.name ?? `Refeição ${mi + 1}`, meal.timeLabel].filter(Boolean).join(' — ');
    content.push({ text: heading, style: 'meal', margin: [0, 8, 0, 2] });
    if (meal.instructions) content.push({ text: meal.instructions, style: 'muted', margin: [0, 0, 0, 4] });

    meal.options.forEach((option, oi) => {
      content.push({ text: option.label || `Opção ${oi + 1}`, style: 'option', margin: [0, 4, 0, 2] });

      const rows: TableCell[][] = [
        [
          { text: 'Alimento', style: 'th' },
          { text: 'Qtd', style: 'th' },
          { text: 'Kcal', style: 'th' },
          { text: 'P', style: 'th' },
          { text: 'C', style: 'th' },
          { text: 'G', style: 'th' },
        ],
      ];
      const sub = { c: 0, p: 0, cb: 0, f: 0 };
      option.items.forEach((it) => {
        sub.c += num(it.calories);
        sub.p += num(it.protein);
        sub.cb += num(it.carbs);
        sub.f += num(it.fats);
        rows.push([
          { text: it.foodName ?? '' },
          { text: it.quantity ?? '' },
          { text: String(num(it.calories)) },
          { text: String(num(it.protein)) },
          { text: String(num(it.carbs)) },
          { text: String(num(it.fats)) },
        ]);
      });
      rows.push([
        { text: 'Subtotal', style: 'subtotal', colSpan: 2 },
        {},
        { text: String(sub.c), style: 'subtotal' },
        { text: String(sub.p), style: 'subtotal' },
        { text: String(sub.cb), style: 'subtotal' },
        { text: String(sub.f), style: 'subtotal' },
      ]);

      content.push({
        table: { widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'], body: rows },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 6],
      });
    });
  });

  return {
    content,
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    pageMargins: [40, 40, 40, 40],
    styles: {
      brand: { fontSize: 14, bold: true },
      title: { fontSize: 16, bold: true },
      muted: { fontSize: 9, color: '#666666' },
      meal: { fontSize: 12, bold: true },
      option: { fontSize: 10, bold: true, color: '#444444' },
      th: { bold: true, fontSize: 8, color: '#666666' },
      subtotal: { bold: true, fontSize: 8 },
    },
    footer: (currentPage: number, pageCount: number): Content => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: 'center',
      fontSize: 8,
      color: '#999999',
      margin: [0, 8, 0, 0],
    }),
  };
}
