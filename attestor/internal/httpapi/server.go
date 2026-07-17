// Package httpapi exposes the attestor over HTTP. The endpoints
// are intentionally minimal — production deployments would add
// rate limiting, auth, audit logging, etc.
package httpapi

import (
	"bytes"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/Igorprostoff/zktguard/attestor/internal/attestor"
	"github.com/Igorprostoff/zktguard/attestor/internal/session"
)

// Server is the HTTP handler set.
type Server struct {
	att      *attestor.Attestor
	stubURL  string
	now      func() time.Time
	insecure bool
	client   *http.Client
}

// New returns a Server. stubURL is the upstream "Telegram-shaped"
// endpoint the attestor proxies to — in v0 this is the local stub,
// which speaks TLS 1.3 (Task B7). insecure skips certificate
// verification, for the self-signed stub cert in dev only.
func New(att *attestor.Attestor, stubURL string, insecure bool) *Server {
	return &Server{
		att:      att,
		stubURL:  stubURL,
		now:      time.Now,
		insecure: insecure,
		client:   newTLSClient(insecure),
	}
}

// newTLSClient builds an HTTP client pinned to TLS 1.3. Go's
// crypto/tls does not let callers restrict the TLS 1.3 cipher-suite
// list (see internal/session for the full rationale), so the
// attestor enforces the ChaCha20-Poly1305 constraint by only ever
// emitting ChaCha20-Poly1305 sealings, not by the negotiated record
// suite. MinVersion 1.3 guarantees the RFC 5705 exporter is
// available for session binding.
func newTLSClient(insecure bool) *http.Client {
	return &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				MinVersion:         tls.VersionTLS13,
				InsecureSkipVerify: insecure, //nolint:gosec // dev-only, gated by --insecure-skip-verify
			},
		},
	}
}

// Handler builds an http.ServeMux with /attest, /pubkey, /health.
// All responses carry permissive CORS headers so the Mini App
// (served by Vite on a different origin in dev) can reach the
// attestor from a browser context.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/pubkey", s.handlePubkey)
	mux.HandleFunc("/attest", s.handleAttest)
	return withCORS(mux)
}

func withCORS(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h.ServeHTTP(w, r)
	})
}

type healthResp struct {
	Status    string `json:"status"`
	Timestamp int64  `json:"timestamp"`
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, healthResp{Status: "ok", Timestamp: s.now().Unix()})
}

type pubkeyResp struct {
	X string `json:"x"`
	Y string `json:"y"`
}

func (s *Server) handlePubkey(w http.ResponseWriter, _ *http.Request) {
	x, y := s.att.Pubkey()
	writeJSON(w, http.StatusOK, pubkeyResp{X: x.String(), Y: y.String()})
}

// AttestRequest is the body the prover sends.
type AttestRequest struct {
	// Path on the upstream stub to hit. Defaults to "/".
	Path string `json:"path"`
	// Nonce as a decimal string. Optional; echoed back so the caller
	// can bind the attestation to its proof request. Not part of the
	// signed digest in v0.2 (the session exporter provides freshness).
	Nonce string `json:"nonce"`
}

// AttestResponse carries the ChaCha20-Poly1305 sealing the prover
// witnesses (Task B6). The old v0.1 shape (plaintext body hash +
// Poseidon(body ‖ nonce) signature) is gone — v0.2 clients break, as
// the DoD permits.
type AttestResponse struct {
	// ChaCha20-Poly1305 sealing of the upstream body, hex-encoded.
	KeyHex        string `json:"key_hex"`        // 32 bytes
	NonceHex      string `json:"nonce_hex"`      // 12 bytes
	SaltHex       string `json:"salt_hex"`       // per-seal exporter context
	AADHex        string `json:"aad_hex"`        // AAD context
	CiphertextHex string `json:"ciphertext_hex"` // sealed body
	TagHex        string `json:"tag_hex"`        // 16-byte Poly1305 tag
	// Poseidon commitment over the sealing (the EdDSA payload).
	TranscriptDigest string `json:"transcript_digest"`
	// EdDSA-BabyJubjub signature triple over TranscriptDigest.
	R8x string `json:"r8x"`
	R8y string `json:"r8y"`
	S   string `json:"s"`
	// Attestor pubkey at sign time.
	PubkeyX string `json:"pubkey_x"`
	PubkeyY string `json:"pubkey_y"`
	// SHA-256 of the recovered plaintext, for quick client-side
	// sanity checks (not authenticated by the circuit).
	PlaintextHashHex string `json:"plaintext_hash_hex"`
	// Byte offset of the `"created_at"` marker in the plaintext — the
	// circuit's timestamp_offset witness hint. -1 if the marker is
	// absent (the prover then cannot build a valid witness).
	CreatedAtOffset int `json:"created_at_offset"`
	// Nonce echoed from the request.
	Nonce string `json:"nonce"`
}

// createdAtMarker is the JSON key the circuit's JsonTimestampExtract
// scans for; the offset points at its opening quote.
var createdAtMarker = []byte(`"created_at":`)

func (s *Server) handleAttest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "POST only")
		return
	}
	var req AttestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "decode body: %v", err)
		return
	}

	path := req.Path
	if path == "" {
		path = "/"
	}
	url := s.stubURL + path

	body, exp, err := s.fetchSealable(url)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "upstream: %v", err)
		return
	}

	sealed, err := session.Seal(exp, body)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "seal: %v", err)
		return
	}
	digest, err := sealed.Digest()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "digest: %v", err)
		return
	}
	r8x, r8y, sScalar := s.att.SignDigest(digest)
	x, y := s.att.Pubkey()
	ptHash := sha256.Sum256(body)
	offset := bytes.Index(body, createdAtMarker)

	writeJSON(w, http.StatusOK, AttestResponse{
		KeyHex:           hex.EncodeToString(sealed.Key),
		NonceHex:         hex.EncodeToString(sealed.Nonce),
		SaltHex:          hex.EncodeToString(sealed.Salt),
		AADHex:           hex.EncodeToString(sealed.AAD),
		CiphertextHex:    hex.EncodeToString(sealed.Ciphertext),
		TagHex:           hex.EncodeToString(sealed.Tag),
		TranscriptDigest: digest.String(),
		R8x:              r8x.String(),
		R8y:              r8y.String(),
		S:                sScalar.String(),
		PubkeyX:          x.String(),
		PubkeyY:          y.String(),
		PlaintextHashHex: hex.EncodeToString(ptHash[:]),
		CreatedAtOffset:  offset,
		Nonce:            req.Nonce,
	})
}

// fetchSealable performs the upstream request over TLS 1.3 and
// returns the response body together with a session.Exporter bound to
// the exact TLS connection that served it. A plaintext (non-TLS)
// upstream yields a nil connection state and is rejected — the
// attestor will not seal a body it did not fetch over an
// authenticated channel.
func (s *Server) fetchSealable(url string) ([]byte, session.Exporter, error) {
	resp, err := s.client.Get(url) //nolint:gosec // url is operator-controlled
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, nil, fmt.Errorf("status %d", resp.StatusCode)
	}
	if resp.TLS == nil {
		return nil, nil, fmt.Errorf("upstream is not TLS; a ChaCha20-Poly1305 session requires TLS 1.3")
	}
	exp, err := session.FromConnectionState(*resp.TLS)
	if err != nil {
		return nil, nil, err
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, nil, err
	}
	return body, exp, nil
}

func writeJSON(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, format string, a ...interface{}) {
	writeJSON(w, code, map[string]string{"error": fmt.Sprintf(format, a...)})
}
