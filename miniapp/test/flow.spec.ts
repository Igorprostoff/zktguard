import { describe, it, expect, vi } from "vitest";
import { ZktGuardClient } from "@zktguard/sdk";

import { runClaimFlow, type FlowStage } from "../src/flow";

const VALID_ADDR = "EQDk2VTvn04SUKJrW7rXahzdF8_Qi6utb0wj43InCu9vdjrR";

function stubFetch() {
  return vi.fn(async (url: string) => {
    if (url.endsWith("/attest")) {
      // v0.2 Phase B sealing tuple (see attestor httpapi AttestResponse)
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            key_hex: "00".repeat(32),
            nonce_hex: "01".repeat(12),
            salt_hex: "02".repeat(16),
            aad_hex: "7a6b7476",
            ciphertext_hex: "deadbeef",
            tag_hex: "ff".repeat(16),
            created_at_offset: 17,
            pubkey_x: "5",
            pubkey_y: "7",
          };
        },
      };
    }
    if (url.endsWith("/prove")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            aHex: "A".repeat(96),
            bHex: "B".repeat(192),
            cHex: "C".repeat(96),
            publicInputs: [
              "111", "222", "1", "2000000000", "1", "5", "7", "6",
            ],
          };
        },
      };
    }
    throw new Error(`unstubbed fetch: ${url}`);
  });
}

function newClient() {
  return ZktGuardClient.init({
    network: "testnet",
    verifierAddress: VALID_ADDR,
    attestorUrl: "http://127.0.0.1:7677",
    proverUrl: "http://127.0.0.1:7679",
  });
}

describe("runClaimFlow", () => {
  it("emits stage transitions and returns a credential", async () => {
    vi.spyOn(global, "fetch").mockImplementation(stubFetch() as any);

    const client = newClient();
    const stages: FlowStage[] = [];
    const credential = await runClaimFlow({
      client,
      verifierAddress: VALID_ADDR,
      onStage: (s) => stages.push(s),
    });

    expect(stages).toEqual(["attesting", "proving"]);
    expect(credential.nullifier).toBe(111n);
    expect(credential.proof.aHex).toHaveLength(96);
  });

  it("submits the verify message when tonConnectUI is supplied", async () => {
    vi.spyOn(global, "fetch").mockImplementation(stubFetch() as any);

    const client = newClient();
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
