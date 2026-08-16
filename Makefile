.PHONY: help install build test check clean pack integration agent-loop

NPM ?= npm
NODE ?= node

help:
	@echo "Available targets:"
	@echo "  install      Install npm dependencies"
	@echo "  build        Compile TypeScript to lib/"
	@echo "  test         Build and run automated tests"
	@echo "  check        Run the complete project check"
	@echo "  integration  Run the real Harness Agent Loop integration check"
	@echo "  agent-loop   Alias for integration"
	@echo "  pack         Create an npm tarball"
	@echo "  clean        Remove generated build output"

install:
	$(NPM) install

build:
	$(NPM) run build

test:
	$(NPM) test

check:
	$(NPM) run check

integration: build
	$(NODE) scripts/agent-loop-integration.mjs

agent-loop: integration

pack: check
	$(NPM) pack

clean:
	rm -rf lib
