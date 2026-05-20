// Package httpapi exposes the attestor over HTTP. The endpoints
// are intentionally minimal — production deployments would add
// rate limiting, auth, audit logging, etc.
package httpapi

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"time"

	"github.com/Igorprostoff/zktguard/attestor/internal/attestor"
)

// Server is the HTTP handler set.
type Server struct {
	att      *attestor.Attestor
	stubURL  string
	now      func() time.Time
}

// New returns a Server. stubURL is the upstream "Telegram-shaped"
// endpoint the attestor proxies to — in v0 this is the local stub.
func New(att *attestor.Attestor, stubURL string) *Server {
	return &Server{att: att, stubURL: stubURL, now: time.Now}
}

// Handler builds an http.ServeMux with /attest, /pubkey, /health.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/pubkey", s.handlePubkey)
	mux.HandleFunc("/attest", s.handleAttest)
	return mux
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
	// Nonce as a decimal string. Required.
	Nonce string `json:"nonce"`
}

// AttestResponse mirrors what the prover needs as circuit input.
type AttestResponse struct {
	// Hex-encoded SHA-256 of the upstream response body. In a real
	// proxy attestor this would be the TLS record stream commitment;
	// v0 uses SHA-256 for simplicity since the stub speaks plaintext.
	CiphertextHashHex string `json:"ciphertext_hash_hex"`
	// Base64 of the upstream response body (so the prover can
	// witness it as the circuit's plaintext).
	BodyHex string `json:"body_hex"`
	// Poseidon digest the EdDSA signature is over.
	TranscriptDigest string `json:"transcript_digest"`
	// EdDSA-BabyJubjub signature triple.
	R8x string `json:"r8x"`
	R8y string `json:"r8y"`
	S   string `json:"s"`
	// Attestor pubkey at sign time.
	PubkeyX string `json:"pubkey_x"`
	PubkeyY string `json:"pubkey_y"`
}

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
	if req.Nonce == "" {
		writeErr(w, http.StatusBadRequest, "nonce is required")
		return
	}
	nonce, ok := new(big.Int).SetString(req.Nonce, 10)
	if !ok {
		writeErr(w, http.StatusBadRequest, "nonce must be a decimal integer")
		return
	}

	path := req.Path
	if path == "" {
		path = "/"
	}
	url := s.stubURL + path

	body, err := fetchBody(url)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "upstream: %v", err)
		return
	}

	r8x, r8y, sScalar, digest, err := s.att.Sign(body, nonce)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "sign: %v", err)
		return
	}
	cipherHash := sha256.Sum256(body)
	x, y := s.att.Pubkey()

	writeJSON(w, http.StatusOK, AttestResponse{
		CiphertextHashHex: hex.EncodeToString(cipherHash[:]),
		BodyHex:           hex.EncodeToString(body),
		TranscriptDigest:  digest.String(),
		R8x:               r8x.String(),
		R8y:               r8y.String(),
		S:                 sScalar.String(),
		PubkeyX:           x.String(),
		PubkeyY:           y.String(),
	})
}

func fetchBody(url string) ([]byte, error) {
	resp, err := http.Get(url) //nolint:gosec // url is operator-controlled
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func writeJSON(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, format string, a ...interface{}) {
	writeJSON(w, code, map[string]string{"error": fmt.Sprintf(format, a...)})
}
