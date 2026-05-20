package httpapi

import (
	"bytes"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Igorprostoff/zktguard/attestor/internal/attestor"
	"github.com/Igorprostoff/zktguard/attestor/stub"
)

func newRig(t *testing.T) (*Server, *httptest.Server, *attestor.Attestor) {
	t.Helper()
	upstream := httptest.NewServer(stub.New().Handler())
	t.Cleanup(upstream.Close)

	att := attestor.Generate()
	return New(att, upstream.URL), upstream, att
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

func TestAttestRoundtrip(t *testing.T) {
	s, _, att := newRig(t)
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

	// Re-construct ciphertext bytes from hex and re-verify the sig.
	bodyBytes := mustHexDecode(t, body.BodyHex)
	r8x := mustBigInt(t, body.R8x)
	r8y := mustBigInt(t, body.R8y)
	s8 := mustBigInt(t, body.S)
	nonce := big.NewInt(12345)
	if err := att.Verify(bodyBytes, nonce, r8x, r8y, s8); err != nil {
		t.Fatalf("verify: %v", err)
	}
}

func TestAttestRejectsMissingNonce(t *testing.T) {
	s, _, _ := newRig(t)
	srv := httptest.NewServer(s.Handler())
	defer srv.Close()

	reqBody, _ := json.Marshal(AttestRequest{Path: "/account"})
	resp, err := http.Post(srv.URL+"/attest", "application/json", bytes.NewReader(reqBody))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
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
	if len(s)%2 != 0 {
		t.Fatalf("odd hex length: %d", len(s))
	}
	out := make([]byte, len(s)/2)
	for i := 0; i < len(s); i += 2 {
		hi := hexDigit(t, s[i])
		lo := hexDigit(t, s[i+1])
		out[i/2] = hi<<4 | lo
	}
	return out
}

func hexDigit(t *testing.T, c byte) byte {
	switch {
	case c >= '0' && c <= '9':
		return c - '0'
	case c >= 'a' && c <= 'f':
		return c - 'a' + 10
	case c >= 'A' && c <= 'F':
		return c - 'A' + 10
	}
	t.Fatalf("bad hex digit: %c", c)
	return 0
}
