import { describe, it, expect, vi } from "vitest";
import { ZktGuardClient } from "@zktguard/sdk";

import { runClaimFlow, type FlowStage } from "../src/flow";

const VALID_ADDR = "EQDk2VTvn04SUKJrW7rXahzdF8_Qi6utb0wj43InCu9vdjrR";

describe("runClaimFlow", () => {
  it("emits stage transitions and returns a credential", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      async json() {
        return { x: "5", y: "7" };
      },
    } as any);

    const client = ZktGuardClient.init({
      network: "testnet",
      verifierAddress: VALID_ADDR,
      attestorUrl: "http://127.0.0.1:7677",
    });

    const stages: FlowStage[] = [];
    const credential = await runClaimFlow({
      client,
      verifierAddress: VALID_ADDR,
      onStage: (s) => stages.push(s),
    });

    expect(stages).toEqual(["attesting", "proving"]);
    expect(credential.nullifier).toBeGreaterThan(0n);
    expect(credential.proof.aHex).toHaveLength(96);
  });

  it("submits the verify message when tonConnectUI is supplied", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      async json() {
        return { x: "5", y: "7" };
      },
    } as any);

    const client = ZktGuardClient.init({
      network: "testnet",
      verifierAddress: VALID_ADDR,
      attestorUrl: "http://127.0.0.1:7677",
    });
    const sendTransaction = vi.fn().mockResolvedValue({ ok: true });

    await runClaimFlow({
      client,
      verifierAddress: VALID_ADDR,
      onStage: () => {},
      tonConnectUI: { sendTransaction },
    });

    expect(sendTransaction).toHaveBeenCalledTimes(1);
    const tx = sendTransaction.mock.calls[0][0];
    expect(tx.messages[0].address).toBe(VALID_ADDR);
    expect(tx.messages[0].amount).toBe("500000000");
  });
});
