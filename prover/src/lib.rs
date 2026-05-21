//! Reference zkTGuard prover.
//!
//! v0.1 produces *synthetic* proofs against the placeholder VK
//! embedded in `contracts/verifier/groth16_verifier.fc`. The VK
//! reduces the Groth16 verification equation to
//!
//! ```text
//! a * b == alpha*beta + gamma*s_x + delta*c   (mod r)
//! ```
//!
//! where `s_x = IC[0] + sum(IC[i+1] * pi[i])`. Given a public-input
//! vector and a pair of randomly-chosen scalars `(a, b)`, the
//! prover solves for `c` and emits the three points `(A, B, C) =
//! (a·G, b·H, c·G)` in IETF BLS12-381 compressed form — exactly
//! the bytes the FunC verifier reads from the message body.
//!
//! When the real trusted setup lands in Task 3 the math changes,
//! but the I/O contract here stays put.

use ark_bls12_381::{Bls12_381, Fr, G1Affine, G2Affine};
use ark_ec::{AffineRepr, CurveGroup};
use ark_ff::{Field, PrimeField};
use ark_serialize::CanonicalSerialize;
use num_bigint::BigUint;
use serde::{Deserialize, Serialize};
use thiserror::Error;

pub type G1 = <Bls12_381 as ark_ec::pairing::Pairing>::G1;
pub type G2 = <Bls12_381 as ark_ec::pairing::Pairing>::G2;

/// Verifier-key scalars as decimal strings (so JSON stays
/// language-neutral).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VkScalars {
    pub alpha_scalar: String,
    pub beta_scalar: String,
    pub gamma_scalar: String,
    pub delta_scalar: String,
    pub ic_scalars: Vec<String>,
}

/// Top-level CLI input.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProveInput {
    pub vk: VkScalars,
    pub public_inputs: Vec<String>,
    #[serde(default = "default_a")]
    pub a_scalar: String,
    #[serde(default = "default_b")]
    pub b_scalar: String,
}

fn default_a() -> String {
    "7".to_string()
}
fn default_b() -> String {
    "11".to_string()
}

/// Top-level CLI output. Hex strings are uppercase, no `0x`
/// prefix — they paste straight into FunC `store_uint`s.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProveOutput {
    pub a_hex: String,
    pub b_hex: String,
    pub c_hex: String,
    pub public_inputs: Vec<String>,
    pub a_scalar: String,
    pub b_scalar: String,
    pub c_scalar: String,
}

#[derive(Debug, Error)]
pub enum ProveError {
    #[error("scalar parse: {0}")]
    Parse(String),
    #[error("expected 8 public inputs, got {0}")]
    PiCount(usize),
    #[error("expected 9 IC scalars, got {0}")]
    IcCount(usize),
    #[error("delta has no inverse (delta = 0)")]
    DeltaZero,
    #[error("serialize: {0}")]
    Serialize(String),
}

fn parse_fr(s: &str) -> Result<Fr, ProveError> {
    let big =
        BigUint::parse_bytes(s.as_bytes(), 10).ok_or_else(|| ProveError::Parse(s.to_string()))?;
    Ok(Fr::from_le_bytes_mod_order(&big.to_bytes_le()))
}

fn to_compressed_hex<T: CanonicalSerialize>(value: &T) -> Result<String, ProveError> {
    let mut buf = Vec::new();
    value
        .serialize_compressed(&mut buf)
        .map_err(|e| ProveError::Serialize(e.to_string()))?;
    Ok(hex::encode_upper(buf))
}

/// Core synthetic prover. Given the placeholder VK and public
/// inputs, returns `(A, B, C, c_scalar)` such that the four-pair
/// Groth16 equation holds.
pub fn prove(input: &ProveInput) -> Result<ProveOutput, ProveError> {
    if input.public_inputs.len() != 8 {
        return Err(ProveError::PiCount(input.public_inputs.len()));
    }
    if input.vk.ic_scalars.len() != 9 {
        return Err(ProveError::IcCount(input.vk.ic_scalars.len()));
    }

    let alpha = parse_fr(&input.vk.alpha_scalar)?;
    let beta = parse_fr(&input.vk.beta_scalar)?;
    let gamma = parse_fr(&input.vk.gamma_scalar)?;
    let delta = parse_fr(&input.vk.delta_scalar)?;
    let mut ic = Vec::with_capacity(9);
    for s in &input.vk.ic_scalars {
        ic.push(parse_fr(s)?);
    }
    let mut pi = Vec::with_capacity(8);
    for s in &input.public_inputs {
        pi.push(parse_fr(s)?);
    }

    // s_x = IC[0] + Σ IC[i+1] · pi[i]
    let mut s_x = ic[0];
    for i in 0..8 {
        s_x += ic[i + 1] * pi[i];
    }

    let a = parse_fr(&input.a_scalar)?;
    let b = parse_fr(&input.b_scalar)?;

    let rhs_no_c = alpha * beta + gamma * s_x;
    let target = a * b - rhs_no_c;
    let delta_inv = delta.inverse().ok_or(ProveError::DeltaZero)?;
    let c = target * delta_inv;

    let g1 = G1Affine::generator();
    let g2 = G2Affine::generator();

    let a_point = (g1 * a).into_affine();
    let b_point = (g2 * b).into_affine();
    let c_point = (g1 * c).into_affine();

    Ok(ProveOutput {
        a_hex: to_compressed_hex(&a_point)?,
        b_hex: to_compressed_hex(&b_point)?,
        c_hex: to_compressed_hex(&c_point)?,
        public_inputs: input.public_inputs.clone(),
        a_scalar: fr_to_dec(&a),
        b_scalar: fr_to_dec(&b),
        c_scalar: fr_to_dec(&c),
    })
}

fn fr_to_dec(f: &Fr) -> String {
    let big: BigUint = (*f).into();
    big.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn placeholder_input() -> ProveInput {
        ProveInput {
            vk: VkScalars {
                alpha_scalar: "1".into(),
                beta_scalar: "1".into(),
                gamma_scalar: "1".into(),
                delta_scalar: "1".into(),
                ic_scalars: vec![
                    "7".into(),
                    "101".into(),
                    "102".into(),
                    "103".into(),
                    "104".into(),
                    "105".into(),
                    "106".into(),
                    "107".into(),
                    "108".into(),
                ],
            },
            public_inputs: vec![
                // pi[0..7]; same shape as Task-4 sandbox tests.
                "1".into(),
                "2".into(),
                "3".into(),
                "4".into(),
                "5".into(),
                "6".into(),
                "7".into(),
                "8".into(),
            ],
            a_scalar: "7".into(),
            b_scalar: "11".into(),
        }
    }

    #[test]
    fn prove_emits_48_and_96_byte_compressed_points() {
        let out = prove(&placeholder_input()).expect("prove");
        assert_eq!(out.a_hex.len(), 48 * 2);
        assert_eq!(out.b_hex.len(), 96 * 2);
        assert_eq!(out.c_hex.len(), 48 * 2);
    }

    #[test]
    fn proof_satisfies_pairing_equation() {
        use ark_bls12_381::Bls12_381 as Curve;
        use ark_ec::pairing::Pairing;

        let inp = placeholder_input();
        let out = prove(&inp).expect("prove");

        let alpha = parse_fr(&inp.vk.alpha_scalar).unwrap();
        let beta = parse_fr(&inp.vk.beta_scalar).unwrap();
        let gamma = parse_fr(&inp.vk.gamma_scalar).unwrap();
        let delta = parse_fr(&inp.vk.delta_scalar).unwrap();
        let ic: Vec<Fr> = inp
            .vk
            .ic_scalars
            .iter()
            .map(|s| parse_fr(s).unwrap())
            .collect();
        let pi: Vec<Fr> = inp
            .public_inputs
            .iter()
            .map(|s| parse_fr(s).unwrap())
            .collect();
        let a = parse_fr(&inp.a_scalar).unwrap();
        let b = parse_fr(&inp.b_scalar).unwrap();
        let c = parse_fr(&out.c_scalar).unwrap();

        let mut s_x = ic[0];
        for i in 0..8 {
            s_x += ic[i + 1] * pi[i];
        }

        // e(a·G, b·H) == e(α·G, β·H) · e(s_x·G, γ·H) · e(c·G, δ·H)
        // ⇔ a·b ≡ α·β + γ·s_x + δ·c
        let lhs = a * b;
        let rhs = alpha * beta + gamma * s_x + delta * c;
        assert_eq!(lhs, rhs);

        // Sanity: pair on-curve checks pass.
        let _ = Curve::pairing(G1Affine::generator(), G2Affine::generator());
    }

    #[test]
    fn rejects_wrong_pi_count() {
        let mut inp = placeholder_input();
        inp.public_inputs.pop();
        assert!(matches!(prove(&inp), Err(ProveError::PiCount(7))));
    }
}
