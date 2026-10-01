// Datas do painel admin (instantes ISO) no dia de São Paulo.
export function formatAdminDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}
