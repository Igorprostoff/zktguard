pragma circom 2.1.6;

include "templates/nullifier.circom";
include "templates/timestamp_threshold.circom";
include "templates/public_binding.circom";

/*
 * AccountAge (v0.2 Phase-A)
 * -------------------------
 * Phase-A scope keeps the public-input surface intact (8 signals) but
 * drops the v0.1 stubs whose witness generation required external
 * fixtures (AEAD, transcript commitment, attestor signature). Phase B
 * reintroduces a real ChaCha20-Poly1305 body, a real transcript
 * commitment, and a real JSON timestamp extraction.
 *
 * Public signals (8, with `nullifier` as an output):
 *   nullifier (output)
 *   nonce, app_id, expiration, claim_type,
 *   attestor_pubkey_x, attestor_pubkey_y, threshold_months
 *
 * Private witnesses:
 *   user_secret, creation_timestamp, current_time
 *
 * Curve target: BLS12-381. circom is invoked with `-p bls12381` so
 * the produced verification key matches TON's BLS_PAIRING precompile.
 */

template AccountAge() {
    // public inputs (7)
    signal input nonce;
    signal input app_id;
    signal input expiration;
    signal input claim_type;
    signal input attestor_pubkey_x;
    signal input attestor_pubkey_y;
    signal input threshold_months;

    // private inputs
    signal input user_secret;
    signal input creation_timestamp;
    signal input current_time;

    // public output (1)
    signal output nullifier;

    component nf = NullifierPoseidon();
    nf.user_secret <== user_secret;
    nf.app_id      <== app_id;
    nf.claim_type  <== claim_type;
    nullifier <== nf.out;

    component th = TimestampThreshold();
    th.creation_timestamp <== creation_timestamp;
    th.current_time       <== current_time;
    th.threshold_months   <== threshold_months;

    component bind = PublicBinding();
    bind.nonce             <== nonce;
    bind.app_id            <== app_id;
    bind.expiration        <== expiration;
    bind.claim_type        <== claim_type;
    bind.threshold_months  <== threshold_months;

    // attestor_pubkey_x/y are carried public inputs reserved for the
    // verifier contract's attestor-set lookup; they have no semantic
    // role inside the circuit at Phase A.
    signal sink <== attestor_pubkey_x - attestor_pubkey_x + attestor_pubkey_y - attestor_pubkey_y;
    sink === 0;
}

component main { public [
    nonce, app_id, expiration, claim_type,
    attestor_pubkey_x, attestor_pubkey_y, threshold_months
] } = AccountAge();
