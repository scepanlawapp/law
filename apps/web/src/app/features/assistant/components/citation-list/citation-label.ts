/** Tariff items are stored with their own label ("Tarifni broj 5"), not an article number. */
export function isArticleNumber(articleNumber: string): boolean {
  return /^[0-9]/.test(articleNumber);
}

export function matchPercent(score: number): number {
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}
