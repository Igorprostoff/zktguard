/**
 * Shared rate-limit guardrail for the public toncenter testnet RPC.
 *
 * The free tier is ~1 RPS. Every call routed through {@link throttled}
 * waits at least `RATE_DELAY_MS` after the previous one, retries on
 * HTTP 429 with exponential backoff, and gives up after `MAX_RETRIES`.
 *
 * Used by:
 *   - `contracts/scripts/deployTestnet.ts`
 *   - `contracts/scripts/sanityCheckTestnet.ts`
 *
 * The Playwright e2e suite cannot import this file directly because
 * `contracts/` is a CommonJS package and the e2e workspace is ESM;
 * see `miniapp/e2e/lib/throttle.ts` for the intentionally-identical
 * ESM mirror. Edit both ends in lockstep.
 *
 * Tunables (env, all optional):
 *   RATE_DELAY_MS     default 1500
 *   RETRY_BACKOFF_MS  default 20000
 *   MAX_RETRIES       default 5
 */

export interface ThrottleConfig {
  rateDelayMs?: number;
  retryBackoffMs?: number;
  maxRetries?: number;
}

// Defaults are read at call time (not module load) so test code can
// mutate process.env between cases without re-importing.
function defaults(): Required<ThrottleConfig> {
  return {
    rateDelayMs: Number(process.env.RATE_DELAY_MS ?? 1_500),
    retryBackoffMs: Number(process.env.RETRY_BACKOFF_MS ?? 20_000),
    maxRetries: Number(process.env.MAX_RETRIES ?? 5),
  };
}

let throttleChain: Promise<unknown> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function statusOf(e: unknown): number | undefined {
  if (typeof e !== "object" || e === null) return undefined;
  const anyE = e as { status?: number; response?: { status?: number } };
  return anyE.response?.status ?? anyE.status;
}

/**
 * Schedule `fn` after the global rate-limit barrier. Returns the value
 * `fn` resolved to. On HTTP 429, sleeps `retryBackoffMs * 2^attempt`
 * and retries; gives up with a thrown error once `maxRetries` is hit.
 */
export function throttled<T>(
  fn: () => Promise<T>,
  config: ThrottleConfig = {},
): Promise<T> {
  const d = defaults();
  const rateDelay = config.rateDelayMs ?? d.rateDelayMs;
  const retryBackoff = config.retryBackoffMs ?? d.retryBackoffMs;
  const maxRetries = config.maxRetries ?? d.maxRetries;

  const next = throttleChain.then(async () => {
    await sleep(rateDelay);
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (e) {
        const code = statusOf(e);
        // Retry on rate-limit (429) and any 5xx — toncenter testnet
        // returns transient 500/502/503 under load that disappear on
        // the next attempt.
        if (code === 429 || (code !== undefined && code >= 500 && code < 600)) {
          const wait = retryBackoff * Math.pow(2, attempt);
          // eslint-disable-next-line no-console
          console.warn(
            `  [toncenter ${code}] sleep ${wait}ms then retry (attempt ${attempt + 1}/${maxRetries})`,
          );
          await sleep(wait);
          continue;
        }
        throw e;
      }
    }
    throw new Error("toncenter retries exhausted");
  });
  throttleChain = next.catch(() => undefined);
  return next as Promise<T>;
}

/**
 * Reset the global throttle chain. Only useful in tests that need a
 * clean slate; production code should not call this.
 */
export function resetThrottleChainForTests(): void {
  throttleChain = Promise.resolve();
}

