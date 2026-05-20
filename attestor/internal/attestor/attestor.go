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
	"github.com/iden3/go-iden3-crypto/poseidon"
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

// Sign hashes the (ciphertext, nonce) tuple with Poseidon and signs
// the digest with EdDSA-BabyJubjub. Returns (R8x, R8y, S) — the
// canonical circomlib triple.
func (a *Attestor) Sign(ciphertext []byte, nonce *big.Int) (r8x, r8y, s *big.Int, digest *big.Int, err error) {
	digest, err = TranscriptDigest(ciphertext, nonce)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	sig := a.sk.SignPoseidon(digest)
	return sig.R8.X, sig.R8.Y, sig.S, digest, nil
}

// Verify checks an EdDSA-BabyJubjub signature against the digest
// derived from (ciphertext, nonce). Returns nil on success.
func (a *Attestor) Verify(ciphertext []byte, nonce, r8x, r8y, s *big.Int) error {
	digest, err := TranscriptDigest(ciphertext, nonce)
	if err != nil {
		return err
	}
	sig := &babyjub.Signature{
		R8: &babyjub.Point{X: r8x, Y: r8y},
		S:  s,
	}
	if !a.pk.VerifyPoseidon(digest, sig) {
		return errors.New("attestor: signature verification failed")
	}
	return nil
}

// TranscriptDigest is the Poseidon hash that the circuit consumes.
// The ciphertext is chunked into 31-byte field-friendly pieces; in
// v0.1 we expect short ciphertexts (the stub returns < 200 bytes)
// and fall back to single-element Poseidon when the chunk count
// fits the arity limit.
func TranscriptDigest(ciphertext []byte, nonce *big.Int) (*big.Int, error) {
	const fieldSize = 31 // Poseidon over BN254 fits 254 bits per slot
	chunks := chunkBytes(ciphertext, fieldSize)
	inputs := make([]*big.Int, 0, len(chunks)+1)
	for _, c := range chunks {
		inputs = append(inputs, new(big.Int).SetBytes(c))
	}
	if nonce == nil {
		nonce = big.NewInt(0)
	}
	inputs = append(inputs, new(big.Int).Set(nonce))

	if len(inputs) == 0 {
		return nil, errors.New("attestor: empty transcript")
	}
	if len(inputs) > 16 {
		// Poseidon arity ≤ 16; production should fold via a Merkle
		// tree. v0.1 panics loudly so we don't silently truncate.
		return nil, fmt.Errorf("attestor: %d inputs exceeds Poseidon arity 16", len(inputs))
	}
	return poseidon.Hash(inputs)
}

func chunkBytes(b []byte, n int) [][]byte {
	if len(b) == 0 {
		return nil
	}
	out := make([][]byte, 0, (len(b)+n-1)/n)
	for i := 0; i < len(b); i += n {
		j := i + n
		if j > len(b) {
			j = len(b)
		}
		out = append(out, b[i:j])
	}
	return out
}
