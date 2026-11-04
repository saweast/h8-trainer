/** Body measurement metrics. Ranges mirror the CHECK constraints on public.body_measurements. */
export const BODY_METRICS = [
  { key: 'weightKg', column: 'weight_kg', unit: 'kg', min: 20, max: 400, decimals: 2 },
  { key: 'bodyFatPct', column: 'body_fat_pct', unit: 'pct', min: 1, max: 70, decimals: 1 },
  { key: 'chestCm', column: 'chest_cm', unit: 'cm', min: 10, max: 300, decimals: 1 },
  { key: 'waistCm', column: 'waist_cm', unit: 'cm', min: 10, max: 300, decimals: 1 },
  { key: 'hipsCm', column: 'hips_cm', unit: 'cm', min: 10, max: 300, decimals: 1 },
  { key: 'armCm', column: 'arm_cm', unit: 'cm', min: 10, max: 300, decimals: 1 },
  { key: 'thighCm', column: 'thigh_cm', unit: 'cm', min: 10, max: 300, decimals: 1 },
] as const

export type BodyMetric = (typeof BODY_METRICS)[number]
export type BodyMetricKey = BodyMetric['key']

export type BodyValues = Record<BodyMetricKey, number | null>

export interface BodyEntry extends BodyValues {
  id: string
  /** Local date, "yyyy-MM-dd". */
  measuredAt: string
  notes: string | null
}

export const metricByKey = Object.fromEntries(BODY_METRICS.map((m) => [m.key, m])) as Record<BodyMetricKey, BodyMetric>

/**
 * Parses a typed value ("78,4" or "78.4"). Empty → null (not measured). Returns 'invalid' for
 * text that isn't a number in range or has too many decimals.
 */
export function parseMetric(text: string, metric: BodyMetric): number | null | 'invalid' {
  const normalized = text.trim().replace(',', '.')
  if (!normalized) return null
  const pattern = metric.decimals === 2 ? /^\d{1,3}(\.\d{1,2})?$/ : /^\d{1,3}(\.\d)?$/
  if (!pattern.test(normalized)) return 'invalid'
  const value = Number(normalized)
  return value >= metric.min && value <= metric.max ? value : 'invalid'
}

export interface LatestValue {
  value: number
  measuredAt: string
  /** Change since the previous entry that has this metric (null when there is none). */
  delta: number | null
}

/** Entries are expected newest first. */
export function latestWithDelta(entries: BodyEntry[], key: BodyMetricKey): LatestValue | null {
  const withValue = entries.filter((e) => e[key] !== null)
  const [latest, previous] = withValue
  if (!latest) return null
  const value = latest[key]!
  const delta = previous ? Math.round((value - previous[key]!) * 100) / 100 : null
  return { value, measuredAt: latest.measuredAt, delta }
}

/** Oldest-first points for a chart of one metric. */
export function metricSeries(entries: BodyEntry[], key: BodyMetricKey): { measuredAt: string; value: number }[] {
  return entries
    .filter((e) => e[key] !== null)
    .map((e) => ({ measuredAt: e.measuredAt, value: e[key]! }))
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
}

export function hasAnyValue(values: Partial<BodyValues>): boolean {
  return BODY_METRICS.some((m) => values[m.key] !== null && values[m.key] !== undefined)
}
