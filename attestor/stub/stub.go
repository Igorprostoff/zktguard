// Package stub serves a deterministic, Telegram-shaped response so
// the attestor and prover can be exercised end-to-end without
// touching the real Telegram API. For v0.1 the stub returns a
// canned JSON object whose `created_at` matches a fixture; tests
// can override it via NewWithBody.
package stub

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// Account is the bare-minimum Telegram-shaped response.
type Account struct {
	UserID    int64  `json:"user_id"`
	Username  string `json:"username"`
	CreatedAt int64  `json:"created_at"` // Unix seconds
}

// DefaultAccount is the fixture used when no override is supplied.
var DefaultAccount = Account{
	UserID:    1_000_001,
	Username:  "zktguard_demo",
	CreatedAt: 1_577_836_800, // 2020-01-01
}

// Server wraps an http.Handler returning the canned account JSON.
type Server struct {
	body []byte
}

// NewWithBody returns a Server that always responds with `body`.
func NewWithBody(body []byte) *Server {
	return &Server{body: body}
}

// New returns a Server backed by DefaultAccount.
func New() *Server {
	b, _ := json.Marshal(DefaultAccount)
	return &Server{body: b}
}

// Handler builds an http.ServeMux with /account.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleAccount)
	mux.HandleFunc("/account", s.handleAccount)
	return mux
}

func (s *Server) handleAccount(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	if _, err := w.Write(s.body); err != nil {
		fmt.Println("stub: write:", err)
	}
}
