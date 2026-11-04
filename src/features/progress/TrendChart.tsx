import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'

export interface TrendPoint {
  /** Short date label for the axis and tooltip ("4 лис"). */
  label: string
  value: number
}

interface TrendChartProps {
  points: TrendPoint[]
  seriesLabel: string
  formatValue: (value: number) => string
  /** Unit shown after values in the tooltip, e.g. "кг". */
  unit: string
}

/**
 * Single-series trend: 2px line, ≥8px dots with a surface ring, solid hairline grid,
 * crosshair tooltip. One series, so no legend box — the heading names the metric.
 */
export function TrendChart({ points, seriesLabel, formatValue, unit }: TrendChartProps) {
  const config = { value: { label: seriesLabel, color: 'var(--chart-1)' } } satisfies ChartConfig

  return (
    <ChartContainer config={config} className="aspect-auto h-52 w-full">
      <LineChart data={points} margin={{ top: 12, right: 12, bottom: 0, left: 0 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
        />
        <YAxis
          width={44}
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          domain={['auto', 'auto']}
          allowDecimals={false}
          tickFormatter={(v: number) => formatValue(v)}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
        />
        <ChartTooltip
          cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }}
          content={({ active, payload }) => {
            const point = payload?.[0]?.payload as TrendPoint | undefined
            if (!active || !point) return null
            // Value leads, date follows; a short line key ties it to the series.
            return (
              <div className="rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                <p className="flex items-center gap-1.5">
                  <span className="h-0.5 w-3 rounded-full bg-[var(--color-value)]" aria-hidden />
                  <span className="tabular text-sm font-medium text-foreground">
                    {formatValue(point.value)} {unit}
                  </span>
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  {seriesLabel} · {point.label}
                </p>
              </div>
            )
          }}
        />
        <Line
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={{ r: 4, fill: 'var(--color-value)', stroke: 'var(--card)', strokeWidth: 2 }}
          activeDot={{ r: 6, fill: 'var(--color-value)', stroke: 'var(--card)', strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  )
}
