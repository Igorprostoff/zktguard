pragma circom 2.1.6;

/*
 * AEADDecrypt (STUB — v0.1-WIP)
 * -----------------------------
 * In-circuit AEAD (AES-128-GCM or ChaCha20-Poly1305) decryption check.
 * The intent is: given ciphertext[N], key, iv, derive plaintext[N] and
 * tag, assert the tag matches the public commitment.
 *
 * AEAD inside Groth16/bn128 is heavy; a 16-byte AES block alone runs
 * into the high tens of thousands of constraints. Reference designs
 * (zkLogin, Reclaim) typically defer the AEAD to a separate proving
 * stage or use an alternative session-binding (e.g. forwarded-secret
 * commitments). v0.1 lands a single-block stub to fix the interface;
 * a full implementation will follow in a dedicated task.
 *
 * Interface contract: this template MUST constrain plaintext to the
 * unique value implied by (ciphertext, key, iv) under the chosen AEAD.
 */

template AEADDecrypt(N) {
    signal input ciphertext[N];
    signal input key[16];          // 128-bit key as 16 bytes
    signal input iv[12];           // 96-bit nonce per AES-GCM convention
    signal input plaintext[N];     // witnessed plaintext

    // TODO(circuit): wire to a concrete AES-GCM template.
    //                Until then, the constraint set is empty — the
    //                circuit cannot be used for end-to-end proofs.
    //                Tracked in /circuits/STATS.md.

    // Placeholder no-op constraint to keep the template typeable.
    signal acc <== ciphertext[0] - ciphertext[0];
    acc === 0;
}
