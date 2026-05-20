# Error codes

Codes are TVM exit codes thrown by zkTGuard contracts. Codes in the
1–127 range are reserved by TVM and not used here. Application codes
start at 401 for the verifier and 901 for sanity / utility contracts.

## Verifier (Groth16, Task 4)

| Code | Name              | Meaning |
| ---- | ----------------- | ------- |
| 401  | invalid_proof     | Groth16 pairing equation does not hold |
| 402  | nullifier_used    | This nullifier already appears in the dictionary |
| 403  | expired           | `now() > public_inputs.expiration` |
| 404  | unknown_app       | `(app_id, claim_type)` not in the accepted set (v0 uses a hard-coded pair; Task 6 wires the registry contract) |
| 405  | chain_mismatch    | High 32 bits of `nonce` (chain_id) do not match this verifier's `CHAIN_ID` constant |
| 411  | malformed_input   | Point cell has wrong bit length or carries refs |
| 412  | not_on_curve_g1   | Provided G1 element fails BLS12-381 subgroup check |
| 413  | not_on_curve_g2   | Provided G2 element fails BLS12-381 subgroup check |

## Soulbound credential (Task 5)

### Item

| Code | Name              | Meaning |
| ---- | ----------------- | ------- |
| 410  | transfer_forbidden | `op::transfer`, `op::ownership_assigned`, or `op::burn` received |

### Collection

| Code | Name              | Meaning |
| ---- | ----------------- | ------- |
| 411  | not_verifier      | `op::mint` received from an address other than `verifier_addr` |

## Sanity / utility contracts

### PairingCheck (Task 1)

| Code | Name             | Meaning |
| ---- | ---------------- | ------- |
| 901  | malformed        | Point cell has wrong bit length or carries refs |
| 902  | not_on_curve_g1  | Provided G1 element fails subgroup membership |
| 903  | not_on_curve_g2  | Provided G2 element fails subgroup membership |
| 0xffff | unknown_op     | Op code in message body is not recognised |
