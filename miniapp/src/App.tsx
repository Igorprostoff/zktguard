import { useEffect, useMemo, useState } from "react";
import {
  TonConnectButton,
  useTonAddress,
  useTonConnectUI,
} from "@tonconnect/ui-react";

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
          <span className="badge">v0.2 Phase A — real VK</span>
          <TonConnectButton />
        </div>
        <button
          className="primary"
          disabled={!userAddress || stage !== "idle"}
          onClick={onVerify}
          data-testid="verify-button"
        >
          {labelForStage(stage, userAddress)}
        </button>
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
          <pre>{"0x" + credential.nullifier.toString(16)}</pre>
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
      "kQDEYarAKoDzCfWckI7MhOzEqw6LLaderdpRMRVcop9vG__O",
    attestorUrl: env.VITE_ATTESTOR_URL ?? "http://127.0.0.1:7677",
    proverUrl: env.VITE_PROVER_URL ?? "http://127.0.0.1:7679",
  };
}
