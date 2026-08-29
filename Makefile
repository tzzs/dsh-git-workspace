.PHONY: help install build test check clean pack integration agent-loop \
	local-install local-config local-run local-web local-pack local-tarball-install

NPM ?= npm
NODE ?= node
DSH ?= dsh
# DSH_HOME must live on a real ext4 filesystem (e.g. under $HOME), not on a
# WSL 9p/drvfs mount like /mnt/*: dsh enforces owner-only perms on its
# credentials file (chmod 600), which cannot be set on NTFS-backed mounts.
# Keep plugin source on /mnt/e; only profile data needs the native fs.
DSH_HOME ?= $(HOME)/.dsh-git-workspace
DSH_PROFILE ?= local
DSH_BIN ?= $(CURDIR)/.dsh-bin

# dsh plugin forwards package management to pnpm. This shim lets local
# development work on systems that provide pnpm through Corepack only.
PNPM_SHIM = $(DSH_BIN)/pnpm
DSH_ENV = PATH="$(DSH_BIN):$(PATH)" DSH_HOME="$(DSH_HOME)"
PKG_NAME ?= @tzzs/dsh-git-workspace
# Fail loud instead of booting a profile that cannot see the plugin. The dsh
# CLI defaults DSH_HOME to ~/.dsh when the variable is unset, so a profile
# installed under a different home boots without the client bundle (no entry in
# the boot manifest, no error, no UI). DSH_HOME must also live on a real ext4
# filesystem: dsh's credentials file needs chmod 600, impossible on NTFS-backed
# WSL /mnt/* mounts.
define check-dsh-home
	@case "$(DSH_HOME)" in /mnt/*|/media/*) \
		echo "ERROR: DSH_HOME='$(DSH_HOME)' is on a drvfs/NTFS mount (/mnt/*)." >&2; \
		echo "  dsh enforces chmod 600 on its credentials file, which fails on NTFS-backed mounts." >&2; \
		echo "  Use a native ext4 path instead, e.g.: make $(1) DSH_HOME=\$$HOME/.dsh-git-workspace" >&2; \
		exit 1; ;; esac
endef
define check-profile-includes-plugin
	@if ! $(DSH_ENV) $(DSH) --profile "$(1)" --dump-config 2>/dev/null | grep -q "$(PKG_NAME)"; then \
		echo "ERROR: $(PKG_NAME) is not in profile '$(1)' (DSH_HOME=$(DSH_HOME))." >&2; \
		echo "  The dsh CLI defaults DSH_HOME to ~/.dsh when unset; run 'dsh plugin --profile $(1) add' under the SAME DSH_HOME:" >&2; \
		echo "    export DSH_HOME=$(DSH_HOME)" >&2; \
		echo "    dsh plugin --profile $(1) add $(CURDIR)" >&2; \
		exit 1; \
	fi
endef

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
	@echo "  local-run            Start dsh with the local headless profile"
	@echo "  local-web            Install into the local web profile and serve the browser UI"
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
	$(call check-dsh-home,local-install)
	@mkdir -p "$(DSH_HOME)"
	$(DSH_ENV) $(DSH) plugin --profile "$(DSH_PROFILE)" add "$(CURDIR)"

local-config: local-install
	$(call check-profile-includes-plugin,$(DSH_PROFILE))
	$(DSH_ENV) $(DSH) --profile "$(DSH_PROFILE)" --dump-config

local-run: local-install
	$(call check-profile-includes-plugin,$(DSH_PROFILE))
	$(DSH_ENV) $(DSH) --profile "$(DSH_PROFILE)"

local-web: build $(PNPM_SHIM)
	$(call check-dsh-home,local-web)
	@mkdir -p "$(DSH_HOME)"
	$(DSH_ENV) $(DSH) plugin --profile web add "$(CURDIR)"
	$(call check-profile-includes-plugin,web)
	@echo ""
	@$(DSH_ENV) $(DSH) --profile web --port 0

local-pack: check
	$(NPM) pack

local-tarball-install: local-pack $(PNPM_SHIM)
	$(call check-dsh-home,local-tarball-install)
	@mkdir -p "$(DSH_HOME)"
	@tarball=$$($(NPM) pack --silent | tail -n 1); \
	$(DSH_ENV) $(DSH) plugin --profile "$(DSH_PROFILE)" add "$(CURDIR)/$$tarball"

clean:
	rm -rf lib "$(DSH_HOME)" "$(DSH_BIN)"
