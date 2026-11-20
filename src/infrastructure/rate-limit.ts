/**
 * Fixed-window rate limiter kept in process memory.
 * Good for a single instance; swap for Redis/Upstash when running several instances.
 */
export class MemoryRateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  check(key: string, now = Date.now()): { allowed: boolean; remaining: number; resetAt: number } {
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, window);
      if (this.windows.size > 10_000) this.sweep(now);
    }
    window.count += 1;
    return { allowed: window.count <= this.limit, remaining: Math.max(0, this.limit - window.count), resetAt: window.resetAt };
  }

  private sweep(now: number) {
    for (const [key, window] of this.windows) if (window.resetAt <= now) this.windows.delete(key);
  }
}
