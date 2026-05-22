/**
 * Orchestration helpers used by `App.tsx`. Split out so the unit
 * tests can exercise the flow without spinning up a full React tree.
 */
import { ZktGuardClient, type Credential, buildVerifierMessageBody, OP_CODES } from "@zktguard/sdk";

export type FlowStage = "idle" | "attesting" | "proving" | "submitting" | "done";

export interface RunClaimFlowArgs {
  client: ZktGuardClient;
  verifierAddress: string;
  onStage(stage: FlowStage): void;
  /** Optional TON Connect UI handle for submitting the verify tx. */
  tonConnectUI?: {
    sendTransaction(tx: any): Promise<any>;
  };
}

/**
 * Runs the attestor → prover pipeline and (if a wallet handle is
 * supplied) submits the verify message to the on-chain verifier.
 * Returns the resulting {@link Credential}.
 */
export async function runClaimFlow(
  args: RunClaimFlowArgs,
): Promise<Credential> {
  args.onStage("attesting");
  const claim = "account_age";
  const claimOptions = sampleClaimOptions();

  // requireClaim hits the attestor under the hood; we then mark the
  // proving stage for the UI so the user sees progress even though
  // the v0 prover is essentially instant.
  args.onStage("proving");
  const credential = await args.client.requireClaim(claim, claimOptions);

  if (args.tonConnectUI) {
    args.onStage("submitting");
    const body = buildVerifierMessageBody({
      queryId: BigInt(Date.now()) & ((1n << 63n) - 1n),
      proof: credential.proof,
      publicInputs: credential.publicInputs,
    });
    const bocBytes = body.toBoc();
    const bocB64 =
      typeof Buffer !== "undefined"
        ? Buffer.from(bocBytes).toString("base64")
        : btoa(String.fromCharCode(...bocBytes));
    await args.tonConnectUI.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 600,
      messages: [
        {
          address: args.verifierAddress,
          amount: "500000000", // 0.5 TON
          payload: bocB64,
        },
      ],
    });
  }

  return credential;
}

function sampleClaimOptions() {
  return {
    appId: 1n,
    claimType: 1n,
    thresholdMonths: 6n,
    userSecret: 0xc0ffeen,
    expirationSec: BigInt(Math.floor(Date.now() / 1000)) + 3600n,
  };
}

export { OP_CODES };
