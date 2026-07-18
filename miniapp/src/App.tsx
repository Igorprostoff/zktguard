import { useEffect, useMemo, useState } from "react";
import {
  TonConnectButton,
  useTonAddress,
  useTonConnectUI,
} from "./connect";

import {
  ZktGuardClient,
  type Credential,
  type ZktGuardConfig,
} from "@zktguard/sdk";

import { runClaimFlow } from "./flow";

export function App() {
  const config = useMemo(buildConfig, []);
  const client = useMemo(() => ZktGuardClient.init(config), [config]);
  const userAddress = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();

  const [credential, setCredential] = useState<Credential | null>(null);
  const [stage, setStage] = useState<"idle" | "attesting" | "proving" | "submitting" | "done">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userAddress) {
      setCredential(null);
      setStage("idle");
    }
  }, [userAddress]);

  async function onVerify() {
    setError(null);
    try {
      const cred = await runClaimFlow({
        client,
        verifierAddress: config.verifierAddress as string,
        onStage: setStage,
        tonConnectUI,
      });
      setCredential(cred);
      setStage("done");
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setStage("idle");
    }
  }

  return (
    <main>
      <h1>zkTGuard</h1>
      <p className="lede">
        Prove your Telegram account is older than the threshold without revealing
        the account or the transcript.
      </p>

      <div className="card">
        <div className="row between" style={{ marginBottom: 12 }}>
          <span className="badge">v0.2 Phase B — in-circuit AEAD</span>
          <span data-testid="wallet-connect-button">
            <TonConnectButton />
          </span>
        </div>
        <button
          className="primary"
          disabled={!userAddress || stage !== "idle"}
          onClick={onVerify}
          data-testid="verify-button"
        >
          {labelForStage(stage, userAddress)}
        </button>
        <div data-testid="status-display" style={{ display: "none" }}>{stage}</div>
        {error && (
          <div className="error" role="alert" data-testid="error">
            {error}
          </div>
        )}
      </div>

      {credential && (
        <div className="card" data-testid="credential">
          <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>Credential</h2>
          <p style={{ margin: "0 0 8px", fontSize: 13 }}>
            Nullifier (hex):
          </p>
          <pre data-testid="nullifier-display">
            {"0x" + credential.nullifier.toString(16)}
          </pre>
          <p style={{ margin: "12px 0 8px", fontSize: 13 }}>
            Credential identifier (= nullifier; the on-chain Item
            address is derived deterministically from the
            collection's next_index at mint time and is not
            client-predictable in v0.2):
          </p>
          <pre data-testid="credential-address-display">
            {"0x" + credential.nullifier.toString(16)}
          </pre>
          <p style={{ margin: "12px 0 8px", fontSize: 13 }}>Proof.A:</p>
          <pre>{credential.proof.aHex}</pre>
          <p style={{ margin: "12px 0 8px", fontSize: 13 }}>Proof.C:</p>
          <pre>{credential.proof.cHex}</pre>
        </div>
      )}
    </main>
  );
}

function labelForStage(
  stage: "idle" | "attesting" | "proving" | "submitting" | "done",
  userAddress: string,
): string {
  if (!userAddress) return "Connect a wallet first";
  switch (stage) {
    case "idle":
      return "Verify Telegram account age";
    case "attesting":
      return "Asking the attestor…";
    case "proving":
      return "Building the proof…";
    case "submitting":
      return "Submitting to TON…";
    case "done":
      return "Done — see credential below";
  }
}

function buildConfig(): ZktGuardConfig {
  const env = (import.meta as any).env ?? {};
  return {
    network: (env.VITE_NETWORK as ZktGuardConfig["network"]) ?? "testnet",
    verifierAddress: env.VITE_VERIFIER_ADDRESS ??
      // v0.2 Phase-D1 testnet verifier — see contracts/DEPLOYMENTS.md.
      "kQB4g0yg0VmIQBX2Le_2ZVIE1F-k4BsXKl2Gkf3DroyVo9k1",
    attestorUrl: env.VITE_ATTESTOR_URL ?? "http://127.0.0.1:7677",
    proverUrl: env.VITE_PROVER_URL ?? "http://127.0.0.1:7679",
  };
}
