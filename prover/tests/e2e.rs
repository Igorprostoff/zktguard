use std::fs;
use std::process::Command;

use ark_bls12_381::{Fr, G1Affine, G2Affine};
use ark_ec::AffineRepr;
use ark_ec::CurveGroup;
use ark_ff::PrimeField;
use ark_serialize::CanonicalDeserialize;
use num_bigint::BigUint;

const SAMPLE_INPUT: &str = r#"{
  "vk": {
    "alpha_scalar": "1",
    "beta_scalar": "1",
    "gamma_scalar": "1",
    "delta_scalar": "1",
    "ic_scalars": ["7","101","102","103","104","105","106","107","108"]
  },
  "public_inputs": ["12345","1","2147483647","1","305419896","5","7","6"],
  "a_scalar": "7",
  "b_scalar": "11"
}"#;

fn parse_fr(s: &str) -> Fr {
    let big = BigUint::parse_bytes(s.as_bytes(), 10).unwrap();
    Fr::from_le_bytes_mod_order(&big.to_bytes_le())
}

#[test]
fn cli_writes_a_proof_that_satisfies_the_pairing_equation() {
    let dir = tempdir();
    let input_path = dir.join("input.json");
    let output_path = dir.join("output.json");

    fs::write(&input_path, SAMPLE_INPUT).unwrap();

    let bin = env!("CARGO_BIN_EXE_zktguard-prover");
    let status = Command::new(bin)
        .args([
            "prove",
            "--input",
            input_path.to_str().unwrap(),
            "--output",
            output_path.to_str().unwrap(),
        ])
        .status()
        .expect("spawn prover");
    assert!(status.success(), "prover exited with {}", status);

    let raw = fs::read_to_string(&output_path).unwrap();
    let v: serde_json::Value = serde_json::from_str(&raw).unwrap();

    let a_hex = v["a_hex"].as_str().unwrap();
    let b_hex = v["b_hex"].as_str().unwrap();
    let c_hex = v["c_hex"].as_str().unwrap();
    assert_eq!(a_hex.len(), 96, "G1 compressed = 48 bytes = 96 hex");
    assert_eq!(b_hex.len(), 192, "G2 compressed = 96 bytes = 192 hex");
    assert_eq!(c_hex.len(), 96);

    // Decode and check the points are well-formed.
    let a_bytes = hex::decode(a_hex).unwrap();
    let b_bytes = hex::decode(b_hex).unwrap();
    let c_bytes = hex::decode(c_hex).unwrap();
    let _ = G1Affine::deserialize_compressed(&*a_bytes).expect("A on curve");
    let _ = G2Affine::deserialize_compressed(&*b_bytes).expect("B on curve");
    let _ = G1Affine::deserialize_compressed(&*c_bytes).expect("C on curve");

    // Reconstruct LHS / RHS scalars and assert equality (this is what
    // the FunC verifier checks via BLS_PAIRING).
    let a = parse_fr(v["a_scalar"].as_str().unwrap());
    let b = parse_fr(v["b_scalar"].as_str().unwrap());
    let c = parse_fr(v["c_scalar"].as_str().unwrap());
    let alpha = parse_fr("1");
    let beta = parse_fr("1");
    let gamma = parse_fr("1");
    let delta = parse_fr("1");
    let ic: Vec<Fr> = ["7", "101", "102", "103", "104", "105", "106", "107", "108"]
        .iter()
        .map(|s| parse_fr(s))
        .collect();
    let pi: Vec<Fr> = ["12345", "1", "2147483647", "1", "305419896", "5", "7", "6"]
        .iter()
        .map(|s| parse_fr(s))
        .collect();
    let mut s_x = ic[0];
    for i in 0..8 {
        s_x += ic[i + 1] * pi[i];
    }
    let lhs = a * b;
    let rhs = alpha * beta + gamma * s_x + delta * c;
    assert_eq!(lhs, rhs);

    // Point coordinates should be the multi of the corresponding scalar
    // — keep this check cheap by just confirming the deserialised A
    // equals a · G.
    let expected_a = (G1Affine::generator() * a).into_affine();
    let actual_a = G1Affine::deserialize_compressed(&*a_bytes).unwrap();
    assert_eq!(expected_a, actual_a);
}

fn tempdir() -> std::path::PathBuf {
    let mut p = std::env::temp_dir();
    let pid = std::process::id();
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    p.push(format!("zktguard-prover-e2e-{}-{}", pid, nonce));
    std::fs::create_dir_all(&p).unwrap();
    p
}
