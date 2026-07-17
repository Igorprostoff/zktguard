pragma circom 2.1.6;

include "templates/nullifier.circom";
include "templates/timestamp_threshold.circom";
include "templates/public_binding.circom";
include "templates/ChaCha20Poly1305.circom";
include "templates/json_timestamp_extract.circom";
include "templates/transcript_commitment.circom";

/*
 * AccountAge (v0.2 Phase B)
 * -------------------------
 * The Phase-A pass-throughs are gone: the circuit now decrypts the
 * attested ChaCha20-Poly1305 transcript in-circuit, extracts
 * `"created_at"` from the authenticated plaintext, and derives the
 * age check from that value. The public-input surface is unchanged
 * from Phase A (8 signals), so the on-chain verifier and SDK keep
 * their layout — only the verification key changes.
 *
 * Public signals (8, with `nullifier` as an output):
 *   nullifier (output)
 *   nonce, app_id, expiration, claim_type,
 *   attestor_pubkey_x, attestor_pubkey_y, threshold_months
 *
 * Private witnesses:
 *   user_secret, current_time, timestamp_offset,
 *   tls_key[32], tls_nonce[12],
 *   ciphertext[maxCiphertextBytes], ciphertext_length,
 *   aad[maxAADBytes], aad_length, tag[16]
 *
 * Sizing lives in params.json (maxCiphertextBytes 512, maxAADBytes
 * 16 — the maximum Telegram response the attestor forwards).
 *
 * Trust note: TranscriptCommitment computes the exact digest the
 * attestor signs (Task B6), but the EdDSA-BabyJubjub signature is
 * verified off-circuit in v0.2 — the circuit runs on BLS12-381 while
 * the attestor signs over BN254. In-circuit verification is the
 * flagged v0.3 item (design doc §6); attestor_pubkey_x/y stay in the
 * public inputs for the verifier contract's attestor-set lookup and
 * for that upgrade.
 *
 * Curve target: BLS12-381 (`circom -p bls12381`), matching TON's
 * BLS_PAIRING precompiles.
 */

template AccountAge(maxCiphertextBytes, maxAADBytes) {
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
    signal input current_time;
    signal input timestamp_offset;
    signal input tls_key[32];
    signal input tls_nonce[12];
    signal input ciphertext[maxCiphertextBytes];
    signal input ciphertext_length;
    signal input aad[maxAADBytes];
    signal input aad_length;
    signal input tag[16];

    // public output (1)
    signal output nullifier;

    // 1. Authenticated decryption of the attested transcript.
    component aead = ChaCha20Poly1305Decrypt(maxCiphertextBytes, maxAADBytes);
    for (var i = 0; i < 32; i++) {
        aead.key[i] <== tls_key[i];
    }
    for (var i = 0; i < 12; i++) {
        aead.nonce[i] <== tls_nonce[i];
    }
    for (var i = 0; i < maxCiphertextBytes; i++) {
        aead.ciphertext[i] <== ciphertext[i];
    }
    aead.ciphertextLength <== ciphertext_length;
    for (var i = 0; i < maxAADBytes; i++) {
        aead.aad[i] <== aad[i];
    }
    aead.aadLength <== aad_length;
    for (var i = 0; i < 16; i++) {
        aead.tag[i] <== tag[i];
    }

    // 2. Timestamp extraction from the authenticated plaintext.
    component jte = JsonTimestampExtract(maxCiphertextBytes);
    for (var i = 0; i < maxCiphertextBytes; i++) {
        jte.plaintext[i] <== aead.plaintext[i];
    }
    jte.offset <== timestamp_offset;

    // 3. Age threshold on the extracted value.
    component th = TimestampThreshold();
    th.creation_timestamp <== jte.creation_timestamp;
    th.current_time       <== current_time;
    th.threshold_months   <== threshold_months;

    // 4. Transcript commitment (the attestor's signing payload).
    component tc = TranscriptCommitment(maxCiphertextBytes, maxAADBytes);
    for (var i = 0; i < 32; i++) {
        tc.key[i] <== tls_key[i];
    }
    for (var i = 0; i < 12; i++) {
        tc.nonce[i] <== tls_nonce[i];
    }
    for (var i = 0; i < maxCiphertextBytes; i++) {
        tc.ciphertext[i] <== ciphertext[i];
    }
    tc.ciphertextLength <== ciphertext_length;
    for (var i = 0; i < maxAADBytes; i++) {
        tc.aad[i] <== aad[i];
    }
    tc.aadLength <== aad_length;
    for (var i = 0; i < 16; i++) {
        tc.tag[i] <== tag[i];
    }
    // Anchor the digest so the commitment constraints stay live.
    signal digestSink <== tc.digest * tc.digest;

    // 5. Nullifier.
    component nf = NullifierPoseidon();
    nf.user_secret <== user_secret;
    nf.app_id      <== app_id;
    nf.claim_type  <== claim_type;
    nullifier <== nf.out;

    // 6. Public-input anchoring.
    component bind = PublicBinding();
    bind.nonce             <== nonce;
    bind.app_id            <== app_id;
    bind.expiration        <== expiration;
    bind.claim_type        <== claim_type;
    bind.threshold_months  <== threshold_months;

    // attestor_pubkey_x/y are carried public inputs reserved for the
    // verifier contract's attestor-set lookup and the v0.3 in-circuit
    // signature check.
    signal sink <== attestor_pubkey_x - attestor_pubkey_x + attestor_pubkey_y - attestor_pubkey_y;
    sink === 0;
}

component main { public [
    nonce, app_id, expiration, claim_type,
    attestor_pubkey_x, attestor_pubkey_y, threshold_months
] } = AccountAge(512, 16);
