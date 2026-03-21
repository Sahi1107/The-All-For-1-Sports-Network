#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# scan-secrets.sh
#
# Scans tracked source files for patterns that look like real secrets.
# Run manually:       npm run scan:secrets
# Pre-commit hook:    ln -s ../../scripts/scan-secrets.sh .git/hooks/pre-commit
#
# Exit codes:
#   0 — no issues found
#   1 — potential secrets detected (commit blocked if used as a hook)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

FOUND=0

# ── Files to scan ─────────────────────────────────────────────────────────────
# When run as a pre-commit hook, scan only staged files so the check is fast.
# When run manually (npm run scan:secrets), scan all tracked source files.

if git rev-parse --verify HEAD > /dev/null 2>&1; then
  # Existing repo: check staged changes + all tracked source files
  STAGED=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)
  TRACKED=$(git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' '*.json' '*.yaml' '*.yml' '*.toml' '*.sh' 2>/dev/null || true)
  FILES=$(echo -e "${STAGED}\n${TRACKED}" | sort -u | grep -v "node_modules" | grep -v "package-lock" || true)
else
  # Unborn repo: scan all source files relative to repo root
  FILES=$(find . \
    \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.json" -o -name "*.yaml" -o -name "*.yml" \) \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" \
    -not -name "package-lock.json" \
    2>/dev/null || true)
fi

if [ -z "$FILES" ]; then
  echo -e "${GREEN}✔ No source files to scan.${NC}"
  exit 0
fi

# ── Patterns ─────────────────────────────────────────────────────────────────
# Each entry is:  LABEL|REGEX
# The regex is passed to grep -E. It should NOT match .env.example placeholders.

PATTERNS=(
  # AWS
  "AWS access key ID|AKIA[0-9A-Z]{16}"
  "AWS secret|aws_secret_access_key\s*=\s*['\"][A-Za-z0-9/+=]{40}['\"]"
  # Private keys / certificates
  "Private key|-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY"
  # High-entropy hex secrets (≥64 chars) assigned in source code
  # Matches patterns like: secret = 'abc123...' but ignores content inside .example files
  "Long hex secret|['\"][0-9a-f]{64,}['\"]"
  # Generic password / secret assignment with a real-looking value
  "Hardcoded password|password\s*[:=]\s*['\"][^'\"]{8,}['\"]"
  "Hardcoded secret|secret\s*[:=]\s*['\"][^'\"]{8,}['\"]"
  # JWT secret set to a literal string (not from env)
  "Hardcoded JWT secret|jwt.*secret.*['\"][A-Za-z0-9_\-]{32,}['\"]"
  # Cloudinary format secrets
  "Cloudinary API secret|cloudinary.*api.?secret.*['\"][A-Za-z0-9_\-]{20,}['\"]"
  # Stripe
  "Stripe secret key|sk_live_[0-9a-zA-Z]{24}"
  "Stripe test key|sk_test_[0-9a-zA-Z]{24}"
  # SendGrid
  "SendGrid API key|SG\.[A-Za-z0-9\-_]{22}\.[A-Za-z0-9\-_]{43}"
  # Generic API keys assigned in source
  "Generic API key assignment|api.?key\s*[:=]\s*['\"][A-Za-z0-9_\-]{20,}['\"]"
  # GitHub tokens
  "GitHub token|gh[pousr]_[A-Za-z0-9_]{36}"
  # Slack tokens
  "Slack token|xox[baprs]-[0-9A-Za-z\-]{10,}"
  # VITE_ secrets (anything after VITE_ that looks like a key or secret)
  "VITE secret variable|VITE_(SECRET|KEY|TOKEN|PASS|API_SECRET|JWT)[A-Z_]*\s*=\s*['\"][^'\"]{8,}['\"]"
)

# ── Files to always skip ──────────────────────────────────────────────────────

SKIP_PATTERNS=(
  "\.env\.example$"
  "scan-secrets\.sh$"
  "package-lock\.json$"
)

# ── Scan ─────────────────────────────────────────────────────────────────────

echo ""
echo "Scanning for secrets in source files..."
echo ""

while IFS= read -r FILE; do
  [ -z "$FILE" ] && continue
  [ ! -f "$FILE" ] && continue

  # Skip allowlisted files
  SKIP=0
  for SKIP_PAT in "${SKIP_PATTERNS[@]}"; do
    if echo "$FILE" | grep -qE "$SKIP_PAT"; then
      SKIP=1
      break
    fi
  done
  [ "$SKIP" -eq 1 ] && continue

  for PATTERN_ENTRY in "${PATTERNS[@]}"; do
    LABEL="${PATTERN_ENTRY%%|*}"
    REGEX="${PATTERN_ENTRY##*|}"

    MATCHES=$(grep -nE "$REGEX" "$FILE" 2>/dev/null || true)
    if [ -n "$MATCHES" ]; then
      echo -e "${RED}✖ POTENTIAL SECRET: ${LABEL}${NC}"
      echo -e "  ${YELLOW}File:${NC} $FILE"
      # Print the line number and a truncated snippet (never print the full value)
      while IFS= read -r MATCH_LINE; do
        LINE_NUM=$(echo "$MATCH_LINE" | cut -d: -f1)
        echo -e "  ${YELLOW}Line $LINE_NUM${NC}"
      done <<< "$MATCHES"
      echo ""
      FOUND=1
    fi
  done

done <<< "$FILES"

# ── Result ───────────────────────────────────────────────────────────────────

if [ "$FOUND" -eq 1 ]; then
  echo -e "${RED}Secret scan FAILED.${NC}"
  echo ""
  echo "Review the files above. If the match is a false positive, you can:"
  echo "  • Use a placeholder value in source code and load the real value from .env"
  echo "  • Add a SKIP_PATTERNS entry to scripts/scan-secrets.sh"
  echo ""
  echo "If a real secret was accidentally staged:"
  echo "  1. Remove it from the file"
  echo "  2. Rotate/revoke the credential immediately — assume it is compromised"
  echo "  3. Run: git reset HEAD <file>  to unstage"
  exit 1
else
  echo -e "${GREEN}✔ No secrets detected.${NC}"
  echo ""
  exit 0
fi
