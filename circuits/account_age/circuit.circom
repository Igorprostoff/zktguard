pragma circom 2.1.6;

include "templates/nullifier.circom";
include "templates/timestamp_threshold.circom";
include "templates/aead_decrypt.circom";
include "templates/transcript_commitment.circom";
include "templates/json_timestamp_extract.circom";
include "templates/attestor_eddsa_verify.circom";
include "templates/public_binding.circom";

/*
 * AccountAge (v0.1, claim_type = "account_age")
 * ---------------------------------------------
 * Proves: "the Telegram account behind a witnessed TLS transcript was
 * created at or before now - threshold_months × 30d, without revealing
 * the account or the transcript."
 *
 * Public signals (8):
 *   nonce, app_id, expiration, claim_type, threshold_months,
 *   attestor_pubkey_x, attestor_pubkey_y, transcript_hash
 *
 * Public output (1):
 *   nullifier
 *
 * Private witnesses:
 *   ciphertext[N], plaintext[N], aes_key[16], iv[12],
 *   sig_R8x, sig_R8y, sig_s, user_secret,
 *   creation_timestamp, current_time, timestamp_offset
 *
 * Constraint groups (six, see templates/):
 *   1. AEADDecrypt              — decrypt(ciphertext, key, iv) == plaintext   [STUB]
 *   2. TranscriptCommitment     — Poseidon(ciphertext, nonce) == transcript_hash [STUB]
 *   3. JsonTimestampExtract     — read creation_timestamp from plaintext       [STUB]
 *   4. TimestampThreshold       — creation_timestamp ≤ current_time - Tm × 30d
 *   5. AttestorEdDSAVerify      — EdDSA(BabyJubjub) over transcript_hash
 *   6. NullifierPoseidon        — nullifier := Poseidon(user_secret, app_id, claim_type)
 *
 * Plus a PublicBinding anchor to keep the public inputs in the witness.
 */

template AccountAge(N) {
    /* ---------------- public inputs ---------------- */
    signal input nonce;
    signal input app_id;
    signal input expiration;
    signal input claim_type;
    signal input threshold_months;
    signal input attestor_pubkey_x;
    signal input attestor_pubkey_y;
    signal input transcript_hash;

    /* ---------------- private inputs ---------------- */
    signal input ciphertext[N];
    signal input plaintext[N];
    signal input aes_key[16];
    signal input iv[12];

    signal input sig_R8x;
    signal input sig_R8y;
    signal input sig_s;

    signal input user_secret;
    signal input creation_timestamp;
    signal input current_time;
    signal input timestamp_offset;

    /* ---------------- public output ---------------- */
    signal output nullifier;

    /* (1) AEAD decryption — stub for v0.1 */
    component dec = AEADDecrypt(N);
    for (var i = 0; i < N; i++) {
        dec.ciphertext[i] <== ciphertext[i];
        dec.plaintext[i]  <== plaintext[i];
    }
    for (var i = 0; i < 16; i++) {
        dec.key[i] <== aes_key[i];
    }
    for (var i = 0; i < 12; i++) {
        dec.iv[i] <== iv[i];
    }

    /* (2) Transcript commitment — Poseidon stub for v0.1 */
    component tc = TranscriptCommitment(N);
    for (var i = 0; i < N; i++) {
        tc.ciphertext[i] <== ciphertext[i];
    }
    tc.nonce <== nonce;
    tc.digest === transcript_hash;

    /* (3) JSON field extract — positional stub for v0.1 */
    component je = JsonTimestampExtract(N);
    for (var i = 0; i < N; i++) {
        je.plaintext[i] <== plaintext[i];
    }
    je.offset <== timestamp_offset;
    je.creation_timestamp === creation_timestamp;

    /* (4) Threshold */
    component th = TimestampThreshold();
    th.creation_timestamp <== creation_timestamp;
    th.current_time       <== current_time;
    th.threshold_months   <== threshold_months;

    /* (5) Attestor signature */
    component ae = AttestorEdDSAVerify();
    ae.pubkey_x <== attestor_pubkey_x;
    ae.pubkey_y <== attestor_pubkey_y;
    ae.sig_R8x  <== sig_R8x;
    ae.sig_R8y  <== sig_R8y;
    ae.sig_s    <== sig_s;
    ae.message  <== transcript_hash;

    /* (6) Nullifier */
    component nf = NullifierPoseidon();
    nf.user_secret <== user_secret;
    nf.app_id      <== app_id;
    nf.claim_type  <== claim_type;
    nullifier <== nf.out;

    /* anchor public inputs */
    component bind = PublicBinding();
    bind.nonce             <== nonce;
    bind.app_id            <== app_id;
    bind.expiration        <== expiration;
    bind.claim_type        <== claim_type;
    bind.threshold_months  <== threshold_months;
}

component main { public [
    nonce, app_id, expiration, claim_type, threshold_months,
    attestor_pubkey_x, attestor_pubkey_y, transcript_hash
] } = AccountAge(128);
