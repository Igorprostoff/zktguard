import { beginCell, toNano } from "@ton/core";
import { compile, NetworkProvider } from "@ton/blueprint";

import { SoulboundCollection } from "../wrappers/SoulboundCollection";

export async function run(provider: NetworkProvider): Promise<void> {
  const collectionCode = await compile("SoulboundCollection");
  const itemCode = await compile("SoulboundItem");

  // Use the deployer as both admin and a placeholder verifier address.
  // After Task 4 is deployed to testnet, run a follow-up `set_verifier`
  // script (TODO) — or redeploy with the real verifier address.
  const sender = provider.sender().address!;

  const collection = provider.open(
    SoulboundCollection.createFromConfig(
      {
        verifier: sender,
        owner: sender,
        content: beginCell().storeUint(0, 8).endCell(),
        itemCode,
      },
      collectionCode,
    ),
  );

  await collection.sendDeploy(provider.sender(), toNano("0.1"));
  await provider.waitForDeploy(collection.address);

  // eslint-disable-next-line no-console
  console.log("SoulboundCollection deployed at:", collection.address.toString());
  // eslint-disable-next-line no-console
  console.log(
    "verifier_addr currently = deployer; redeploy with real Task-4 address before use.",
  );
}
