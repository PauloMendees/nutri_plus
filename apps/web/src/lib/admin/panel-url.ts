// Chaves do painel admin que sobrevivem à ida ao detalhe e à volta.
const PANEL_KEYS = ['tab', 'search', 'confirmed', 'plan', 'createdFrom', 'createdTo', 'page'] as const;

// Link do detalhe da nutricionista. A query do painel vai junto em ?voltar=
// para o "Voltar para o painel" reabrir os mesmos filtros e página — o Link para
// /admin puro os perderia, e router.back() falha quando o detalhe é aberto direto.
export function adminNutritionistHref(id: string, panelQuery: string): string {
  const base = `/admin/nutritionists/${encodeURIComponent(id)}`;
  return panelQuery ? `${base}?voltar=${encodeURIComponent(panelQuery)}` : base;
}

// Destino do "Voltar para o painel". O ?voltar= vem da URL: só as chaves do
// painel são aceitas e o destino é sempre /admin (nada de redirecionar para fora).
export function adminPanelHref(voltar: string | string[] | undefined): string {
  const raw = Array.isArray(voltar) ? voltar[0] : voltar;
  if (!raw) return '/admin';
  const src = new URLSearchParams(raw);
  const out = new URLSearchParams();
  for (const k of PANEL_KEYS) {
    const v = src.get(k);
    if (v) out.set(k, v);
  }
  const qs = out.toString();
  return qs ? `/admin?${qs}` : '/admin';
}
