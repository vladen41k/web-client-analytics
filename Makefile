ifneq (,$(wildcard .env))
include .env
export
endif

.PHONY: run test fmt

run:
	GOCACHE=$(CURDIR)/.cache/go-build go run ./cmd/client

test:
	GOCACHE=$(CURDIR)/.cache/go-build go test ./...

fmt:
	go fmt ./...
