// Command zktguard-attestor runs the reference attestor service.
//
//	go run ./cmd/zktguard-attestor \
//	  --addr 127.0.0.1:7677 \
//	  --upstream http://127.0.0.1:7676 \
//	  --key keys/attestor.hex
//
// If --key is omitted a fresh key is generated each launch — fine
// for development, never for any persistent deployment.
package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/Igorprostoff/zktguard/attestor/internal/attestor"
	"github.com/Igorprostoff/zktguard/attestor/internal/httpapi"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:7677", "listen address")
	upstream := flag.String("upstream", "https://127.0.0.1:7676", "upstream stub URL (TLS 1.3)")
	keyPath := flag.String("key", "", "path to 64-hex-char private key (optional; generates a fresh key when empty)")
	insecure := flag.Bool("insecure-skip-verify", false, "skip upstream TLS cert verification (dev only, for the self-signed stub cert)")
	flag.Parse()

	var att *attestor.Attestor
	if *keyPath == "" {
		att = attestor.Generate()
		x, y := att.Pubkey()
		fmt.Fprintf(os.Stderr, "[zktguard-attestor] ephemeral pubkey x=%s y=%s\n", x, y)
	} else {
		a, err := attestor.LoadFromFile(*keyPath)
		if err != nil {
			log.Fatalf("load key: %v", err)
		}
		att = a
	}

	srv := httpapi.New(att, *upstream, *insecure)
	fmt.Fprintf(os.Stderr, "[zktguard-attestor] listening on %s, upstream=%s\n", *addr, *upstream)
	if err := http.ListenAndServe(*addr, srv.Handler()); err != nil {
		log.Fatal(err)
	}
}
