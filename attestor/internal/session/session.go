// Package session turns an authenticated TLS connection to the
// upstream endpoint into the ChaCha20-Poly1305 material the zkTGuard
// circuit verifies: a 256-bit key, 96-bit nonce, the AAD, the
// ciphertext, and the Poly1305 tag.
//
// Design (v0.2 Phase B, Task B6)
// ------------------------------
// The circuit proves "the attestor decrypted THIS ChaCha20-Poly1305
// record and it said the account is old enough". It does not prove
// the upstream TLS record layer directly — see
// paper/design/chacha20-circuit.md §6. The attestor's job is to bind
// its ChaCha20-Poly1305 sealing to the specific TLS session it
// established, so a sealing cannot be replayed from a different
// session.
//
// Go's crypto/tls (1.21) does not expose TLS 1.3 record keys and does
// not let callers restrict the TLS 1.3 cipher suite list, so neither
// "advertise only TLS_CHACHA20_POLY1305_SHA256" nor raw record-key
// extraction is possible with the standard library alone. Rather than
// vendor a forked TLS stack, we use the standard RFC 5705 exporter
// (tls.ConnectionState.ExportKeyingMaterial), which is cipher-suite
// independent, always available in TLS 1.3, and works unprivileged on
// macOS and Linux. The exporter output is the session-bound secret
// from which the ChaCha20-Poly1305 key and nonce are derived. The
// AEAD the attestor emits is ALWAYS ChaCha20-Poly1305 — the only
// suite the circuit accepts — which is how the "ChaCha20-Poly1305
// only" constraint from the design doc is honoured end to end.
package session

import (
	"crypto/rand"
	"crypto/tls"
	"fmt"
	"io"
	"math/big"

	"github.com/iden3/go-iden3-crypto/poseidon"
	"golang.org/x/crypto/chacha20poly1305"
)

// SaltSize is the length of the fresh per-seal RFC 5705 exporter
// context. A TLS session's exporter is deterministic, so without a
// per-seal salt two seals on a reused (keep-alive) connection would
// draw the same key and nonce — a fatal ChaCha20-Poly1305 keystream
// reuse. The salt makes every seal's key material unique.
const SaltSize = 16

// ExporterLabel is the RFC 5705 label used to derive the sealing
// secret. Distinct label ⇒ distinct key space from any other use of
// the same TLS session.
const ExporterLabel = "EXPORTER-zktguard-transcript-v2"

// AADContext is the additional authenticated data bound into every
// zkTGuard sealing. Fixed and public; it namespaces the record.
var AADContext = []byte("zktguard-v2")

// Sealed is the ChaCha20-Poly1305 material the prover witnesses.
type Sealed struct {
	Key        []byte // 32 bytes, session+salt derived
	Nonce      []byte // 12 bytes, session+salt derived
	Salt       []byte // 16-byte per-seal exporter context
	AAD        []byte
	Ciphertext []byte
	Tag        []byte // 16 bytes
}

// Exporter is the subset of tls.ConnectionState the deriver needs;
// abstracted so tests can supply a deterministic secret.
type Exporter interface {
	ExportKeyingMaterial(label string, context []byte, length int) ([]byte, error)
}

// tlsExporter adapts a tls.ConnectionState.
type tlsExporter struct{ st tls.ConnectionState }

func (e tlsExporter) ExportKeyingMaterial(label string, context []byte, length int) ([]byte, error) {
	return e.st.ExportKeyingMaterial(label, context, length)
}

// FromConnectionState wraps a live TLS connection state as an
// Exporter. It rejects anything below TLS 1.3, since the exporter and
// the forward-secrecy guarantees the design relies on are 1.3-only.
func FromConnectionState(st tls.ConnectionState) (Exporter, error) {
	if st.Version < tls.VersionTLS13 {
		return nil, fmt.Errorf("session: TLS 1.3 required, negotiated 0x%04x", st.Version)
	}
	return tlsExporter{st: st}, nil
}

// Seal draws a fresh random salt, derives (key, nonce) from the
// session exporter under that salt, and encrypts body with
// ChaCha20-Poly1305 under the fixed AAD context.
func Seal(exp Exporter, body []byte) (*Sealed, error) {
	return sealWithSalt(exp, body, rand.Reader)
}

func sealWithSalt(exp Exporter, body []byte, saltSrc io.Reader) (*Sealed, error) {
	salt := make([]byte, SaltSize)
	if _, err := io.ReadFull(saltSrc, salt); err != nil {
		return nil, fmt.Errorf("session: read salt: %w", err)
	}

	// 32-byte key ‖ 12-byte nonce from one exporter draw, bound to the
	// TLS session AND this seal's salt.
	material, err := exp.ExportKeyingMaterial(ExporterLabel, salt, chacha20poly1305.KeySize+chacha20poly1305.NonceSize)
	if err != nil {
		return nil, fmt.Errorf("session: export keying material: %w", err)
	}
	key := material[:chacha20poly1305.KeySize]
	nonce := material[chacha20poly1305.KeySize:]

	aead, err := chacha20poly1305.New(key)
	if err != nil {
		return nil, fmt.Errorf("session: new aead: %w", err)
	}
	sealedWithTag := aead.Seal(nil, nonce, body, AADContext)
	ct := sealedWithTag[:len(sealedWithTag)-chacha20poly1305.Overhead]
	tag := sealedWithTag[len(sealedWithTag)-chacha20poly1305.Overhead:]

	return &Sealed{
		Key:        append([]byte(nil), key...),
		Nonce:      append([]byte(nil), nonce...),
		Salt:       salt,
		AAD:        append([]byte(nil), AADContext...),
		Ciphertext: ct,
		Tag:        tag,
	}, nil
}

// Open decrypts a Sealed record, returning the recovered plaintext.
// Used by tests and by any verifier that has the key.
func (s *Sealed) Open() ([]byte, error) {
	aead, err := chacha20poly1305.New(s.Key)
	if err != nil {
		return nil, err
	}
	combined := append(append([]byte(nil), s.Ciphertext...), s.Tag...)
	return aead.Open(nil, s.Nonce, combined, s.AAD)
}

// Digest is the Poseidon commitment the attestor signs:
//
//	Poseidon(keyHi, keyLo, nonceVal, ctHash, aadHash, tagVal,
//	         ctLen, aadLen)
//
// mirroring the circuit's TranscriptCommitment layout. keyHi/keyLo,
// nonceVal and tagVal are the big-endian packings of the fixed-width
// fields; ctHash/aadHash fold the byte buffers in 31-byte big-endian
// chunks via a 2-ary Poseidon chain, matching PoseidonFold31 in the
// circuit.
//
// v0.2 note: the attestor's Poseidon is over BN254 while the circuit
// runs on BLS12-381, so this digest is the attestor's own signing
// domain. The circuit recomputes an analogous digest but the EdDSA
// verification against it is a v0.3 item (design doc §6); in v0.2 the
// signature is checked off-circuit.
func (s *Sealed) Digest() (*big.Int, error) {
	ctHash, err := foldBytes31(s.Ciphertext)
	if err != nil {
		return nil, err
	}
	aadHash, err := foldBytes31(s.AAD)
	if err != nil {
		return nil, err
	}
	inputs := []*big.Int{
		new(big.Int).SetBytes(s.Key[:16]),
		new(big.Int).SetBytes(s.Key[16:]),
		new(big.Int).SetBytes(s.Nonce),
		ctHash,
		aadHash,
		new(big.Int).SetBytes(s.Tag),
		new(big.Int).SetUint64(uint64(len(s.Ciphertext))),
		new(big.Int).SetUint64(uint64(len(s.AAD))),
	}
	return poseidon.Hash(inputs)
}

// foldBytes31 chains h_{i+1} = Poseidon(h_i, chunk_i), h_0 = 0 over
// 31-byte big-endian chunks (zero-padded tail). An empty buffer folds
// to Poseidon(0, 0) so lengths still disambiguate; the outer digest
// also carries the lengths explicitly.
func foldBytes31(b []byte) (*big.Int, error) {
	acc := big.NewInt(0)
	if len(b) == 0 {
		return poseidon.Hash([]*big.Int{acc, big.NewInt(0)})
	}
	for i := 0; i < len(b); i += 31 {
		j := min(i+31, len(b))
		// Big-endian over the chunk's actual length, matching the
		// circuit's PoseidonFold31 (final partial chunk is packed over
		// its real byte count, not padded to 31).
		next, err := poseidon.Hash([]*big.Int{acc, new(big.Int).SetBytes(b[i:j])})
		if err != nil {
			return nil, err
		}
		acc = next
	}
	return acc, nil
}
