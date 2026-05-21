import { describe, it, expect, vi } from "vitest";

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

describe("dao-vote App", () => {
  it("renders the DAO ballot CTA", () => {
    render(<App />);
    expect(screen.getByText("DAO vote")).toBeInTheDocument();
    expect(screen.getByTestId("cta")).toHaveTextContent(
      /Connect a wallet first/i,
    );
  });
});
