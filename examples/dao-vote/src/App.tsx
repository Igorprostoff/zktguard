import type { Credential } from "@zktguard/sdk";
import { ExampleApp } from "@zktguard/example-shared";

export function App() {
  return (
    <ExampleApp
      title="DAO vote"
      blurb="Vote weight scales with how long your Telegram account has existed. Older accounts get a bigger ballot — the DAO never sees the account."
      ctaIdle="Stake my vote"
      defaultVerifier="EQDk2VTvn04SUKJrW7rXahzdF8_Qi6utb0wj43InCu9vdjrR"
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
