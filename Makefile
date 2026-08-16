.PHONY: help install build test check clean pack integration agent-loop \
	local-install local-config local-run local-pack local-tarball-install

NPM ?= npm
NODE ?= node
DSH ?= dsh
DSH_HOME ?= $(CURDIR)/.dsh-local
DSH_PROFILE ?= local
DSH_BIN ?= $(CURDIR)/.dsh-bin

# dsh plugin forwards package management to pnpm. This shim lets local
# development work on systems that provide pnpm through Corepack only.
PNPM_SHIM = $(DSH_BIN)/pnpm
DSH_ENV = PATH="$(DSH_BIN):$(PATH)" DSH_HOME="$(DSH_HOME)"

help:
	@echo "Available targets:"
	@echo "  install              Install npm dependencies"
	@echo "  build                Compile TypeScript to lib/"
	@echo "  test                 Build and run automated tests"
	@echo "  check                Run the complete project check"
	@echo "  integration          Run the real Harness Agent Loop integration check"
	@echo "  agent-loop           Alias for integration"
	@echo "  pack                 Create an npm tarball"
	@echo "  local-install        Install this checkout into an isolated dsh profile"
	@echo "  local-config         Show the local profile composition"
	@echo "  local-run            Start dsh with the local profile"
	@echo "  local-pack           Build an npm tarball for local installation"
	@echo "  local-tarball-install Install the local tarball into the profile"
	@echo "  clean                Remove generated build and local profile output"

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

$(PNPM_SHIM):
	@mkdir -p "$(DSH_BIN)"
	@printf '%s\n' '#!/bin/sh' 'exec corepack pnpm "$$@"' > "$(PNPM_SHIM)"
	@chmod +x "$(PNPM_SHIM)"

local-install: build $(PNPM_SHIM)
	@mkdir -p "$(DSH_HOME)"
	$(DSH_ENV) $(DSH) plugin --profile "$(DSH_PROFILE)" add "$(CURDIR)"

local-config: local-install
	$(DSH_ENV) $(DSH) --profile "$(DSH_PROFILE)" --dump-config

local-run: local-install
	$(DSH_ENV) $(DSH) --profile "$(DSH_PROFILE)"

local-pack: check
	$(NPM) pack

local-tarball-install: local-pack $(PNPM_SHIM)
	@mkdir -p "$(DSH_HOME)"
	@tarball=$$($(NPM) pack --silent | tail -n 1); \\
	$(DSH_ENV) $(DSH) plugin --profile "$(DSH_PROFILE)" add "$(CURDIR)/$$tarball"

clean:
	rm -rf lib "$(DSH_HOME)" "$(DSH_BIN)"
