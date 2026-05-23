import type { Credential } from "@zktguard/sdk";
import { ExampleApp } from "@zktguard/example-shared";

export function App() {
  return (
    <ExampleApp
      title="Airdrop gate"
      blurb="Prove your Telegram account predates the airdrop snapshot. The protocol learns your nullifier, not your account."
      ctaIdle="Claim airdrop"
      defaultVerifier="kQDEYarAKoDzCfWckI7MhOzEqw6LLaderdpRMRVcop9vG__O"
      renderSuccess={(cred: Credential, addr: string) => (
        <>
          <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>Airdrop credited</h2>
          <p style={{ margin: "0 0 8px", fontSize: 13 }}>
            Wallet <code>{addr.slice(0, 6)}…{addr.slice(-4)}</code> would
            receive the airdrop allocation tied to nullifier:
          </p>
          <pre>{"0x" + cred.nullifier.toString(16)}</pre>
        </>
      )}
    />
  );
}
