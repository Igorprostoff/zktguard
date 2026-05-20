import {
  Address,
  beginCell,
  Cell,
  Contract,
  ContractProvider,
  Sender,
  SendMode,
} from "@ton/core";

export const ITEM_OP_TRANSFER = 0x5fcc3d14;
export const ITEM_OP_GET_STATIC_DATA = 0x2fcb26a2;
export const ITEM_OP_REPORT_STATIC_DATA = 0x8b771735;
export const ITEM_OP_BURN = 0x595f07bc;

export interface IndividualContent {
  app_id: bigint;
  claim_type: bigint;
  expiration: bigint;
  claim_hash: bigint;
  mint_timestamp: bigint;
}

export function buildIndividualContent(c: IndividualContent): Cell {
  return beginCell()
    .storeUint(c.app_id, 64)
    .storeUint(c.claim_type, 64)
    .storeUint(c.expiration, 64)
    .storeUint(c.claim_hash, 256)
    .storeUint(c.mint_timestamp, 64)
    .endCell();
}

export function parseIndividualContent(c: Cell): IndividualContent {
  const s = c.beginParse();
  return {
    app_id: s.loadUintBig(64),
    claim_type: s.loadUintBig(64),
    expiration: s.loadUintBig(64),
    claim_hash: s.loadUintBig(256),
    mint_timestamp: s.loadUintBig(64),
  };
}

export function buildItemData(
  index: bigint,
  collection: Address,
  owner: Address,
  content: Cell,
): Cell {
  return beginCell()
    .storeUint(index, 64)
    .storeAddress(collection)
    .storeAddress(owner)
    .storeRef(content)
    .endCell();
}

export class SoulboundItem implements Contract {
  static readonly OP_TRANSFER = ITEM_OP_TRANSFER;

  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address): SoulboundItem {
    return new SoulboundItem(address);
  }

  async sendTransfer(
    provider: ContractProvider,
    via: Sender,
    opts: { value: bigint; queryId: bigint; newOwner: Address },
  ): Promise<void> {
    const body = beginCell()
      .storeUint(ITEM_OP_TRANSFER, 32)
      .storeUint(opts.queryId, 64)
      .storeAddress(opts.newOwner)
      .storeAddress(via.address!)
      .storeUint(0, 1) // null custom_payload
      .storeCoins(0)
      .storeUint(0, 1) // null forward_payload
      .endCell();
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body,
    });
  }

  async getNftData(
    provider: ContractProvider,
  ): Promise<{
    init: boolean;
    index: bigint;
    collection: Address;
    owner: Address;
    content: Cell;
  }> {
    const { stack } = await provider.get("get_nft_data", []);
    return {
      init: stack.readNumber() !== 0,
      index: stack.readBigNumber(),
      collection: stack.readAddress(),
      owner: stack.readAddress(),
      content: stack.readCell(),
    };
  }
}
