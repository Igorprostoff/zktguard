pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

/*
 * TranscriptCommitment (STUB — v0.1-WIP)
 * --------------------------------------
 * Binds the witnessed ciphertext to a public hash so the on-chain
 * verifier can check the attestor signed exactly this transcript.
 *
 * Public input: transcript_hash = Poseidon(ciphertext[..], nonce)
 *
 * For v0.1 we use Poseidon over the ciphertext digest plus the nonce.
 * SHA-256 would match the on-chain attestor signing format more cleanly
 * (since BLS_VERIFY computes SHA-256 internally), but SHA-256 in-circuit
 * is comparable in cost to a small AES block. The final choice is
 * tracked in the paper's Construction section.
 */

template TranscriptCommitment(N) {
    signal input ciphertext[N];
    signal input nonce;
    signal output digest;

    // Poseidon arity is small (max 16 inputs per call). For N > 15 we
    // fold via a binary tree. v0.1 stubs the fold by accepting the first
    // 15 bytes and the nonce — interface-only, will be replaced with the
    // real fold once AEADDecrypt is wired.
    var BLK = 15;
    component h = Poseidon(BLK + 1);
    for (var i = 0; i < BLK; i++) {
        h.inputs[i] <== (i < N) ? ciphertext[i] : 0;
    }
    h.inputs[BLK] <== nonce;
    digest <== h.out;
}
