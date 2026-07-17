// Command zktguard-stub runs the deterministic Telegram-shaped
// stub server used in tests and local development.
//
// v0.2 Phase B (Task B7): the stub terminates TLS with a self-signed
// certificate so the attestor exercises a real TLS 1.3 handshake and
// the RFC 5705 session exporter end to end. Generate the cert with
// scripts/gen_stub_cert.sh (it is gitignored); pass --cert/--key to
// point at it, or --plaintext to fall back to HTTP for debugging.
package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/Igorprostoff/zktguard/attestor/stub"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:7676", "listen address")
	certPath := flag.String("cert", "certs/stub.crt", "TLS certificate (PEM)")
	keyPath := flag.String("key", "certs/stub.key", "TLS private key (PEM)")
	plaintext := flag.Bool("plaintext", false, "serve plain HTTP instead of TLS (debug only)")
	flag.Parse()

	srv := stub.New()

	if *plaintext {
		fmt.Fprintf(os.Stderr, "[zktguard-stub] listening on http://%s (PLAINTEXT — dev only)\n", *addr)
		if err := http.ListenAndServe(*addr, srv.Handler()); err != nil {
			log.Fatal(err)
		}
		return
	}

	if _, err := os.Stat(*certPath); err != nil {
		log.Fatalf("stub: TLS cert %q not found — run scripts/gen_stub_cert.sh first (or pass --plaintext): %v", *certPath, err)
	}
	fmt.Fprintf(os.Stderr, "[zktguard-stub] listening on https://%s (TLS 1.3)\n", *addr)
	if err := http.ListenAndServeTLS(*addr, *certPath, *keyPath, srv.Handler()); err != nil {
		log.Fatal(err)
	}
}
