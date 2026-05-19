pragma circom 2.1.6;

include "circomlib/circuits/eddsaposeidon.circom";

/*
 * AttestorEdDSAVerify
 * -------------------
 * Verifies an EdDSA-on-BabyJubjub signature produced by the attestor over
 * the transcript commitment. BabyJubjub is chosen because it is the
 * canonical circuit-friendly curve in the Circom/Groth16 ecosystem
 * (constraint cost ~4 k for a single verify), whereas BLS12-381
 * verification in-circuit is prohibitively expensive.
 *
 * Architectural note: bible §C and DoD §Task 7 currently describe the
 * attestor as signing with BLS12-381. That signing curve cannot be
 * verified in-circuit at v0 cost targets. Reconciliation options:
 *   (a) attestor uses BabyJubjub EdDSA; in-circuit verify, no on-chain
 *       sig check needed (smaller chain footprint).
 *   (b) attestor uses BLS12-381; sig verified by FunC verifier contract
 *       (which already has BLS_VERIFY opcode); circuit drops this group
 *       and adds a "transcript_hash binds to public input" constraint.
 *
 * v0.1 lands the EdDSA path (a) so the circuit can compile and prove
 * end-to-end. The bible / Task 7 will need a small revision to match.
 * Tracked in /circuits/STATS.md.
 */

template AttestorEdDSAVerify() {
    signal input pubkey_x;
    signal input pubkey_y;
    signal input sig_R8x;
    signal input sig_R8y;
    signal input sig_s;
    signal input message;

    component verifier = EdDSAPoseidonVerifier();
    verifier.enabled <== 1;
    verifier.Ax <== pubkey_x;
    verifier.Ay <== pubkey_y;
    verifier.R8x <== sig_R8x;
    verifier.R8y <== sig_R8y;
    verifier.S   <== sig_s;
    verifier.M   <== message;
}
