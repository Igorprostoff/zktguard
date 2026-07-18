import type { Credential } from "@zktguard/sdk";
import { ExampleApp } from "../../_shared/exampleApp";

export function App() {
  return (
    <ExampleApp
      title="Quest gate"
      blurb="Prove your Telegram account is old enough to unlock the quest reward. Nothing about your account is revealed."
      ctaIdle="Unlock the quest reward"
      defaultVerifier="kQB4g0yg0VmIQBX2Le_2ZVIE1F-k4BsXKl2Gkf3DroyVo9k1"
      renderSuccess={(cred: Credential, addr: string) => (
        <>
          <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>
            Reward unlocked
          </h2>
          <p style={{ margin: "0 0 8px", fontSize: 13 }}>
            Wallet <code>{addr.slice(0, 6)}…{addr.slice(-4)}</code> may now
            claim the quest reward. The on-chain quest contract checks the
            nullifier below and credits the wallet.
          </p>
          <pre>{"nullifier=0x" + cred.nullifier.toString(16)}</pre>
        </>
      )}
    />
  );
}
