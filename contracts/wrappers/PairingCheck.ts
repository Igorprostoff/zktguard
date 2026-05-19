import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
} from "@ton/core";

export const PAIRING_OP_CHECK = 0x70a17001;

export type PairingCheckConfig = {
  // Empty initial storage. The contract initialises storage on its
  // first successful check.
};

export function pairingCheckConfigToCell(_: PairingCheckConfig): Cell {
  return beginCell().endCell();
}

export type G1Bytes = Buffer; // 48 bytes, IETF compressed
export type G2Bytes = Buffer; // 96 bytes, IETF compressed

export type PairingMessage = {
  queryId: bigint;
  p1: G1Bytes;
  q1: G2Bytes;
  p2: G1Bytes;
  q2: G2Bytes;
};

function pointCell(buf: Buffer, expectedBytes: number): Cell {
  if (buf.length !== expectedBytes) {
    throw new Error(
      `pairing-check: expected ${expectedBytes}-byte point, got ${buf.length}`,
    );
  }
  return beginCell().storeBuffer(buf).endCell();
}

export function buildPairingMessageBody(msg: PairingMessage): Cell {
  return beginCell()
    .storeUint(PAIRING_OP_CHECK, 32)
    .storeUint(msg.queryId, 64)
    .storeRef(pointCell(msg.p1, 48))
    .storeRef(pointCell(msg.q1, 96))
    .storeRef(pointCell(msg.p2, 48))
    .storeRef(pointCell(msg.q2, 96))
    .endCell();
}

export class PairingCheck implements Contract {
  static readonly OP_CHECK = PAIRING_OP_CHECK;

  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address): PairingCheck {
    return new PairingCheck(address);
  }

  static createFromConfig(
    config: PairingCheckConfig,
    code: Cell,
    workchain = 0,
  ): PairingCheck {
    const data = pairingCheckConfigToCell(config);
    const init = { code, data };
    return new PairingCheck(contractAddress(workchain, init), init);
  }

  async sendDeploy(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
  ): Promise<void> {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async sendCheckPairing(
    provider: ContractProvider,
    via: Sender,
    opts: { value: bigint } & PairingMessage,
  ): Promise<void> {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: buildPairingMessageBody({
        queryId: opts.queryId,
        p1: opts.p1,
        q1: opts.q1,
        p2: opts.p2,
        q2: opts.q2,
      }),
    });
  }

  async getLastResult(provider: ContractProvider): Promise<number> {
    const { stack } = await provider.get("get_last_result", []);
    return Number(stack.readBigNumber());
  }

  async getLastQueryId(provider: ContractProvider): Promise<bigint> {
    const { stack } = await provider.get("get_last_query_id", []);
    return stack.readBigNumber();
  }
}
