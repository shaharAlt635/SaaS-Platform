"use client";

import { useState } from "react";
import { TrendChart } from "@/components/charts/trend-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DailyPoint } from "@/domain/analytics";
import { cn } from "@/lib/utils";

const METRICS = [
  { key: "events", label: "Events" },
  { key: "users", label: "Unique users" },
] as const;

/** One measure at a time — events and users have different scales, so they never share an axis. */
export function MetricChartCard({ series, description }: { series: DailyPoint[]; description: string }) {
  const [metric, setMetric] = useState<(typeof METRICS)[number]["key"]>("events");
  const current = METRICS.find((m) => m.key === metric)!;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1.5">
          <CardTitle>{current.label} per day</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div role="tablist" aria-label="Metric" className="inline-flex rounded-lg border bg-muted/50 p-0.5 text-xs">
          {METRICS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={metric === key}
              onClick={() => setMetric(key)}
              className={cn(
                "rounded-md px-2.5 py-1 font-medium transition",
                metric === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <TrendChart data={series.map((point) => ({ date: point.date, value: point[metric] }))} label={current.label} height={300} />
      </CardContent>
    </Card>
  );
}
