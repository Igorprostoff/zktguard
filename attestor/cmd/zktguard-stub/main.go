// Command zktguard-stub runs the deterministic Telegram-shaped
// stub server used in tests and local development.
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
	flag.Parse()

	srv := stub.New()
	fmt.Fprintf(os.Stderr, "[zktguard-stub] listening on %s\n", *addr)
	if err := http.ListenAndServe(*addr, srv.Handler()); err != nil {
		log.Fatal(err)
	}
	_ = os.Args
}
