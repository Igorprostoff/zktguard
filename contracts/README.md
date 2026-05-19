# contracts

FunC smart contracts deployed to TON testnet. Includes the Groth16 verifier that uses the TVM BLS12-381 pairing precompile, the soulbound credential contract that mints a non-transferable NFT on successful verification, and the application registry that maps `app_id` to accepted claim types.

All contracts are v0 research code. They are non-upgradeable, have no pause function, and charge no protocol fee. Deployments and gas measurements are tracked in `DEPLOYMENTS.md` and `GAS.md` once those files exist.
