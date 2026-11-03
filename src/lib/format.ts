const cache = new Map<string, Intl.NumberFormat>()

function numberFormat(locale: string, maxFraction: number): Intl.NumberFormat {
  const key = `${locale}:${maxFraction}`
  let nf = cache.get(key)
  if (!nf) {
    nf = new Intl.NumberFormat(locale, { maximumFractionDigits: maxFraction })
    cache.set(key, nf)
  }
  return nf
}

/** 62.5 → "62,5" (uk) / "62.5" (en). Weights keep up to two decimals (e.g. 1.25 kg plates). */
export function formatKg(value: number, locale: string): string {
  return numberFormat(locale, 2).format(value)
}

/** Total volume rounded to whole kilograms with grouping: 8450 → "8 450". */
export function formatVolume(value: number, locale: string): string {
  return numberFormat(locale, 0).format(Math.round(value))
}

/** Parses user input like "62,5" or "62.5"; returns null for anything that isn't a valid weight. */
export function parseWeight(input: string): number | null {
  const normalized = input.trim().replace(',', '.')
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(normalized)) return null
  const value = Number(normalized)
  return value <= 1000 ? value : null
}
