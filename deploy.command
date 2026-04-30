#!/usr/bin/env bash
# Zero Training Video Generator — one-shot GitHub Pages deploy.
#
# What it does:
#   1. Verifies you have `gh` (GitHub CLI) and you're logged in.
#   2. Initializes git in this folder (if not already).
#   3. Creates a public repo named `zero-training-video-generator` on
#      your GitHub account.
#   4. Pushes the current code to `main`.
#   5. Enables GitHub Pages, serving from main / root.
#   6. Prints the live URL.
#
# Re-running is safe: if the repo already exists, the script just pushes
# the latest changes and re-confirms Pages is enabled.

set -e
cd "$(dirname "$0")"

REPO_NAME="zero-training-video-generator"
REPO_DESC="Zero Training Video Generator — AI-powered concept training videos. Framework-driven script, ElevenLabs voice, GSAP-animated single-file HTML output."

ok()   { printf "  \033[32m✓\033[0m  %s\n" "$1"; }
say()  { printf "     %s\n" "$1"; }
fail() { printf "  \033[31m✗\033[0m  %s\n" "$1"; exit 1; }

clear
cat <<'EOF'

  ╔══════════════════════════════════════════════════════════╗
  ║   Zero Training Video Generator                          ║
  ║   Deploy to GitHub Pages                                 ║
  ╚══════════════════════════════════════════════════════════╝

EOF

# ---- 1. Pre-flight checks -------------------------------------------------
if ! command -v git >/dev/null 2>&1; then
  fail "git not found. Install from https://git-scm.com"
fi
ok "git found"

if ! command -v gh >/dev/null 2>&1; then
  echo ""
  echo "  GitHub CLI (gh) is not installed."
  echo "  Install: https://cli.github.com (or 'brew install gh' on Mac)"
  echo "  Then re-run this script."
  exit 1
fi
ok "gh found"

if ! gh auth status >/dev/null 2>&1; then
  echo ""
  echo "  You're not logged in to GitHub via gh. Running 'gh auth login'…"
  echo ""
  gh auth login
fi
ok "gh authenticated"

USER=$(gh api user --jq '.login')
say "GitHub user: $USER"
echo ""

# ---- 2. Local git init ----------------------------------------------------
if [ ! -d ".git" ]; then
  git init -b main >/dev/null
  ok "git repo initialized (branch: main)"
else
  ok "git repo already exists"
fi

# Make sure we're on main
git symbolic-ref HEAD refs/heads/main 2>/dev/null || git checkout -b main 2>/dev/null || true

# Set author identity if missing
if ! git config user.email >/dev/null; then
  git config user.email "social@z-ro.co"
  git config user.name  "Zero"
fi

git add -A
if ! git diff --cached --quiet; then
  git commit -m "Deploy: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >/dev/null
  ok "committed local changes"
else
  ok "no local changes to commit"
fi

# ---- 3. Create or reuse the GitHub repo -----------------------------------
if gh repo view "$USER/$REPO_NAME" >/dev/null 2>&1; then
  ok "repo $USER/$REPO_NAME already exists — will push to it"
  if ! git remote get-url origin >/dev/null 2>&1; then
    git remote add origin "https://github.com/$USER/$REPO_NAME.git"
  fi
else
  echo ""
  say "Creating GitHub repo: $USER/$REPO_NAME"
  gh repo create "$REPO_NAME" --public --description "$REPO_DESC" --source=. --remote=origin --push
  ok "repo created + first push complete"
fi

# ---- 4. Push (idempotent if create-and-push already ran) ------------------
if git remote get-url origin >/dev/null 2>&1; then
  echo ""
  say "Pushing to origin/main…"
  git push -u origin main
  ok "push complete"
fi

# ---- 5. Enable GitHub Pages -----------------------------------------------
echo ""
say "Enabling GitHub Pages…"

# Try to create Pages config; if it already exists we update it instead.
if ! gh api -X POST "/repos/$USER/$REPO_NAME/pages" \
      -f source.branch=main -f source.path=/ >/dev/null 2>&1; then
  gh api -X PUT "/repos/$USER/$REPO_NAME/pages" \
      -f source.branch=main -f source.path=/ >/dev/null 2>&1 || true
fi

# Verify Pages is configured
if gh api "/repos/$USER/$REPO_NAME/pages" --jq '.html_url' >/dev/null 2>&1; then
  PAGES_URL=$(gh api "/repos/$USER/$REPO_NAME/pages" --jq '.html_url')
  ok "Pages enabled"
else
  PAGES_URL="https://$USER.github.io/$REPO_NAME/"
  ok "Pages requested (URL may take a minute to come live)"
fi

# ---- 6. Done --------------------------------------------------------------
echo ""
echo "  ──────────────────────────────────────────────"
echo ""
printf "  \033[32mLive URL:\033[0m  %s\n" "$PAGES_URL"
echo ""
echo "  First deploy can take 1–3 minutes to propagate."
echo "  Re-run this script any time to push updates."
echo ""
echo "  Note about Kimi (Ollama): GitHub Pages is static-only,"
echo "  so the Ollama proxy isn't available there. On the live"
echo "  URL, use Claude or Gemini. For Kimi, run locally with"
echo "  ./run.command (Node mode) — the proxy works there."
echo ""
