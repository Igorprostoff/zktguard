# Error codes

Codes are TVM exit codes thrown by zkTGuard contracts. Codes in the
1–127 range are reserved by TVM and not used here. Application codes
start at 401 for the verifier and 901 for sanity / utility contracts.

## Verifier (Groth16, Task 4 — not yet built)

| Code | Name              | Meaning |
| ---- | ----------------- | ------- |
| 401  | invalid_proof     | Groth16 pairing equation does not hold |
| 402  | nullifier_used    | This nullifier already appears in the dictionary |
| 403  | expired           | `now() > public_inputs.expiration` |
| 404  | unknown_app       | `app_id` is not registered (queried via registry) |
| 405  | chain_mismatch    | `public_inputs.chain_id` does not match this verifier |

## Soulbound credential (Task 5 — not yet built)

| Code | Name              | Meaning |
| ---- | ----------------- | ------- |
| 410  | transfer_forbidden | Transfer attempt against a non-transferable NFT |

## Sanity / utility contracts

### PairingCheck (Task 1)

| Code | Name             | Meaning |
| ---- | ---------------- | ------- |
| 901  | malformed        | Point cell has wrong bit length or carries refs |
| 902  | not_on_curve_g1  | Provided G1 element fails subgroup membership |
| 903  | not_on_curve_g2  | Provided G2 element fails subgroup membership |
| 0xffff | unknown_op     | Op code in message body is not recognised |
