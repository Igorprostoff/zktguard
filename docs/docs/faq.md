---
id: faq
title: FAQ
---

# FAQ

### Is this a product?

No. zkTGuard is a research artifact and a reference implementation.
There is no hosted service, no token, no fees. The bible's Part H
spells out everything that is explicitly out of scope.

### Can I deploy this to mainnet?

Not in v0.1. The verifier embeds a placeholder VK so anyone can craft
proofs that the contract accepts. Real mainnet operation requires
Task 3 (trusted setup) plus a security audit — both out of scope here.

### Why BabyJubjub and not BLS12-381 for the attestor?

The circuit verifies the attestor signature in-zk, and BLS12-381
verification inside a Groth16/bn128 circuit is prohibitively
expensive. BabyJubjub EdDSA via circomlib clocks in around 4 k
constraints. The bible's Part C will be amended to match.

### Where does the chain_id check live?

In the verifier contract, packed into the high 32 bits of the public
input `nonce`. See [Construction](/construction).

### How do I add a new claim type?

Three pieces have to land together:

1. A new sub-circuit in `circuits/account_age/templates/` (rename the
   parent folder if the claim is unrelated to account age).
2. A registration of `(app_id, claim_type)` in the App Registry.
3. A UI flow in the Mini App or your own integration.

The verifier itself does not need to change unless the public-input
arity does — the IC vector length grows with `num_public_inputs + 1`.

### Why is the prover called "synthetic"?

v0.1 emits proofs against a placeholder VK whose scalars are known.
Anyone holding the VK can construct a satisfying `(A, B, C)` for any
public-input vector. This is fine for end-to-end sandbox tests and
testnet demos. Real Groth16 proving lands when the circuit and the
trusted-setup ceremony do.

### Where do I report security issues?

For now: open an issue on GitHub. Once the paper publishes an ePrint
number, that doc will carry an embargoed contact address.
