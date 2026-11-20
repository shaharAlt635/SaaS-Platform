import type { Logger } from "@/application/ports";

type Level = "info" | "warn" | "error";

/** Structured JSON logs in production (for log drains), readable lines in development. */
export function createLogger(production: boolean): Logger {
  const write = (level: Level, message: string, meta?: Record<string, unknown>) => {
    if (production) {
      console[level](JSON.stringify({ level, message, ...meta, time: new Date().toISOString() }));
    } else {
      console[level](`[${level}] ${message}`, meta ?? "");
    }
  };
  return {
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta),
  };
}
