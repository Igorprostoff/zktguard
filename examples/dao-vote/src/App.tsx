import type { Credential } from "@zktguard/sdk";
import { ExampleApp } from "@zktguard/example-shared";

export function App() {
  return (
    <ExampleApp
      title="DAO vote"
      blurb="Vote weight scales with how long your Telegram account has existed. Older accounts get a bigger ballot — the DAO never sees the account."
      ctaIdle="Stake my vote"
      defaultVerifier="kQB4g0yg0VmIQBX2Le_2ZVIE1F-k4BsXKl2Gkf3DroyVo9k1"
      renderSuccess={(cred: Credential, addr: string) => (
        <>
          <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>
            Ballot recorded
          </h2>
          <p style={{ margin: "0 0 8px", fontSize: 13 }}>
            Wallet <code>{addr.slice(0, 6)}…{addr.slice(-4)}</code> is now
            entitled to cast a weighted vote. The DAO indexes ballots by:
          </p>
          <pre>{"nullifier=0x" + cred.nullifier.toString(16)}</pre>
        </>
      )}
    />
  );
}
