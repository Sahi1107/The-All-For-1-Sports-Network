#!/usr/bin/env bash
# install-hooks.sh
#
# Called automatically by `npm install` (via the "prepare" script in package.json).
# Installs the secrets-scanning pre-commit hook so it runs before every commit.

set -euo pipefail

HOOKS_DIR=".git/hooks"
HOOK_FILE="$HOOKS_DIR/pre-commit"
SCRIPT_PATH="scripts/scan-secrets.sh"

if [ ! -d ".git" ]; then
  echo "Not a git repository — skipping hook installation."
  exit 0
fi

mkdir -p "$HOOKS_DIR"

cat > "$HOOK_FILE" << 'EOF'
#!/usr/bin/env bash
# Auto-installed by scripts/install-hooks.sh
exec bash scripts/scan-secrets.sh
EOF

chmod +x "$HOOK_FILE"
echo "✔ Pre-commit secrets-scan hook installed (.git/hooks/pre-commit)"
