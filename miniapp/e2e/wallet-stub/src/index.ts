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

// contracts/ is a CommonJS package; Node's ESM loader exposes CJS
// modules through their default export only. Destructure off the
// default to keep the call sites unchanged.
import throttleModule from "../../../../contracts/lib/throttle";
const { throttled } = throttleModule;

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
      apiKey: config.apiKey,
    });
    return new WalletStub(keypair, client);
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
   * Sign + broadcast the request. Returns the BoC of the wallet
   * external message we sent — same shape TON Connect returns.
   *
   * @param req     The transaction the Mini App built.
   */
  async sendTransaction(
    req: SendTransactionRequest,
  ): Promise<SendTransactionResult> {
    if (req.messages.length === 0) {
      throw new Error("WalletStub: sendTransaction needs at least one message");
    }

    const walletContract = this.client.open(this.wallet);
    const seqno = await throttled(() => walletContract.getSeqno());

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

    // The wallet contract doesn't return the BoC. We rebuild the
    // external-message envelope so test code can carry an opaque
    // handle. Production TON Connect returns the BoC of the SIGNED
    // external message; v0.2 stub uses an empty cell to keep the
    // shape without re-deriving the signature outside `sendTransfer`.
    const handle = beginCell().endCell();
    return { boc: handle.toBoc().toString("base64") };
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
