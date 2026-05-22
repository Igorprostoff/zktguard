# In-circuit ChaCha20-Poly1305 for zkTGuard v0.2 Phase B

Design notes for the Circom templates that will replace the
`AEADDecrypt` / `TranscriptCommitment` / `JsonTimestampExtract` stubs
left in v0.1. This is the first step of v0.2 Phase B per the DoD.

The construction follows RFC 8439. It deliberately chooses
ChaCha20-Poly1305 over AES-GCM — the latter, while ubiquitous in real
TLS sessions, costs an order of magnitude more in-circuit, and the
v0.2 attestor will negotiate ChaCha20-Poly1305 with the upstream
endpoint anyway (a TLS 1.3 cipher suite mandated by the standard).

---

## 1. ChaCha20 in arithmetic form

ChaCha20 is a 256-bit-keyed, 96-bit-nonced stream cipher that operates
on a 4×4 matrix of 32-bit words. The transform is a sequence of
**quarter-rounds**:

```
a += b;       d ^= a; d = ROTL(d, 16);
c += d;       b ^= c; b = ROTL(b, 12);
a += b;       d ^= a; d = ROTL(d,  8);
c += d;       b ^= c; b = ROTL(b,  7);
```

applied first to columns, then to diagonals, repeated 10 times for a
total of 20 rounds. Final state = `keystream block`, XORed against the
plaintext to produce the ciphertext.

Each operation has a cost in the arithmetic-circuit model:

| Op             | Arithmetic recipe                                       | Constraints (rough) |
| -------------- | ------------------------------------------------------- | ------------------- |
| 32-bit ADD     | sum + carry decomposition into 33 bits                  | ~33                 |
| 32-bit XOR     | bit-decompose both inputs, xor bit-wise, recompose       | ~96                 |
| ROTL(x, n)     | bit-decompose, rotate the bit array, recompose          | ~64                 |

Each quarter-round therefore uses roughly `4 × 33 + 4 × 96 + 4 × 64 ≈
770` constraints. A full ChaCha20 block (8 quarter-rounds × 10 cycles =
80 quarter-rounds) is `~62 000` constraints.

The v0.2 target is **under 50 000 constraints per 64-byte block**.
Reaching it requires sharing the bit decompositions across XOR / ROTL
chains and folding sequential adds. circomlib's `bitify` templates
plus a `XorBits` primitive get us close; the remaining gap is closed
by a custom `QuarterRound` template that tracks bit slices through
the four operations rather than re-decomposing each time.

### Template signature

```circom
template ChaCha20(numBlocks) {
    signal input  key[8];      // 8 × uint32, in little-endian order
    signal input  nonce[3];    // 3 × uint32
    signal input  counter;     // uint32 (initial counter value)
    signal input  plaintext [numBlocks * 16];  // uint32 words
    signal output ciphertext[numBlocks * 16];  // uint32 words
}
```

`numBlocks = 1` produces the one-time Poly1305 key. `numBlocks =
ceil(maxCiphertextBytes / 64)` (with counter starting at 1) handles
the encryption stream.

### RFC 8439 §2.4.2 test vector

The reference vector encrypts the plaintext

> _Ladies and Gentlemen of the class of '99: ..._

with key `00:01:02:...:1F`, nonce `00:00:00:00:00:00:00:4A:00:00:00:00`,
counter 1. The circuit's witness against this input must produce the
ciphertext in §A.2 of the RFC.

---

## 2. Poly1305 in arithmetic form

Poly1305 is a one-time-key 128-bit MAC. Its hot loop is

```
acc = (acc + m_i) * r   (mod 2^130 - 5)
```

where `r` is a 124-bit value (clamped per RFC 8439 §2.5), `m_i` is a
129-bit chunk of the message, and `acc` is a 130-bit accumulator.

The challenge for bn128: the scalar field is ~254 bits, so a single
field element comfortably stores a 130-bit accumulator. BUT the
multiplication `acc * r` produces an intermediate `up to 260 bits`,
which overflows. We use a **5-limb representation** with each limb
under 26 bits:

```
acc = ( acc[0], acc[1], acc[2], acc[3], acc[4] )      with 0 ≤ acc[i] < 2^26
m_i = ( m[0],   m[1],   m[2],   m[3],   m[4]   )      same
r   = ( r[0],   r[1],   r[2],   r[3],   r[4]   )      same, clamped
```

The product `(acc + m_i) * r` becomes a quadratic in limbs whose
intermediate products are at most `2^26 × 2^26 = 2^52` — well inside
the scalar field. The modular reduction by `2^130 - 5` is done via
**lazy reduction**: accumulate up to a fixed number of multiplications
before propagating carries.

Final 128-bit tag = low 128 bits of `acc + s`, where `s` is the
second half of the one-time Poly1305 key.

### Template signature

```circom
template Poly1305(maxMessageBytes) {
    signal input  key[32];                    // 256-bit r || s, byte array
    signal input  message[maxMessageBytes];   // byte array
    signal input  messageLength;              // ≤ maxMessageBytes
    signal output tag[16];                    // 128-bit MAC, byte array
}
```

### RFC 8439 §2.5.2 test vector

```
r = 85:d6:be:78:57:55:6d:33:7f:44:52:fe:42:d5:06:a8
s = 01:03:80:8a:fb:0d:b2:fd:4a:bf:f6:af:41:49:f5:1b
msg = "Cryptographic Forum Research Group"
tag = a8:06:1d:c1:30:51:36:c6:c2:2b:8b:af:0c:01:27:a9
```

The circuit's witness against this input must produce the listed tag.

---

## 3. ChaCha20-Poly1305 AEAD composition (RFC 8439 §2.8)

1. Derive the Poly1305 one-time key by running ChaCha20 with counter 0
   over the AEAD's `(key, nonce)`.
2. Encrypt the plaintext with ChaCha20 starting at counter 1.
3. Compute the MAC over

   ```
   AAD || pad16(AAD) || ciphertext || pad16(ciphertext) ||
   uint64_le(|AAD|) || uint64_le(|ciphertext|)
   ```

4. Assert the computed tag equals the witnessed tag.

The template's outputs are the recovered plaintext bytes. v0.2's
`account_age` circuit feeds those plaintext bytes into the
`JsonTimestampExtract` body.

---

## 4. Key derivation linkage to the TLS handshake

The witness contains `(key, nonce)` as **private** inputs. The
attestor reveals the negotiated cipher-suite parameters by signing
`Poseidon(key || nonce || ciphertext_hash || aad_hash || tag)`. The
circuit verifies the EdDSA-BabyJubjub signature over that digest. The
on-chain verifier never sees the key or nonce — only the public
inputs (which carry the attestor pubkey and the credential metadata).

This is the same proxy-attestation trust model as v0.1 — the attestor
must not collude with the prover. The cipher-suite constraint
(ChaCha20-Poly1305 only) means the attestor must negotiate that suite
with the upstream endpoint, and the proof is bound to that specific
session's secrets.

---

## 5. Constraint-count budget

Phase B targets:

| Component                              | Budget               |
| -------------------------------------- | -------------------- |
| ChaCha20, 8 blocks (512 B plaintext)   | < 400 000            |
| Poly1305, 16-block message             | <  60 000            |
| ChaCha20-Poly1305 AEAD glue            | <  20 000            |
| JsonTimestampExtract (positional)      | <  30 000            |
| TranscriptCommitment (Poseidon fold)   | <  10 000            |
| TimestampThreshold + NullifierPoseidon | unchanged from Phase A |
| EdDSA-BabyJubjub                        | unchanged from Phase A |
| **Phase B total**                      | **< 600 000**        |

Hard ceiling (task fails if exceeded): **2 000 000 constraints**.
Proving target on the reference machine: **under 30 seconds**;
hard ceiling **90 seconds**.

---

## 6. Limitations and scope (read this section twice)

- **This construction does not prove the original AES-GCM TLS
  session.** It proves a ChaCha20-Poly1305 session that the attestor
  was instructed to negotiate. If the upstream endpoint refuses the
  cipher suite, the attestor cannot produce a witness, and the user
  gets a failed claim — not a different proof.

- The attestor still must not collude with the prover. v0.2 ships
  with a single test attestor; a multi-operator set is a v0.3 +
  research direction.

- BabyJubjub EdDSA is used inside the circuit (research-grade
  algebraic Poseidon constants over the BLS12-381 scalar field). A
  cryptographically rigorous Poseidon-BLS12-381 specification with
  audited round constants is a separate piece of work, not blocked on
  this design but worth flagging for v0.3.

- The Powers-of-Tau ceremony remains the local research-grade Phase-1
  + deterministic Phase-2 documented in `circuits/PTAU.md`. Phase B
  does not change that, but it does push the ceremony capacity from
  2^14 to at least 2^20 (since `numConstraints ≈ 6 × 10^5` requires
  log2 ≈ 20).

---

## 7. Open questions for v0.3

- Move to a folded scheme (Nova / HyperNova) for per-action proof
  amortisation.
- MPC-TLS (TLSNotary) integration — would obviate the cipher-suite
  constraint by proving the session key without the attestor seeing
  the plaintext.
- Algebraic hashing native to BLS12-381 (Rescue, Anemoi, etc.) with
  proper round-constant generation, replacing the Poseidon-bn128
  reuse currently in place.

---

End of v0.2 Phase B design notes.
