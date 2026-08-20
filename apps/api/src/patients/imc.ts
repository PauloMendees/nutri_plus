// Body Mass Index = weight(kg) / height(m)^2, rounded to 2 decimals.
// 1 decimal would turn 24.98 into 25.0 and flip the WHO overweight bound.
export function computeImc(height: number | null, weightKg: number | null): number | null {
  if (height == null || height <= 0 || weightKg == null || weightKg <= 0) {
    return null;
  }
  const meters = height / 100;
  return Math.round((weightKg / (meters * meters)) * 100) / 100;
}
