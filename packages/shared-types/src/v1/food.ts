export interface Food {
  id: string;
  tacoId: number | null;
  name: string;
  group: string | null;
  energyKcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  lipid: number | null;
  fiber: number | null;
  sodium: number | null;
}
