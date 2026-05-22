import { toNano } from "@ton/core";
import { compile, NetworkProvider } from "@ton/blueprint";

import { Groth16Verifier } from "../wrappers/Groth16Verifier";

export async function run(provider: NetworkProvider): Promise<void> {
  const code = await compile("Groth16Verifier");
  const sender = provider.sender().address!;

  // Deploy with the sender as admin. Registry and collection start
  // unset; the admin wires them via `op::set_registry` and
  // `op::set_collection` once those contracts are deployed.
  const verifier = provider.open(
    Groth16Verifier.createFromConfig(
      {
        admin: sender,
        registry: null,
        collection: null,
      },
      code,
    ),
  );

  await verifier.sendDeploy(provider.sender(), toNano("0.05"));
  await provider.waitForDeploy(verifier.address);

  // eslint-disable-next-line no-console
  console.log("Groth16Verifier deployed at:", verifier.address.toString());
  // eslint-disable-next-line no-console
  console.log(
    "Set registry + collection addresses with sendSetRegistry / sendSetCollection before sending proofs.",
  );
}
