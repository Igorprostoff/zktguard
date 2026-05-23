/**
 * Page-object wrapper for the zkTGuard Mini App, used by every
 * Playwright spec. Every query goes through `data-testid` so visible
 * text / CSS class changes do not break the suite.
 */
import { expect, type Page } from "@playwright/test";

export type Stage =
  | "idle"
  | "attesting"
  | "proving"
  | "submitting"
  | "done";

export class MiniAppPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto("/");
  }

  /**
   * The stub's address is injected before app boot; "connecting" is
   * a no-op visually. This call simply asserts the Mini App sees the
   * connected wallet within `timeoutMs`.
   */
  async connectWallet(timeoutMs = 10_000): Promise<void> {
    // The verify button stays disabled until `useTonAddress()` returns
    // a non-empty string. The stub's address is wired by the fixture.
    await expect(this.page.getByTestId("verify-button")).toBeEnabled({
      timeout: timeoutMs,
    });
  }

  async clickVerify(): Promise<void> {
    await this.page.getByTestId("verify-button").click();
  }

  /** Block until the hidden `data-testid=status-display` reports `expected`. */
  async waitForStatus(expected: Stage, timeoutMs = 90_000): Promise<void> {
    await expect(this.page.getByTestId("status-display")).toHaveText(expected, {
      timeout: timeoutMs,
    });
  }

  async getNullifierFromUI(): Promise<string> {
    const text = await this.page.getByTestId("nullifier-display").innerText();
    return text.trim();
  }

  async getCredentialAddressFromUI(): Promise<string> {
    const text = await this.page
      .getByTestId("credential-address-display")
      .innerText();
    return text.trim();
  }

  async getErrorFromUI(): Promise<string | null> {
    const el = this.page.getByTestId("error");
    if ((await el.count()) === 0) return null;
    return (await el.innerText()).trim();
  }
}
