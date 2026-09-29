// Nome a exibir da nutricionista: o "Nome de exibição" das Configurações quando
// preenchido, senão o nome do cadastro. Em branco conta como não preenchido.
export function preferredNutritionistName(
  displayName: string | null | undefined,
  name: string,
): string {
  return displayName?.trim() || name;
}

// Basic, patient-facing view of the patient's nutritionist (GET /me/nutritionist).
export interface NutritionistContact {
  name: string;
  displayName: string | null;
  email: string;
  crn: string | null;
  logoUrl: string | null;
  whatsappNumber: string | null;
}
