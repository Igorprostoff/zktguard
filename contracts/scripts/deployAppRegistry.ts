import { toNano } from "@ton/core";
import { compile, NetworkProvider } from "@ton/blueprint";

import { AppRegistry } from "../wrappers/AppRegistry";

export async function run(provider: NetworkProvider): Promise<void> {
  const code = await compile("AppRegistry");
  const sender = provider.sender().address!;

  const registry = provider.open(
    AppRegistry.createFromConfig({ admin: sender }, code),
  );
  await registry.sendDeploy(provider.sender(), toNano("0.05"));
  await provider.waitForDeploy(registry.address);

  // eslint-disable-next-line no-console
  console.log("AppRegistry deployed at:", registry.address.toString());
  // eslint-disable-next-line no-console
  console.log("admin =", sender.toString());
}
