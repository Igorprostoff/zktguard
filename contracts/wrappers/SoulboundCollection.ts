import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  toNano,
} from "@ton/core";

import { buildItemData, IndividualContent, buildIndividualContent } from "./SoulboundItem";

export const COLLECTION_OP_MINT = 0x6d696e74;

export interface CollectionConfig {
  verifier: Address;
  owner: Address;
  content: Cell;
  itemCode: Cell;
}

export function collectionConfigToCell(c: CollectionConfig): Cell {
  return beginCell()
    .storeUint(0n, 64) // next_index
    .storeAddress(c.verifier)
    .storeAddress(c.owner)
    .storeRef(c.content)
    .storeRef(c.itemCode)
    .endCell();
}

export function computeItemAddress(
  itemCode: Cell,
  index: bigint,
  collection: Address,
  owner: Address,
  content: Cell,
  workchain = 0,
): Address {
  const data = buildItemData(index, collection, owner, content);
  return contractAddress(workchain, { code: itemCode, data });
}

export class SoulboundCollection implements Contract {
  static readonly OP_MINT = COLLECTION_OP_MINT;

  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address): SoulboundCollection {
    return new SoulboundCollection(address);
  }

  static createFromConfig(
    config: CollectionConfig,
    code: Cell,
    workchain = 0,
  ): SoulboundCollection {
    const data = collectionConfigToCell(config);
    const init = { code, data };
    return new SoulboundCollection(contractAddress(workchain, init), init);
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

  async sendMint(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint;
      queryId: bigint;
      newOwner: Address;
      content: IndividualContent | Cell;
    },
  ): Promise<void> {
    const contentCell =
      opts.content instanceof Cell
        ? opts.content
        : buildIndividualContent(opts.content);
    const body = beginCell()
      .storeUint(COLLECTION_OP_MINT, 32)
      .storeUint(opts.queryId, 64)
      .storeAddress(opts.newOwner)
      .storeRef(contentCell)
      .endCell();
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body,
    });
  }

  async getCollectionData(
    provider: ContractProvider,
  ): Promise<{ nextIndex: bigint; content: Cell; owner: Address }> {
    const { stack } = await provider.get("get_collection_data", []);
    return {
      nextIndex: stack.readBigNumber(),
      content: stack.readCell(),
      owner: stack.readAddress(),
    };
  }

  async getVerifierAddress(provider: ContractProvider): Promise<Address> {
    const { stack } = await provider.get("verifier_address", []);
    return stack.readAddress();
  }

  async getNextIndex(provider: ContractProvider): Promise<bigint> {
    const { stack } = await provider.get("next_index", []);
    return stack.readBigNumber();
  }
}

export function deployValue(): bigint {
  // Sandboxed default that's comfortably above storage + forward fees.
  return toNano("0.1");
}
