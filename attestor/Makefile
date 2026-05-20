SHELL := bash

# CGO is disabled because of a known macOS Sonoma + Go 1.21 linker
# regression (`missing LC_UUID load command`). CI on Linux is fine
# either way; setting it here makes `make test` work everywhere.
export CGO_ENABLED ?= 0

GOFLAGS ?=

.PHONY: build test fmt vet attestor stub key

build:
	go build $(GOFLAGS) ./...

test:
	go test $(GOFLAGS) ./...

fmt:
	gofmt -w .

vet:
	go vet ./...

attestor:
	go build $(GOFLAGS) -o bin/zktguard-attestor ./cmd/zktguard-attestor

stub:
	go build $(GOFLAGS) -o bin/zktguard-stub ./cmd/zktguard-stub

key:
	bash scripts/gen_attestor_key.sh keys/attestor.hex
