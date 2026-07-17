package httpapi

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Igorprostoff/zktguard/attestor/internal/attestor"
	"github.com/Igorprostoff/zktguard/attestor/internal/session"
	"github.com/Igorprostoff/zktguard/attestor/stub"
)

// newRig wires an attestor server whose upstream is a TLS 1.3 stub
// (Task B7). The attestor client runs with insecure=true to accept
// the httptest self-signed cert.
func newRig(t *testing.T) (*Server, *httptest.Server, *attestor.Attestor) {
	t.Helper()
	upstream := httptest.NewTLSServer(stub.New().Handler())
	t.Cleanup(upstream.Close)

	att := attestor.Generate()
	return New(att, upstream.URL, true), upstream, att
}

func TestHealth(t *testing.T) {
	s, _, _ := newRig(t)
	srv := httptest.NewServer(s.Handler())
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/health")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d", resp.StatusCode)
	}
	var body healthResp
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Status != "ok" {
		t.Fatalf("expected ok, got %s", body.Status)
	}
}

func TestPubkey(t *testing.T) {
	s, _, att := newRig(t)
	srv := httptest.NewServer(s.Handler())
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/pubkey")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var body pubkeyResp
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	wantX, wantY := att.Pubkey()
	if body.X != wantX.String() || body.Y != wantY.String() {
		t.Fatalf("pubkey mismatch: %s,%s vs %s,%s", body.X, body.Y, wantX, wantY)
	}
}

// TestAttestRoundtrip is the key-extraction-success case: the sealing
// decrypts back to the stub JSON, and the EdDSA signature verifies
// over the sealing's Poseidon digest.
func TestAttestRoundtrip(t *testing.T) {
	s, upstream, att := newRig(t)
	srv := httptest.NewServer(s.Handler())
	defer srv.Close()

	reqBody, _ := json.Marshal(AttestRequest{Path: "/account", Nonce: "12345"})
	resp, err := http.Post(srv.URL+"/attest", "application/json", bytes.NewReader(reqBody))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d", resp.StatusCode)
	}
	var body AttestResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}

	if body.Nonce != "12345" {
		t.Fatalf("nonce not echoed: %q", body.Nonce)
	}

	sealed := &session.Sealed{
		Key:        mustHexDecode(t, body.KeyHex),
		Nonce:      mustHexDecode(t, body.NonceHex),
		AAD:        mustHexDecode(t, body.AADHex),
		Ciphertext: mustHexDecode(t, body.CiphertextHex),
		Tag:        mustHexDecode(t, body.TagHex),
	}
	pt, err := sealed.Open()
	if err != nil {
		t.Fatalf("open sealing: %v", err)
	}

	// The recovered plaintext must be the stub body the upstream served.
	want := fetchPlain(t, upstream.Client(), upstream.URL+"/account")
	if !bytes.Equal(pt, want) {
		t.Fatalf("plaintext mismatch:\n got %s\nwant %s", pt, want)
	}
	gotHash := sha256.Sum256(pt)
	if hex.EncodeToString(gotHash[:]) != body.PlaintextHashHex {
		t.Fatalf("plaintext hash mismatch")
	}

	// The signature must verify over the recomputed sealing digest.
	digest, err := sealed.Digest()
	if err != nil {
		t.Fatalf("digest: %v", err)
	}
	if digest.String() != body.TranscriptDigest {
		t.Fatalf("digest mismatch: %s vs %s", digest, body.TranscriptDigest)
	}
	r8x := mustBigInt(t, body.R8x)
	r8y := mustBigInt(t, body.R8y)
	s8 := mustBigInt(t, body.S)
	if err := att.VerifyDigest(digest, r8x, r8y, s8); err != nil {
		t.Fatalf("verify: %v", err)
	}
}

// TestAttestRejectsPlaintextUpstream is the key-extraction-failure
// case: a non-TLS endpoint yields no session exporter, so the
// attestor refuses to seal.
func TestAttestRejectsPlaintextUpstream(t *testing.T) {
	upstream := httptest.NewServer(stub.New().Handler()) // plain HTTP
	defer upstream.Close()

	att := attestor.Generate()
	s := New(att, upstream.URL, true)
	srv := httptest.NewServer(s.Handler())
	defer srv.Close()

	reqBody, _ := json.Marshal(AttestRequest{Path: "/account"})
	resp, err := http.Post(srv.URL+"/attest", "application/json", bytes.NewReader(reqBody))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadGateway {
		t.Fatalf("expected 502 for plaintext upstream, got %d", resp.StatusCode)
	}
}

// TestAttestSealingsAreSessionBound: two attestations of the same body
// over two distinct TLS sessions produce different keys/ciphertexts —
// the sealing is bound to the session exporter, not just the body.
func TestAttestSealingsAreSessionBound(t *testing.T) {
	s, _, _ := newRig(t)
	srv := httptest.NewServer(s.Handler())
	defer srv.Close()

	seal := func() AttestResponse {
		reqBody, _ := json.Marshal(AttestRequest{Path: "/account"})
		resp, err := http.Post(srv.URL+"/attest", "application/json", bytes.NewReader(reqBody))
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		var body AttestResponse
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		return body
	}

	a, b := seal(), seal()
	if a.KeyHex == b.KeyHex {
		t.Fatalf("expected distinct session keys across attestations")
	}
	if a.CiphertextHex == b.CiphertextHex {
		t.Fatalf("expected distinct ciphertexts across sessions")
	}
}

func TestAttestRejectsGET(t *testing.T) {
	s, _, _ := newRig(t)
	srv := httptest.NewServer(s.Handler())
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/attest")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", resp.StatusCode)
	}
}

func fetchPlain(t *testing.T, client *http.Client, url string) []byte {
	t.Helper()
	resp, err := client.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	buf := new(bytes.Buffer)
	if _, err := buf.ReadFrom(resp.Body); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func mustBigInt(t *testing.T, s string) *big.Int {
	t.Helper()
	x, ok := new(big.Int).SetString(s, 10)
	if !ok {
		t.Fatalf("bad decimal: %s", s)
	}
	return x
}

func mustHexDecode(t *testing.T, s string) []byte {
	t.Helper()
	b, err := hex.DecodeString(s)
	if err != nil {
		t.Fatalf("bad hex %q: %v", s, err)
	}
	return b
}
