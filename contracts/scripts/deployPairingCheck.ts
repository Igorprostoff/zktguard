import { toNano } from "@ton/core";
import { compile, NetworkProvider } from "@ton/blueprint";

import { PairingCheck } from "../wrappers/PairingCheck";

export async function run(provider: NetworkProvider): Promise<void> {
  const code = await compile("PairingCheck");
  const pairing = provider.open(PairingCheck.createFromConfig({}, code));

  await pairing.sendDeploy(provider.sender(), toNano("0.05"));
  await provider.waitForDeploy(pairing.address);

  // eslint-disable-next-line no-console
  console.log("PairingCheck deployed at:", pairing.address.toString());
  // eslint-disable-next-line no-console
  console.log(
    "Record this address in contracts/DEPLOYMENTS.md (testnet section)",
  );
}
