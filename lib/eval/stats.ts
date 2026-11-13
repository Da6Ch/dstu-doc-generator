// lib/eval/stats.ts
// Описова статистика для серій вимірювань.

export interface Summary {
  n: number;
  mean: number;
  sd: number; // вибіркове стандартне відхилення (n − 1)
  min: number;
  max: number;
  median: number;
  p95: number; // за методом найближчого рангу
  ci95: number; // півширина довірчого інтервалу для середнього
}

const T95 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228];

/** Критичне значення t-розподілу Стьюдента (двобічне, α = 0,05) */
export function tCritical95(df: number): number {
  if (df < 1) return Number.NaN;
  if (df <= 10) return T95[df - 1];
  if (df <= 20) return 2.086;
  if (df <= 30) return 2.042;
  return 1.96;
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

export function summarize(values: number[]): Summary | null {
  const xs = values.filter((v) => Number.isFinite(v));
  const n = xs.length;
  if (n === 0) return null;

  const sorted = [...xs].sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const variance =
    n > 1 ? xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  const sd = Math.sqrt(variance);
  const median =
    n % 2 === 1
      ? sorted[(n - 1) / 2]
      : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;

  return {
    n,
    mean,
    sd,
    min: sorted[0],
    max: sorted[n - 1],
    median,
    p95: percentile(sorted, 95),
    ci95: n > 1 ? tCritical95(n - 1) * (sd / Math.sqrt(n)) : 0,
  };
}
