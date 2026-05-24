// Post-suite diagnostic. Calls getTransactions directly with the
// same TonClient setup the e2e specs use, so the CI log shows
// exactly what toncenter returns for the verifier + stub-wallet
// addresses. If this returns the txs that the spec polling missed,
// the bug is in our polling logic; if it returns the same empty
// list, the issue is upstream (API key, endpoint, indexer lag).
//
// Run via `node miniapp/e2e/scripts/dump-tx-state.mjs` from the
// repo root. Requires WALLET_STUB_MNEMONIC + TONCENTER_API_KEY in
// env (the workflow already supplies both).
import { readFileSync } from "node:fs";

import { Address, TonClient, WalletContractV5R1 } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";

const ENDPOINT =
  process.env.TON_TESTNET_ENDPOINT ??
  "https://testnet.toncenter.com/api/v2/jsonRPC";
const KEY = process.env.TONCENTER_API_KEY;

const deploymentUrl = new URL(
  "../../../contracts/deployments/v0.2-testnet.json",
  import.meta.url,
);
const deployment = JSON.parse(readFileSync(deploymentUrl, "utf8"));
const VERIFIER = Address.parse(deployment.verifier.address);

const mnemonic = process.env.WALLET_STUB_MNEMONIC;
if (!mnemonic) {
  console.error("WALLET_STUB_MNEMONIC missing; cannot derive stub wallet");
  process.exit(0); // diagnostic only, don't fail the workflow
}
const kp = await mnemonicToPrivateKey(mnemonic.trim().split(/\s+/));
const wallet = WalletContractV5R1.create({
  workchain: 0,
  publicKey: kp.publicKey,
});

const client = new TonClient({ endpoint: ENDPOINT, apiKey: KEY });

console.log(`[dump] endpoint=${ENDPOINT}`);
console.log(`[dump] apiKey=${KEY ? "set" : "MISSING"}`);

async function dump(label, addr) {
  const friendly = addr.toString({ testOnly: true, bounceable: true });
  console.log(`\n=== ${label}: ${friendly} ===`);
  try {
    const state = await client.getContractState(addr);
    console.log(
      JSON.stringify(
        {
          balanceNano: state.balance.toString(),
          state: state.state,
          lastTransaction: state.lastTransaction,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    console.log(`getContractState ERROR: ${e?.message ?? e}`);
  }
  try {
    const txs = await client.getTransactions(addr, { limit: 5 });
    console.log(`getTransactions returned ${txs.length} txs`);
    for (const t of txs) {
      const inMsg = t.inMessage;
      let src = null;
      let inBodyHex = null;
      if (inMsg) {
        if (inMsg.info.type === "internal") {
          src = inMsg.info.src.toString({
            urlSafe: true,
            bounceable: false,
            testOnly: true,
          });
        } else {
          src = `<${inMsg.info.type}>`;
        }
        try {
          inBodyHex = inMsg.body.bits.toString().slice(0, 64);
        } catch {
          inBodyHex = "<body-decode-error>";
        }
      }
      const exit =
        t.description.type === "generic" &&
        t.description.computePhase.type === "vm"
          ? t.description.computePhase.exitCode
          : null;
      console.log(
        JSON.stringify(
          {
            lt: t.lt.toString(),
            hash: t.hash().toString("hex"),
            now: t.now,
            src,
            inBodyHexHead: inBodyHex,
            exit,
            outMsgs: t.outMessagesCount,
            aborted:
              t.description.type === "generic"
                ? t.description.aborted
                : null,
          },
          null,
          2,
        ),
      );
    }
  } catch (e) {
    console.log(`getTransactions ERROR: ${e?.message ?? e}`);
  }
}

await dump("VERIFIER", VERIFIER);
await dump("STUB_WALLET", wallet.address);
