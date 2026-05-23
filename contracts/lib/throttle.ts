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
 *   - `miniapp/e2e/wallet-stub/` (any TonClient write path)
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

const DEFAULT_RATE_DELAY_MS = Number(process.env.RATE_DELAY_MS ?? 1_500);
const DEFAULT_RETRY_BACKOFF_MS = Number(process.env.RETRY_BACKOFF_MS ?? 20_000);
const DEFAULT_MAX_RETRIES = Number(process.env.MAX_RETRIES ?? 5);

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
  const rateDelay = config.rateDelayMs ?? DEFAULT_RATE_DELAY_MS;
  const retryBackoff = config.retryBackoffMs ?? DEFAULT_RETRY_BACKOFF_MS;
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;

  const next = throttleChain.then(async () => {
    await sleep(rateDelay);
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (e) {
        const code = statusOf(e);
        if (code === 429) {
          const wait = retryBackoff * Math.pow(2, attempt);
          // eslint-disable-next-line no-console
          console.warn(
            `  [rate-limit] sleep ${wait}ms then retry (attempt ${attempt + 1}/${maxRetries})`,
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
