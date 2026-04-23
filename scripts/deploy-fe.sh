#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${ROOT_DIR}/frontend"

BACKEND_PORT="${BACKEND_PORT:-3001}"
TUNNEL_TARGET="http://localhost:${BACKEND_PORT}"

CLOUDFLARED_DIR="${HOME}/.cloudflared"
CONFIG_FILE="${CLOUDFLARED_DIR}/config.yml"
QUICK_TUNNEL_LOG="${CLOUDFLARED_DIR}/quick-tunnel.log"
QUICK_TUNNEL_PID_FILE="${CLOUDFLARED_DIR}/quick-tunnel.pid"

DEPLOY_MSG_PREFIX="auto: quick tunnel + gh pages"

say() {
  printf '%s\n' "$1"
}

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

configure_github_pages() {
  say "Ensuring GitHub Pages is configured for branch: gh-pages"

  local api_error_file
  api_error_file="${CLOUDFLARED_DIR}/gh-pages-api-error.log"

  local err_msg
  if gh api "repos/${GITHUB_OWNER}/${GITHUB_REPO}/pages" >/dev/null 2>"$api_error_file"; then
    # Pages already exists — update the source branch
    if ! gh api --method PUT "repos/${GITHUB_OWNER}/${GITHUB_REPO}/pages" \
      -f source[branch]='gh-pages' \
      -f source[path]='/' >/dev/null 2>"$api_error_file"; then
      err_msg="$(cat "$api_error_file")"
      if [[ "$err_msg" == *"does not support GitHub Pages for this repository"* ]]; then
        fail "GitHub Pages is not available for this repository on your current plan. Make the repository public, or use a plan that supports private-repo Pages."
      fi
      fail "Failed to update GitHub Pages source. Details: ${err_msg}"
    fi
  else
    # Pages not yet configured — create it (409 means it already exists, treat as success)
    if ! gh api --method POST "repos/${GITHUB_OWNER}/${GITHUB_REPO}/pages" \
      -f source[branch]='gh-pages' \
      -f source[path]='/' >/dev/null 2>"$api_error_file"; then
      err_msg="$(cat "$api_error_file")"
      if [[ "$err_msg" == *"already enabled"* ]] || grep -q "409" "$api_error_file" 2>/dev/null; then
        say "GitHub Pages is already enabled — skipping create."
      elif [[ "$err_msg" == *"does not support GitHub Pages for this repository"* ]]; then
        fail "GitHub Pages is not available for this repository on your current plan. Make the repository public, or use a plan that supports private-repo Pages."
      else
        fail "Failed to create GitHub Pages site. Details: ${err_msg}"
      fi
    fi
  fi

  say "GitHub Pages source set to gh-pages/"
}

wait_for_pages_url() {
  if [[ "$VITE_BASE_PATH" == "/" ]]; then
    GH_PAGES_URL="https://${GITHUB_OWNER}.github.io"
  else
    GH_PAGES_URL="https://${GITHUB_OWNER}.github.io/${GITHUB_REPO}/"
  fi

  say "Waiting for GitHub Pages to become available at ${GH_PAGES_URL}"
  local attempts=0
  local status_code=""

  until [[ $attempts -ge 40 ]]; do
    status_code="$(curl -L -s -o /dev/null -w '%{http_code}' "$GH_PAGES_URL" || true)"
    if [[ "$status_code" == "200" ]]; then
      say "GitHub Pages is live (HTTP 200)"
      return
    fi

    attempts=$((attempts + 1))
    sleep 3
  done

  say "GitHub Pages still returning HTTP ${status_code:-unknown}. It may take a few more minutes to propagate."
}

parse_remote() {
  local remote_url="$1"
  local cleaned
  cleaned="${remote_url%.git}"

  if [[ "$cleaned" =~ ^git@github.com:(.+)/(.+)$ ]]; then
    GITHUB_OWNER="${BASH_REMATCH[1]}"
    GITHUB_REPO="${BASH_REMATCH[2]}"
    return
  fi

  if [[ "$cleaned" =~ ^https://github.com/(.+)/(.+)$ ]]; then
    GITHUB_OWNER="${BASH_REMATCH[1]}"
    GITHUB_REPO="${BASH_REMATCH[2]}"
    return
  fi

  fail "Could not parse GitHub owner/repo from origin URL: ${remote_url}"
}

determine_base_path() {
  local owner_lower repo_lower
  owner_lower="$(printf '%s' "$GITHUB_OWNER" | tr '[:upper:]' '[:lower:]')"
  repo_lower="$(printf '%s' "$GITHUB_REPO" | tr '[:upper:]' '[:lower:]')"

  if [[ "$repo_lower" == "${owner_lower}.github.io" ]]; then
    VITE_BASE_PATH="/"
  else
    VITE_BASE_PATH="/${GITHUB_REPO}/"
  fi
}

start_quick_tunnel() {
  mkdir -p "$CLOUDFLARED_DIR"

  if [[ -f "$QUICK_TUNNEL_PID_FILE" ]]; then
    local old_pid
    old_pid="$(cat "$QUICK_TUNNEL_PID_FILE" 2>/dev/null || true)"
    if [[ -n "$old_pid" ]] && kill -0 "$old_pid" 2>/dev/null; then
      say "Stopping previous quick tunnel process (pid: ${old_pid})"
      kill "$old_pid" || true
      sleep 1
    fi
  fi

  : > "$QUICK_TUNNEL_LOG"

  say "Starting cloudflared quick tunnel for ${TUNNEL_TARGET}"
  nohup cloudflared tunnel --url "$TUNNEL_TARGET" --no-autoupdate > "$QUICK_TUNNEL_LOG" 2>&1 &
  QUICK_TUNNEL_PID=$!
  echo "$QUICK_TUNNEL_PID" > "$QUICK_TUNNEL_PID_FILE"

  QUICK_TUNNEL_URL=""
  local attempts=0
  until [[ -n "$QUICK_TUNNEL_URL" || $attempts -ge 60 ]]; do
    if ! kill -0 "$QUICK_TUNNEL_PID" 2>/dev/null; then
      tail -n 40 "$QUICK_TUNNEL_LOG" >&2 || true
      fail "cloudflared exited before publishing a quick tunnel URL"
    fi

    QUICK_TUNNEL_URL="$(grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' "$QUICK_TUNNEL_LOG" | tail -n 1 || true)"
    attempts=$((attempts + 1))
    sleep 1
  done

  [[ -n "$QUICK_TUNNEL_URL" ]] || fail "Timed out waiting for quick tunnel URL. Check ${QUICK_TUNNEL_LOG}"

  QUICK_TUNNEL_WS_URL="${QUICK_TUNNEL_URL/https:/wss:}"
  say "Quick tunnel URL: ${QUICK_TUNNEL_URL}"
}

write_cloudflared_config() {
  cat > "$CONFIG_FILE" <<EOF
# Auto-generated by scripts/deploy-fe.sh
# Quick tunnel mode metadata (not used by named tunnel run)
mode: quick
target: ${TUNNEL_TARGET}
endpoint: ${QUICK_TUNNEL_URL}
websocket_endpoint: ${QUICK_TUNNEL_WS_URL}
pid: ${QUICK_TUNNEL_PID}
updated_at_utc: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF

  say "Updated ${CONFIG_FILE}"
}

write_frontend_env() {
  cat > "${FRONTEND_DIR}/.env.production" <<EOF
VITE_API_URL=${QUICK_TUNNEL_URL}
VITE_WS_URL=${QUICK_TUNNEL_WS_URL}
EOF

  say "Updated ${FRONTEND_DIR}/.env.production"
}

build_frontend() {
  say "Installing frontend dependencies"
  (cd "$FRONTEND_DIR" && npm install)

  say "Building frontend with base path: ${VITE_BASE_PATH}"
  (
    cd "$FRONTEND_DIR"
    npx tsc
    npx vite build --base="$VITE_BASE_PATH"
    cp dist/index.html dist/404.html
    touch dist/.nojekyll
  )
}

deploy_gh_pages() {
  local message
  message="${DEPLOY_MSG_PREFIX} (${QUICK_TUNNEL_URL})"

  say "Deploying frontend/dist to GitHub Pages"
  (
    cd "$FRONTEND_DIR"
    npx gh-pages -d dist -m "$message"
  )

}

main() {
  require_cmd git
  require_cmd npm
  require_cmd cloudflared
  require_cmd gh
  require_cmd curl

  [[ -d "$FRONTEND_DIR" ]] || fail "Frontend directory not found: ${FRONTEND_DIR}"
  [[ -d "${ROOT_DIR}/.git" ]] || fail "Run this from inside the git repository"

  local origin_url
  origin_url="$(cd "$ROOT_DIR" && git remote get-url origin)"
  [[ -n "$origin_url" ]] || fail "Git remote origin is missing"

  parse_remote "$origin_url"
  determine_base_path

  start_quick_tunnel
  write_cloudflared_config
  write_frontend_env
  build_frontend
  deploy_gh_pages
  configure_github_pages
  wait_for_pages_url

  say ""
  say "Done."
  say "Backend API endpoint: ${QUICK_TUNNEL_URL}"
  say "Frontend URL: ${GH_PAGES_URL}"
  say "Quick tunnel log: ${QUICK_TUNNEL_LOG}"
  say ""
  say "Note: Quick tunnel URL changes each run. Re-run this script whenever it changes."
}

main "$@"
