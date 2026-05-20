package attestor

import (
	"math/big"
	"os"
	"path/filepath"
	"testing"
)

func TestSignVerifyRoundtrip(t *testing.T) {
	a := Generate()
	ciphertext := []byte(`{"created":1690000000}`)
	nonce := big.NewInt(0xdeadbeef)
	r8x, r8y, s, _, err := a.Sign(ciphertext, nonce)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	if err := a.Verify(ciphertext, nonce, r8x, r8y, s); err != nil {
		t.Fatalf("verify: %v", err)
	}
}

func TestVerifyDetectsTamper(t *testing.T) {
	a := Generate()
	ciphertext := []byte(`{"created":1690000000}`)
	nonce := big.NewInt(1)
	r8x, r8y, s, _, err := a.Sign(ciphertext, nonce)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	tampered := []byte(`{"created":1700000000}`)
	if err := a.Verify(tampered, nonce, r8x, r8y, s); err == nil {
		t.Fatalf("expected verification to fail on tampered ciphertext")
	}
}

func TestDigestStableForKnownInput(t *testing.T) {
	d1, err := TranscriptDigest([]byte("hello"), big.NewInt(42))
	if err != nil {
		t.Fatalf("digest: %v", err)
	}
	d2, err := TranscriptDigest([]byte("hello"), big.NewInt(42))
	if err != nil {
		t.Fatalf("digest: %v", err)
	}
	if d1.Cmp(d2) != 0 {
		t.Fatalf("digest not deterministic: %s vs %s", d1, d2)
	}
}

func TestLoadFromFile(t *testing.T) {
	dir := t.TempDir()
	keyPath := filepath.Join(dir, "key.hex")
	want := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	if err := os.WriteFile(keyPath, []byte(want+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	a, err := LoadFromFile(keyPath)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	x, y := a.Pubkey()
	if x.Sign() == 0 || y.Sign() == 0 {
		t.Fatalf("pubkey looks degenerate: x=%s y=%s", x, y)
	}
}

func TestLoadFromFileRejectsBadHex(t *testing.T) {
	dir := t.TempDir()
	keyPath := filepath.Join(dir, "bad.hex")
	if err := os.WriteFile(keyPath, []byte("not_hex_xxx"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadFromFile(keyPath); err == nil {
		t.Fatalf("expected LoadFromFile to fail on bad hex")
	}
}
