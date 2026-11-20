"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDate, formatNumber } from "@/lib/utils";

interface Point {
  date: string;
  value: number;
}

const tickDate = (value: string) => formatDate(value, { month: "short", day: "numeric" });

/**
 * Single-series trend over time: 2px line, faint area wash, recessive horizontal grid,
 * crosshair + tooltip on hover. One series, so the card title names it (no legend).
 */
export function TrendChart({ data, label, height = 260 }: { data: Point[]; label: string; height?: number }) {
  const total = data.reduce((sum, point) => sum + point.value, 0);
  return (
    <figure className="m-0" aria-label={`${label} per day, ${formatNumber(total)} total`}>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
            <XAxis
              dataKey="date"
              tickFormatter={tickDate}
              tickLine={false}
              axisLine={false}
              minTickGap={32}
              tickMargin={8}
              tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
            />
            <YAxis
              tickFormatter={(value: number) => formatNumber(value, { compact: true })}
              tickLine={false}
              axisLine={false}
              width={44}
              allowDecimals={false}
              tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
            />
            <Tooltip
              cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1, strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                const point = payload?.[0]?.payload as Point | undefined;
                if (!active || !point) return null;
                return (
                  <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                    <p className="text-muted-foreground">{formatDate(point.date, { weekday: "short", month: "short", day: "numeric" })}</p>
                    <p className="mt-0.5 flex items-center gap-2 font-medium text-popover-foreground">
                      <span className="size-2 rounded-full bg-chart-1" aria-hidden />
                      {formatNumber(point.value)} {label.toLowerCase()}
                    </p>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              name={label}
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="url(#trend-fill)"
              activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2, fill: "var(--chart-1)" }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none hover:text-foreground">View as table</summary>
        <div className="mt-2 max-h-48 overflow-y-auto rounded-md border">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="px-3 py-1.5 font-medium">Date</th>
                <th className="px-3 py-1.5 text-right font-medium">{label}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr key={point.date} className="border-t">
                  <td className="px-3 py-1">{formatDate(point.date)}</td>
                  <td className="px-3 py-1 text-right tabular-nums text-foreground">{formatNumber(point.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
