/**
 * TON Connect 2.0 test stub for the zkTGuard Mini App e2e suite.
 *
 * The stub is a TypeScript implementation of the *subset* of TON
 * Connect 2.0 that the Mini App actually uses:
 *   - returns a `WalletInfo`-shaped object with a real testnet
 *     address derived from a v5R1 wallet's public key,
 *   - on `sendTransaction`, signs the requested payload with the
 *     test wallet's secret, broadcasts via `@ton/ton`'s `TonClient`,
 *     and returns a fake transaction handle the Mini App can poll.
 *
 * No UI, no QR code, no Tonkeeper. The injection mechanism lives in
 * `miniapp/src/connect.ts`: if `window.__TONCONNECT_TEST_STUB__` is
 * present at module-init time, the Mini App routes its hooks through
 * the stub instead of `@tonconnect/ui-react`.
 *
 * The broadcast path reuses the shared throttle helper from
 * `contracts/lib/throttle.ts` so the e2e suite plays nice with the
 * free-tier toncenter RPC.
 */
import {
  Address,
  beginCell,
  Cell,
  internal,
  SendMode,
} from "@ton/core";
import {
  TonClient,
  WalletContractV5R1,
} from "@ton/ton";
import { mnemonicToPrivateKey, KeyPair } from "@ton/crypto";

// Use the ESM mirror in miniapp/e2e/lib/throttle.ts. The original
// contracts/lib/throttle.ts is CommonJS-shaped and Playwright's
// loader cannot consume it from this ESM package. The two files are
// intentionally identical; if you edit one, mirror the other.
import { throttled } from "../../lib/throttle";

const TESTNET_ENDPOINT = "https://testnet.toncenter.com/api/v2/jsonRPC";

export interface StubConfig {
  mnemonic: string;
  endpoint?: string;
  apiKey?: string;
}

/**
 * Outbound transaction the Mini App requested. Matches the shape
 * `@tonconnect/ui-react`'s `sendTransaction` accepts.
 */
export interface SendTransactionRequest {
  validUntil: number;
  messages: Array<{
    address: string;
    amount: string;
    payload?: string;   // base64-encoded BoC
    stateInit?: string; // base64-encoded BoC
  }>;
}

export interface SendTransactionResult {
  /** Raw signed BoC, base64. */
  boc: string;
}

export class WalletStub {
  readonly address: Address;
  private readonly wallet: WalletContractV5R1;
  private readonly keypair: KeyPair;
  private readonly client: TonClient;
  // Single-flight mutex: every sendTransaction queues behind this
  // promise so two concurrent callers cannot grab the same seqno
  // and one of their broadcasts disappears.
  private chain: Promise<unknown> = Promise.resolve();

  constructor(keypair: KeyPair, client: TonClient) {
    this.keypair = keypair;
    this.client = client;
    this.wallet = WalletContractV5R1.create({
      workchain: 0,
      publicKey: keypair.publicKey,
    });
    this.address = this.wallet.address;
  }

  /**
   * Factory matching the env-var convention: reads
   * `WALLET_STUB_MNEMONIC` from `config.mnemonic` and builds the
   * stub plus its TonClient.
   */
  static async create(config: StubConfig): Promise<WalletStub> {
    const words = config.mnemonic.trim().split(/\s+/);
    if (words.length !== 24) {
      throw new Error(
        `WalletStub: expected 24 mnemonic words, got ${words.length}`,
      );
    }
    const keypair = await mnemonicToPrivateKey(words);
    const client = new TonClient({
      endpoint: config.endpoint ?? TESTNET_ENDPOINT,
      // Fall back to the env var so the CI workflow's
      // TONCENTER_API_KEY reaches the broadcast path; without this,
      // every wallet RPC went through the free-tier limit and the
      // suite drowned in 429/5xx waves.
      apiKey: config.apiKey ?? process.env.TONCENTER_API_KEY,
    });
    const stub = new WalletStub(keypair, client);
    // Surface the wallet address + api-key presence at startup so a
    // failing CI run lets the operator check the balance and tx
    // history directly on tonscan.
    // eslint-disable-next-line no-console
    console.error(
      `[wallet-stub] init address=${stub.address.toString({ testOnly: true, bounceable: true })} ` +
        `apiKey=${config.apiKey || process.env.TONCENTER_API_KEY ? "set" : "MISSING"}`,
    );
    return stub;
  }

  /**
   * Mimics the TON Connect 2.0 `Wallet` info object the Mini App
   * reads via `useTonAddress`.
   */
  walletInfo(): { address: string; chain: "-3" | "-239"; publicKey: string } {
    return {
      address: this.address.toString({ testOnly: true, bounceable: true }),
      chain: "-3", // testnet workchain id (per TON Connect convention)
      publicKey: Buffer.from(this.keypair.publicKey).toString("hex"),
    };
  }

  /**
   * Sign + broadcast the request. Serialised through `this.chain` so
   * a second concurrent call cannot grab the same seqno. Each call
   * holds the slot until the wallet's seqno has advanced past the
   * one it broadcast with (or a bounded timeout), proving the chain
   * accepted the previous external message before the next one ships.
   *
   * Returns the BoC of the signed wallet external message — same
   * shape TON Connect returns. Logs the message hash to stderr so
   * the e2e suite can correlate broadcasts with on-chain txs.
   *
   * @param req     The transaction the Mini App built.
   */
  async sendTransaction(
    req: SendTransactionRequest,
  ): Promise<SendTransactionResult> {
    if (req.messages.length === 0) {
      throw new Error("WalletStub: sendTransaction needs at least one message");
    }
    const next = this.chain.then(() => this.sendInner(req));
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async sendInner(
    req: SendTransactionRequest,
  ): Promise<SendTransactionResult> {
    const walletContract = this.client.open(this.wallet);
    const seqno = await throttled(() => walletContract.getSeqno());

    // Log the incoming request before we touch it. payload_b64 is
    // what the Mini App handed us; payload_hex_first_32 is the first
    // 32 hex chars of the decoded BoC bytes so the verifier op code
    // (first 32 bits = 8 hex chars after the BoC magic header) is
    // visible at a glance.
    for (const m of req.messages) {
      const payloadB64 = m.payload ?? "";
      let payloadHex = "";
      if (m.payload) {
        try {
          payloadHex = Buffer.from(m.payload, "base64")
            .toString("hex")
            .slice(0, 32);
        } catch {
          payloadHex = "<decode-error>";
        }
      }
      // eslint-disable-next-line no-console
      console.error(
        `[wallet-stub] request dest=${m.address} amount=${m.amount} ` +
          `payload_b64=${payloadB64} payload_hex_first_32=${payloadHex}`,
      );
    }

    const messages = req.messages.map((m) => {
      const to = Address.parse(m.address);
      const value = BigInt(m.amount);
      const body = m.payload
        ? Cell.fromBase64(m.payload)
        : new Cell();
      const init = m.stateInit
        ? loadStateInitB64(m.stateInit)
        : undefined;
      return internal({
        to,
        value,
        bounce: !init,
        body,
        init,
      });
    });

    await throttled(() =>
      walletContract.sendTransfer({
        seqno,
        secretKey: this.keypair.secretKey,
        sendMode: SendMode.PAY_GAS_SEPARATELY,
        messages,
      }),
    );

    // Confirm the actual destinations that landed on the constructed
    // internal messages — proves we didn't silently rewrite the
    // address en route and surfaces the workchain + bounce-flag the
    // chain will see.
    for (const m of messages) {
      const dest = m.info.dest;
      const destStr =
        dest && typeof dest === "object" && "toString" in dest
          ? dest.toString({ testOnly: true, bounceable: true })
          : String(dest);
      const value =
        m.info.type === "internal" ? m.info.value.coins.toString() : "n/a";
      // eslint-disable-next-line no-console
      console.error(
        `[wallet-stub] broadcast dest=${destStr} value=${value}`,
      );
    }

    // The wallet contract's sendTransfer does not expose the signed
    // external message it broadcast, so we cannot recover the exact
    // in-msg hash. Use the wallet's known address + the seqno we sent
    // with as the correlation handle — both appear in tonscan and in
    // the verifier's incoming-message metadata.
    const handle = beginCell()
      .storeAddress(this.address)
      .storeUint(seqno, 32)
      .endCell();
    const handleHex = handle.hash().toString("hex");
    // eslint-disable-next-line no-console
    console.error(
      `[wallet-stub] tx broadcast hash=${handleHex} seqno=${seqno}`,
    );

    // Wait for the chain to confirm the broadcast by observing the
    // wallet's seqno advance. Bounded so a stuck node does not hang
    // the suite. Skipped under vitest because the unit-test mocks
    // do not simulate seqno advancement and would block the suite
    // for the full timeout.
    if (!process.env.VITEST) {
      await this.waitForSeqnoAdvance(walletContract, seqno, 60_000);
    }

    return { boc: handle.toBoc().toString("base64") };
  }

  private async waitForSeqnoAdvance(
    walletContract: { getSeqno(): Promise<number> },
    startSeqno: number,
    timeoutMs: number,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const cur = await throttled(() => walletContract.getSeqno());
      if (cur > startSeqno) return;
      // Wall-clock pacing between polls on top of the throttle's
      // per-RPC delay. Without this, the seqno-wait races toncenter
      // far faster than chain settlement and burns through the
      // rate-limit budget the other specs need.
      await new Promise((r) => setTimeout(r, 5_000));
    }
    // eslint-disable-next-line no-console
    console.error(
      `[wallet-stub] seqno did not advance past ${startSeqno} within ${timeoutMs}ms; ` +
        "continuing — downstream tx polling will surface any drop",
    );
  }
}

function loadStateInitB64(b64: string): {
  code: Cell;
  data: Cell;
} {
  const cell = Cell.fromBase64(b64);
  const slice = cell.beginParse();
  // Skip split_depth (0 bit), special (0 bit), maybe-ref code, maybe-ref data, maybe-ref library
  slice.loadUint(2);
  const code = slice.loadRef();
  const data = slice.loadRef();
  return { code, data };
}
