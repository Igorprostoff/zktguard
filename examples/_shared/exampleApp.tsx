import { ReactNode, useMemo, useState } from "react";
import {
  TonConnectButton,
  useTonAddress,
} from "@tonconnect/ui-react";
import {
  ZktGuardClient,
  type Credential,
} from "@zktguard/sdk";

export interface ExampleAppProps {
  title: string;
  blurb: string;
  ctaIdle: string;
  /** Rendered once a credential is in hand. */
  renderSuccess: (credential: Credential, address: string) => ReactNode;
  /** Demo verifier address — overridable via env. */
  defaultVerifier: string;
}

export function ExampleApp(props: ExampleAppProps) {
  const env = (import.meta as any).env ?? {};
  const verifierAddress =
    env.VITE_VERIFIER_ADDRESS ?? props.defaultVerifier;
  const attestorUrl = env.VITE_ATTESTOR_URL ?? "http://127.0.0.1:7677";

  const client = useMemo(
    () =>
      ZktGuardClient.init({
        network: env.VITE_NETWORK ?? "testnet",
        verifierAddress,
        attestorUrl,
      }),
    [env.VITE_NETWORK, verifierAddress, attestorUrl],
  );

  const userAddress = useTonAddress();
  const [credential, setCredential] = useState<Credential | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setBusy(true);
    try {
      const cred = await client.requireClaim("account_age", {
        appId: 1n,
        claimType: 1n,
        thresholdMonths: 6n,
        userSecret:
          BigInt("0x" + (userAddress || "0").replace(/[^0-9a-f]/gi, "").slice(0, 32) || "1"),
        expirationSec: BigInt(Math.floor(Date.now() / 1000)) + 3600n,
      });
      setCredential(cred);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>{props.title}</h1>
      <p className="lede">{props.blurb}</p>

      <div className="card">
        <div className="row between" style={{ marginBottom: 12 }}>
          <span className="badge">zkTGuard example</span>
          <TonConnectButton />
        </div>
        <button
          className="primary"
          disabled={!userAddress || busy || !!credential}
          onClick={onClick}
          data-testid="cta"
        >
          {busy
            ? "Working…"
            : credential
              ? "Credential acquired"
              : userAddress
                ? props.ctaIdle
                : "Connect a wallet first"}
        </button>
        {error && (
          <div className="error" role="alert" data-testid="error">
            {error}
          </div>
        )}
      </div>

      {credential && userAddress && (
        <div className="card" data-testid="success">
          {props.renderSuccess(credential, userAddress)}
        </div>
      )}
    </main>
  );
}
