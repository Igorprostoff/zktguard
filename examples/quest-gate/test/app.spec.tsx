import { describe, it, expect, vi } from "vitest";

// Mock TonConnect — its real provider needs browser globals jsdom
// can't supply. We just stub the hooks the App reads.
vi.mock("@tonconnect/ui-react", () => ({
  TonConnectButton: () => null,
  TonConnectUIProvider: ({ children }: any) => children,
  useTonAddress: () => "",
  useTonConnectUI: () => [
    { sendTransaction: async () => ({ ok: true }) },
    () => {},
  ],
}));

import { render, screen } from "@testing-library/react";
import { App } from "../src/App";

describe("quest-gate App", () => {
  it("renders the quest CTA and prompts wallet connection", () => {
    render(<App />);
    expect(screen.getByText("Quest gate")).toBeInTheDocument();
    expect(screen.getByTestId("cta")).toHaveTextContent(
      /Connect a wallet first/i,
    );
  });
});
