import type { Clock } from '../time/clock.js';
import { RateLimitPort, type RateLimitDecision, type RateLimitRequest } from './rate-limit.port.js';

interface WindowState {
  count: number;
  resetAtMs: number;
}

export class InMemoryRateLimitAdapter extends RateLimitPort {
  private readonly windows = new Map<string, WindowState>();

  constructor(private readonly clock: Clock) {
    super();
  }

  consume(request: RateLimitRequest): Promise<RateLimitDecision> {
    const nowMs = this.clock.now().getTime();
    const durationMs = request.windowSeconds * 1_000;
    let allowed = true;
    let remaining = request.maximumAttempts;
    let retryAfterSeconds = 0;
    for (const rawKey of request.keys) {
      const key = `${request.purpose}:${rawKey}`;
      const current = this.windows.get(key);
      const state =
        current === undefined || current.resetAtMs <= nowMs
          ? { count: 0, resetAtMs: nowMs + durationMs }
          : current;
      state.count += 1;
      this.windows.set(key, state);
      allowed &&= state.count <= request.maximumAttempts;
      remaining = Math.min(remaining, Math.max(0, request.maximumAttempts - state.count));
      if (state.count > request.maximumAttempts) {
        retryAfterSeconds = Math.max(
          retryAfterSeconds,
          Math.max(1, Math.ceil((state.resetAtMs - nowMs) / 1_000)),
        );
      }
    }
    return Promise.resolve({
      allowed,
      remaining,
      retryAfterSeconds,
    });
  }
}
