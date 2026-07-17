package session

import (
	"bytes"
	"crypto/tls"
	"errors"
	"testing"
)

// fakeExporter returns deterministic material so Seal/Open/Digest can
// be tested without a live TLS handshake.
type fakeExporter struct {
	seed byte
	err  error
}

func (f fakeExporter) ExportKeyingMaterial(_ string, context []byte, length int) ([]byte, error) {
	if f.err != nil {
		return nil, f.err
	}
	out := make([]byte, length)
	for i := range out {
		c := byte(0)
		if len(context) > 0 {
			c = context[i%len(context)]
		}
		out[i] = f.seed + byte(i) + c
	}
	return out, nil
}

func TestSealOpenRoundtrip(t *testing.T) {
	exp := fakeExporter{seed: 1}
	body := []byte(`{"user_id":1,"created_at":1577836800}`)

	sealed, err := Seal(exp, body)
	if err != nil {
		t.Fatalf("seal: %v", err)
	}
	if len(sealed.Key) != 32 || len(sealed.Nonce) != 12 || len(sealed.Tag) != 16 {
		t.Fatalf("bad field sizes: key=%d nonce=%d tag=%d", len(sealed.Key), len(sealed.Nonce), len(sealed.Tag))
	}
	if bytes.Equal(sealed.Ciphertext, body) {
		t.Fatalf("ciphertext equals plaintext — not encrypted")
	}

	pt, err := sealed.Open()
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if !bytes.Equal(pt, body) {
		t.Fatalf("roundtrip mismatch: %s", pt)
	}
}

func TestOpenRejectsTamperedTag(t *testing.T) {
	sealed, err := Seal(fakeExporter{seed: 2}, []byte("hello world"))
	if err != nil {
		t.Fatal(err)
	}
	sealed.Tag[0] ^= 0x01
	if _, err := sealed.Open(); err == nil {
		t.Fatalf("expected Open to fail on a tampered tag")
	}
}

func TestDigestDeterministic(t *testing.T) {
	body := []byte("the quick brown fox jumps over the lazy dog, twice over 31 bytes")
	sealed, err := Seal(fakeExporter{seed: 3}, body)
	if err != nil {
		t.Fatal(err)
	}
	// Digest is a pure function of the sealing.
	da, err := sealed.Digest()
	if err != nil {
		t.Fatal(err)
	}
	db, err := sealed.Digest()
	if err != nil {
		t.Fatal(err)
	}
	if da.Cmp(db) != 0 {
		t.Fatalf("digest not deterministic for identical sealing")
	}

	// A fresh seal draws a new salt ⇒ different key/nonce ⇒ different
	// digest, even for the same session and body.
	other, _ := Seal(fakeExporter{seed: 3}, body)
	do, _ := other.Digest()
	if da.Cmp(do) == 0 {
		t.Fatalf("expected a fresh salt to change the sealing digest")
	}
}

func TestSaltVariesKeyMaterial(t *testing.T) {
	body := []byte("same body, same session, two seals")
	a, _ := Seal(fakeExporter{seed: 7}, body)
	b, _ := Seal(fakeExporter{seed: 7}, body)
	if bytes.Equal(a.Salt, b.Salt) {
		t.Fatalf("salts collided (should be random)")
	}
	if bytes.Equal(a.Key, b.Key) && bytes.Equal(a.Nonce, b.Nonce) {
		t.Fatalf("key+nonce reused across seals on the same session — keystream reuse")
	}
}

func TestSealPropagatesExporterError(t *testing.T) {
	_, err := Seal(fakeExporter{err: errors.New("boom")}, []byte("x"))
	if err == nil {
		t.Fatalf("expected exporter error to propagate")
	}
}

// TestRejectsPreTLS13 covers the cipher-suite / version gate: the
// session binding demands TLS 1.3.
func TestRejectsPreTLS13(t *testing.T) {
	st := tls.ConnectionState{Version: tls.VersionTLS12}
	if _, err := FromConnectionState(st); err == nil {
		t.Fatalf("expected TLS 1.2 to be rejected")
	}
	st13 := tls.ConnectionState{Version: tls.VersionTLS13}
	if _, err := FromConnectionState(st13); err != nil {
		t.Fatalf("TLS 1.3 should be accepted: %v", err)
	}
}
