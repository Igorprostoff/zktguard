// Package attestor implements the zkTGuard proxy attestor: it
// fetches a transcript from a Telegram-shaped endpoint, hashes the
// transcript using Poseidon (so the digest matches what circomlib's
// EdDSAPoseidonVerifier consumes in-circuit), and signs the digest
// with EdDSA on the BabyJubjub curve.
//
// The signing curve is BabyJubjub, not BLS12-381 as the bible's
// Part C describes. BabyJubjub is the only curve circomlib supports
// for in-circuit signature verification at v0 cost targets — see
// /circuits/STATS.md for the architectural note.
package attestor

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"math/big"
	"os"

	"github.com/iden3/go-iden3-crypto/babyjub"
)

// Attestor holds the signing key. The public methods are safe to
// call concurrently from HTTP handlers.
type Attestor struct {
	sk *babyjub.PrivateKey
	pk *babyjub.PublicKey
}

// New creates an Attestor from a raw 32-byte private key.
func New(sk *babyjub.PrivateKey) *Attestor {
	pk := sk.Public()
	return &Attestor{sk: sk, pk: pk}
}

// Generate creates a fresh random Attestor key pair.
func Generate() *Attestor {
	var sk babyjub.PrivateKey
	if _, err := io.ReadFull(rand.Reader, sk[:]); err != nil {
		panic(fmt.Errorf("attestor: read entropy: %w", err))
	}
	return New(&sk)
}

// LoadFromFile reads a 64-hex-character private key from path.
func LoadFromFile(path string) (*Attestor, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("attestor: read key: %w", err)
	}
	// Trim whitespace/newlines.
	s := string(raw)
	for len(s) > 0 && (s[len(s)-1] == '\n' || s[len(s)-1] == ' ' || s[len(s)-1] == '\t' || s[len(s)-1] == '\r') {
		s = s[:len(s)-1]
	}
	if len(s) != 64 {
		return nil, fmt.Errorf("attestor: expected 64 hex chars, got %d", len(s))
	}
	b, err := hex.DecodeString(s)
	if err != nil {
		return nil, fmt.Errorf("attestor: decode hex: %w", err)
	}
	var sk babyjub.PrivateKey
	copy(sk[:], b)
	return New(&sk), nil
}

// Pubkey returns the BabyJubjub public key as the (x, y) pair the
// Groth16 verifier and circomlib EdDSA verifier expect.
func (a *Attestor) Pubkey() (x, y *big.Int) {
	return a.pk.X, a.pk.Y
}

// SignDigest signs a pre-computed Poseidon digest with
// EdDSA-BabyJubjub. Returns the canonical circomlib (R8x, R8y, S)
// triple. This is the v0.2 Phase B signing path: callers pass the
// session.Sealed.Digest() commitment over the ChaCha20-Poly1305
// material (key ‖ nonce ‖ ct-hash ‖ aad-hash ‖ tag ‖ lengths).
func (a *Attestor) SignDigest(digest *big.Int) (r8x, r8y, s *big.Int) {
	sig := a.sk.SignPoseidon(digest)
	return sig.R8.X, sig.R8.Y, sig.S
}

// VerifyDigest checks an EdDSA-BabyJubjub signature against a
// pre-computed digest. Returns nil on success.
func (a *Attestor) VerifyDigest(digest, r8x, r8y, s *big.Int) error {
	sig := &babyjub.Signature{
		R8: &babyjub.Point{X: r8x, Y: r8y},
		S:  s,
	}
	if !a.pk.VerifyPoseidon(digest, sig) {
		return errors.New("attestor: signature verification failed")
	}
	return nil
}

// The v0.1 TranscriptDigest / chunkBytes helpers (Poseidon over the
// plaintext body ‖ nonce) are retired in v0.2 Phase B. The attestor
// now signs the ChaCha20-Poly1305 sealing commitment computed by
// package session; see SignDigest.
