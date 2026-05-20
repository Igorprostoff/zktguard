import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Dictionary,
  Sender,
  SendMode,
} from "@ton/core";

export const REGISTRY_OP_REGISTER = 0x72656769;
export const REGISTRY_OP_DEREGISTER = 0x64657265;
export const REGISTRY_OP_TRANSFER_ADMIN = 0x61646d6e;

const KEY_BITS = 96;
const APP_ID_BITS = 64n;
const CLAIM_BITS = 32n;

export function packKey(appId: bigint, claimType: bigint): bigint {
  return (appId << CLAIM_BITS) | claimType;
}

export interface RegistryConfig {
  admin: Address;
}

export function registryConfigToCell(c: RegistryConfig): Cell {
  return beginCell()
    .storeAddress(c.admin)
    .storeDict(Dictionary.empty(Dictionary.Keys.BigUint(KEY_BITS), Dictionary.Values.Cell()))
    .endCell();
}

export class AppRegistry implements Contract {
  static readonly OP_REGISTER = REGISTRY_OP_REGISTER;
  static readonly OP_DEREGISTER = REGISTRY_OP_DEREGISTER;
  static readonly OP_TRANSFER_ADMIN = REGISTRY_OP_TRANSFER_ADMIN;

  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address): AppRegistry {
    return new AppRegistry(address);
  }

  static createFromConfig(config: RegistryConfig, code: Cell, workchain = 0): AppRegistry {
    const data = registryConfigToCell(config);
    const init = { code, data };
    return new AppRegistry(contractAddress(workchain, init), init);
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

  async sendRegister(
    provider: ContractProvider,
    via: Sender,
    opts: { value: bigint; queryId: bigint; appId: bigint; claimType: bigint },
  ): Promise<void> {
    const body = beginCell()
      .storeUint(REGISTRY_OP_REGISTER, 32)
      .storeUint(opts.queryId, 64)
      .storeUint(opts.appId, 64)
      .storeUint(opts.claimType, 32)
      .endCell();
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body,
    });
  }

  async sendDeregister(
    provider: ContractProvider,
    via: Sender,
    opts: { value: bigint; queryId: bigint; appId: bigint; claimType: bigint },
  ): Promise<void> {
    const body = beginCell()
      .storeUint(REGISTRY_OP_DEREGISTER, 32)
      .storeUint(opts.queryId, 64)
      .storeUint(opts.appId, 64)
      .storeUint(opts.claimType, 32)
      .endCell();
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body,
    });
  }

  async sendTransferAdmin(
    provider: ContractProvider,
    via: Sender,
    opts: { value: bigint; queryId: bigint; newAdmin: Address },
  ): Promise<void> {
    const body = beginCell()
      .storeUint(REGISTRY_OP_TRANSFER_ADMIN, 32)
      .storeUint(opts.queryId, 64)
      .storeAddress(opts.newAdmin)
      .endCell();
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body,
    });
  }

  async getIsRegistered(
    provider: ContractProvider,
    appId: bigint,
    claimType: bigint,
  ): Promise<boolean> {
    const { stack } = await provider.get("is_registered", [
      { type: "int", value: appId },
      { type: "int", value: claimType },
    ]);
    return stack.readNumber() !== 0;
  }

  async getAdmin(provider: ContractProvider): Promise<Address> {
    const { stack } = await provider.get("admin_address", []);
    return stack.readAddress();
  }
}
