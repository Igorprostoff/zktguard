package attestor

import (
	"math/big"
	"os"
	"path/filepath"
	"testing"
)

func TestSignVerifyDigestRoundtrip(t *testing.T) {
	a := Generate()
	digest := big.NewInt(0xdeadbeef)
	r8x, r8y, s := a.SignDigest(digest)
	if err := a.VerifyDigest(digest, r8x, r8y, s); err != nil {
		t.Fatalf("verify: %v", err)
	}
}

func TestVerifyDigestDetectsTamper(t *testing.T) {
	a := Generate()
	r8x, r8y, s := a.SignDigest(big.NewInt(1))
	if err := a.VerifyDigest(big.NewInt(2), r8x, r8y, s); err == nil {
		t.Fatalf("expected verification to fail on a different digest")
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
