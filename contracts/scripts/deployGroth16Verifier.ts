import { toNano } from "@ton/core";
import { compile, NetworkProvider } from "@ton/blueprint";

import { Groth16Verifier } from "../wrappers/Groth16Verifier";

export async function run(provider: NetworkProvider): Promise<void> {
  const code = await compile("Groth16Verifier");
  const verifier = provider.open(Groth16Verifier.createFromConfig(code));

  await verifier.sendDeploy(provider.sender(), toNano("0.05"));
  await provider.waitForDeploy(verifier.address);

  // eslint-disable-next-line no-console
  console.log("Groth16Verifier deployed at:", verifier.address.toString());
  // eslint-disable-next-line no-console
  console.log(
    "Update contracts/DEPLOYMENTS.md and remember: this is the PLACEHOLDER VK",
  );
}
