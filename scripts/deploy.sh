#!/usr/bin/env bash
#
# Deploys the site to the production Cloudflare Worker.
#
# `pnpm`/`wrangler` require Node 22.13+, but the environment's default
# Node (via nvm) is sometimes older. This script switches to a Node 22
# version via nvm before building, so `pnpm deploy` "just works" instead
# of failing with ERR_UNKNOWN_BUILTIN_MODULE (node:sqlite).
#
# Usage:
#   pnpm deploy
#   scripts/deploy.sh

set -euo pipefail

REQUIRED_NODE="22"

if [ -s "$HOME/.nvm/nvm.sh" ]; then
	# shellcheck disable=SC1091
	source "$HOME/.nvm/nvm.sh"
	if ! nvm use "$REQUIRED_NODE" >/dev/null 2>&1; then
		echo "Node $REQUIRED_NODE not installed via nvm. Installing..."
		nvm install "$REQUIRED_NODE"
		nvm use "$REQUIRED_NODE"
	fi
else
	echo "Warning: nvm not found at ~/.nvm/nvm.sh -- using whatever 'node' is on PATH."
fi

echo "Using node $(node -v), pnpm $(pnpm -v 2>/dev/null || echo 'not found')"
echo ""

pnpm run build
pnpm exec wrangler deploy

echo ""
echo "Deployed. Verify at the live URL printed above (e.g. https://landing-page.mineme-shahriar.workers.dev)."
