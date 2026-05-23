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

  // e2e hook: when the test harness has installed the claim override
  // global, also surface the SDK's last claim so the spec can assert
  // the UI displays the same nullifier the prover produced. Gated on
  // the same flag as the override so production never writes here.
  if (typeof window !== "undefined" && readClaimOverride() !== undefined) {
    (window as unknown as Record<string, unknown>)["__ZKTGUARD_LAST_CLAIM__"] =
      {
        nullifier: credential.nullifier.toString(),
        publicInputs: credential.publicInputs.map((p) => p.toString()),
      };
  }

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
  const override = readClaimOverride();
  return {
    appId: override?.appId ?? 1n,
    claimType: override?.claimType ?? 1n,
    thresholdMonths: override?.thresholdMonths ?? 6n,
    userSecret: override?.userSecret ?? 0xc0ffeen,
    expirationSec:
      override?.expirationSec ??
      BigInt(Math.floor(Date.now() / 1000)) + 3600n,
  };
}

/**
 * The Playwright e2e suite injects `window.__ZKTGUARD_CLAIM_OVERRIDE__`
 * before app boot so each test gets a unique nullifier. Values are
 * hex strings to stay safe across the window boundary; we coerce to
 * bigint here. The global is absent in production.
 */
interface ClaimOverride {
  appId?: bigint;
  claimType?: bigint;
  thresholdMonths?: bigint;
  userSecret?: bigint;
  expirationSec?: bigint;
}

function readClaimOverride(): ClaimOverride | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = (window as unknown as Record<string, unknown>)[
    "__ZKTGUARD_CLAIM_OVERRIDE__"
  ] as Record<string, string | undefined> | undefined;
  if (!raw) return undefined;
  const toBig = (v: string | undefined): bigint | undefined =>
    v === undefined ? undefined : BigInt(v);
  return {
    appId: toBig(raw.appId),
    claimType: toBig(raw.claimType),
    thresholdMonths: toBig(raw.thresholdMonths),
    userSecret: toBig(raw.userSecret),
    expirationSec: toBig(raw.expirationSec),
  };
}

export { OP_CODES };
