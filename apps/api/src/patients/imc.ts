// Body Mass Index = weight(kg) / height(m)^2, rounded to 1 decimal.
// Returns null unless both inputs are present and strictly positive.
export function computeImc(height: number | null, weightKg: number | null): number | null {
  if (height == null || height <= 0 || weightKg == null || weightKg <= 0) {
    return null;
  }
  const meters = height / 100;
  return Math.round((weightKg / (meters * meters)) * 10) / 10;
}
