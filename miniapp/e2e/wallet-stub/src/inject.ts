/**
 * Browser-side glue installed by Playwright's `addInitScript`.
 *
 * The Mini App's `miniapp/src/connect.ts` reads
 * `window.__TONCONNECT_TEST_STUB__` at module-init time and, when
 * present, routes the wallet hooks through it instead of the real
 * `@tonconnect/ui-react`. This file ships the interface the Mini App
 * expects.
 *
 * The actual stub implementation runs in Node (Playwright's test
 * process). Communication between Node and the browser happens via
 * `page.exposeFunction` — the Playwright fixture registers
 * `__stubSendTransaction` and `__stubAddress` on the page, and this
 * shim wraps them so the Mini App sees a synchronous Wallet object.
 */

declare global {
  // eslint-disable-next-line no-var
  var __TONCONNECT_TEST_STUB__:
    | {
        address: string;
        publicKey: string;
        sendTransaction(req: {
          validUntil: number;
          messages: Array<{
            address: string;
            amount: string;
            payload?: string;
            stateInit?: string;
          }>;
        }): Promise<{ boc: string }>;
      }
    | undefined;
}

/**
 * Page-side glue registered via Playwright. Use from a Playwright
 * `beforeEach` or fixture:
 *
 * ```ts
 * await page.exposeFunction("__stubSendTransaction", (req) =>
 *   stub.sendTransaction(req),
 * );
 * await page.addInitScript(
 *   ({ address, publicKey }) => {
 *     (window as any).__TONCONNECT_TEST_STUB__ = {
 *       address,
 *       publicKey,
 *       sendTransaction: (req) =>
 *         (window as any).__stubSendTransaction(req),
 *     };
 *   },
 *   { address, publicKey },
 * );
 * ```
 */
export const STUB_GLOBAL_NAME = "__TONCONNECT_TEST_STUB__";
export const SEND_BRIDGE_NAME = "__stubSendTransaction";

export {};
