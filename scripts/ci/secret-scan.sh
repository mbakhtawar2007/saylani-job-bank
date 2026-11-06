#!/usr/bin/env bash
# Secret scan for CI: fails if a high-confidence secret format is found in any
# tracked file. Grep-based on purpose — no third-party scanner binary or action
# to vet, and the patterns below are specific enough to stay quiet on this repo
# (test fixtures use dummy passwords like 'not-the-password', so generic
# `password = ...` patterns are deliberately NOT scanned; they would drown the
# signal. The real protection for those is code review + the .env rules below).
#
# What is scanned (tracked AND untracked files, via `git grep --untracked`;
# .gitignore is respected, so the local .env — which holds real values — is
# never scanned, while a stray secret file a developer forgot to ignore is):
#   - private key blocks
#   - AWS access keys, GitHub tokens, Slack tokens, Stripe/SendGrid live keys,
#     npm tokens, OpenAI-style sk- keys
#   - tracked .env files (only .env.example may be tracked) and tracked key files
set -euo pipefail

fail=0
say() { printf '%s\n' "$*"; }

check() {
  local label="$1"; shift
  # git grep exits 1 when nothing matches; that is the passing case.
  # --untracked also covers files not yet committed (still respecting .gitignore).
  if git grep --untracked -nE -- "$@" -- . > /tmp/secret-scan-hits.txt 2>/dev/null; then
    say "✘ secret-scan: $label"
    cat /tmp/secret-scan-hits.txt
    fail=1
  fi
}

check 'private key block' '-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----'
check 'AWS access key' 'AKIA[0-9A-Z]{16}'
check 'GitHub token' '(ghp_|gho_|ghu_|ghs_|ghr_|github_pat_)[A-Za-z0-9_]{10,}'
check 'Slack token' 'xox[baprs]-[A-Za-z0-9-]{10,}'
check 'Stripe live key' '(sk_live_|rk_live_)[A-Za-z0-9]{16,}'
check 'SendGrid key' 'SG\.[A-Za-z0-9_-]{22,}'
check 'npm token' 'npm_[A-Za-z0-9]{20,}'
check 'OpenAI-style key' 'sk-[A-Za-z0-9]{20,}'

# Tracked .env files: only .env.example may be committed. (.env is gitignored;
# if one ever lands in git, this fails the build instead of leaking silently.)
if git ls-files | grep -E '(^|/)\.env(\.|$)' | grep -v '\.env\.example$' > /tmp/secret-scan-env.txt; then
  say '✘ secret-scan: tracked .env file (only .env.example may be committed):'
  cat /tmp/secret-scan-env.txt
  fail=1
fi

# Tracked private-key / certificate files.
if git ls-files | grep -E '\.(pem|key|p12|pfx|keystore)$' > /tmp/secret-scan-keys.txt; then
  say '✘ secret-scan: tracked private-key file:'
  cat /tmp/secret-scan-keys.txt
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  say 'secret-scan FAILED: rotate any real secret above, purge it from git history, and re-run.'
  exit 1
fi
say '✔ secret-scan: no secrets found in tracked or untracked files'
