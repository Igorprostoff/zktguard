# Prover input schema

`zktguard-prover prove --input <json> --output <json>` reads the JSON
document described below and writes a JSON proof that the FunC
verifier deployed by Task 4 accepts.

## Top level

```jsonc
{
  "vk":             /* VkScalars */,
  "public_inputs":  ["<decimal>", ...],   // exactly 8 entries
  "a_scalar":       "<decimal>",          // optional, default "7"
  "b_scalar":       "<decimal>"           // optional, default "11"
}
```

## `vk`

The placeholder VK that ships with the v0.1 contract:

```json
{
  "alpha_scalar": "1",
  "beta_scalar":  "1",
  "gamma_scalar": "1",
  "delta_scalar": "1",
  "ic_scalars":   ["7","101","102","103","104","105","106","107","108"]
}
```

Once Task 3 produces a real trusted-setup output, the `vk` block will
be regenerated and pinned in `/circuits/account_age/verification_key.json`.
The CLI itself does not change.

## `public_inputs` (order matters)

Same ordering as the circom `public []` directive in
`/circuits/account_age/circuit.circom`:

| Index | Field              |
| ----- | ------------------ |
| 0     | `nonce`            |
| 1     | `app_id`           |
| 2     | `expiration`       |
| 3     | `claim_type`       |
| 4     | `nullifier`        |
| 5     | `attestor_pubkey_x`|
| 6     | `attestor_pubkey_y`|
| 7     | `threshold_months` |

All values are decimal-string representations of integers in the
BLS12-381 scalar field. The `nonce` field carries the chain id in its
high 32 bits — see `contracts/verifier/groth16_verifier.fc` for the
packing convention.

## Output

```jsonc
{
  "a_hex": "<96-hex>",   // BLS12-381 G1, compressed (48 bytes)
  "b_hex": "<192-hex>",  // BLS12-381 G2, compressed (96 bytes)
  "c_hex": "<96-hex>",   // BLS12-381 G1, compressed (48 bytes)
  "public_inputs": [...],
  "a_scalar": "<decimal>",
  "b_scalar": "<decimal>",
  "c_scalar": "<decimal>"
}
```

The TS wrapper `contracts/wrappers/Groth16Verifier.ts` consumes
`(a_hex, b_hex, c_hex)` + `public_inputs` directly into the verifier
message body.
