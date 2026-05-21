use std::fs;
use std::path::PathBuf;
use std::time::Instant;

use clap::{Parser, Subcommand};

#[derive(Parser, Debug)]
#[command(
    name = "zktguard-prover",
    version,
    about = "zkTGuard reference prover (v0.1 synthetic)"
)]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand, Debug)]
enum Cmd {
    /// Build a Groth16 proof from the input JSON and write the
    /// output JSON.
    Prove {
        /// Path to input JSON (see prover/INPUT_SCHEMA.md).
        #[arg(short, long)]
        input: PathBuf,
        /// Path to write the output JSON.
        #[arg(short, long)]
        output: PathBuf,
        /// Print the time spent inside `prove()` to stderr.
        #[arg(long)]
        timed: bool,
    },
}

fn main() {
    let cli = Cli::parse();
    match cli.cmd {
        Cmd::Prove {
            input,
            output,
            timed,
        } => {
            let raw = fs::read_to_string(&input).unwrap_or_else(|e| {
                eprintln!("read {}: {}", input.display(), e);
                std::process::exit(1);
            });
            let parsed: zktguard_prover::ProveInput =
                serde_json::from_str(&raw).unwrap_or_else(|e| {
                    eprintln!("parse input: {}", e);
                    std::process::exit(1);
                });

            let start = Instant::now();
            let out = zktguard_prover::prove(&parsed).unwrap_or_else(|e| {
                eprintln!("prove: {}", e);
                std::process::exit(1);
            });
            let elapsed = start.elapsed();

            let body = serde_json::to_string_pretty(&out).unwrap();
            fs::write(&output, body).unwrap_or_else(|e| {
                eprintln!("write {}: {}", output.display(), e);
                std::process::exit(1);
            });

            if timed {
                eprintln!("prove: {} μs", elapsed.as_micros());
            }
        }
    }
}
