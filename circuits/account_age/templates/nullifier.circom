pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

/*
 * NullifierPoseidon
 * -----------------
 * nullifier = Poseidon(user_secret, app_id, claim_type)
 *
 * Per-app, per-claim, deterministic. Unlinkable across app_ids because
 * Poseidon is a one-way function and the inclusion of app_id forces the
 * pre-image to differ between apps for the same user.
 *
 * This is the only constraint group with a finalised body in v0. The
 * other five groups in /account_age/templates/ are stubbed and tracked
 * in /circuits/STATS.md.
 */

template NullifierPoseidon() {
    signal input user_secret;
    signal input app_id;
    signal input claim_type;
    signal output out;

    component h = Poseidon(3);
    h.inputs[0] <== user_secret;
    h.inputs[1] <== app_id;
    h.inputs[2] <== claim_type;

    out <== h.out;
}
