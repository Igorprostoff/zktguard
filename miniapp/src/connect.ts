/**
 * Wallet-connection indirection used by `App.tsx` and `flow.ts`.
 *
 * Production: re-exports from `@tonconnect/ui-react` unchanged.
 *
 * Test: if `window.__TONCONNECT_TEST_STUB__` is present at module
 * init time, the same hooks route through the stub. The stub is
 * installed by Playwright via `addInitScript` before the Mini App's
 * JS bundle runs; the e2e suite's wallet-stub workspace
 * (`miniapp/e2e/wallet-stub`) drives the Node side.
 *
 * The only Mini App source change required by D4 is that App.tsx
 * imports its hooks from this file instead of directly from
 * `@tonconnect/ui-react`.
 */
import { createElement, type ReactNode } from "react";
import * as TonConnectUIReact from "@tonconnect/ui-react";

interface TestStub {
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

function readStub(): TestStub | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { __TONCONNECT_TEST_STUB__?: TestStub }).__TONCONNECT_TEST_STUB__;
}

export function useTonAddress(): string {
  const stub = readStub();
  // Hook order must be stable across renders. Always call the real
  // hook so React's hook accounting is consistent; the stub overrides
  // the returned value when present.
  const real = TonConnectUIReact.useTonAddress();
  return stub ? stub.address : real;
}

export function useTonConnectUI(): [
  { sendTransaction: TestStub["sendTransaction"] },
  () => void,
] {
  const stub = readStub();
  const real = TonConnectUIReact.useTonConnectUI();
  if (stub) {
    return [
      { sendTransaction: stub.sendTransaction.bind(stub) },
      () => {},
    ];
  }
  // The real hook returns [TonConnectUI, setOptions]; cast to the
  // narrow shape App.tsx + flow.ts use.
  return real as unknown as [
    { sendTransaction: TestStub["sendTransaction"] },
    () => void,
  ];
}

type TonConnectButtonProps = Parameters<typeof TonConnectUIReact.TonConnectButton>[0];
const RealTonConnectButton = TonConnectUIReact.TonConnectButton;
export function TonConnectButton(props: TonConnectButtonProps = {}): ReactNode {
  const stub = readStub();
  if (stub) {
    // In the stub world, there is no Tonkeeper to open. The button
    // is a no-op visual marker; the Playwright suite asserts wallet
    // state via `useTonAddress` instead.
    return null;
  }
  // TonConnectButton is a memo()-wrapped component (an object, not a
  // function), so calling it directly throws. Hand it back to React
  // as JSX via createElement (this file is .ts, not .tsx).
  return createElement(RealTonConnectButton, props);
}

export { TonConnectUIProvider } from "@tonconnect/ui-react";
