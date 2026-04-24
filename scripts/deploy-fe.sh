#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${ROOT_DIR}/frontend"

BACKEND_PORT="${BACKEND_PORT:-3001}"
TUNNEL_TARGET="http://localhost:${BACKEND_PORT}"

TUNNEL_DIR="${HOME}/.talky-tunnel"
TUNNEL_STATE_FILE="${TUNNEL_DIR}/state.yml"
NGROK_LOG="${TUNNEL_DIR}/ngrok.log"
NGROK_PID_FILE="${TUNNEL_DIR}/ngrok.pid"
NGROK_API_URL="http://127.0.0.1:4040/api/tunnels"

DEPLOY_MSG_PREFIX="auto: ngrok tunnel + gh pages"

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
  api_error_file="${TUNNEL_DIR}/gh-pages-api-error.log"

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

set_github_pages_url() {
  if [[ "$VITE_BASE_PATH" == "/" ]]; then
    GH_PAGES_URL="https://${GITHUB_OWNER}.github.io/"
  else
    GH_PAGES_URL="https://${GITHUB_OWNER}.github.io/${GITHUB_REPO}/"
  fi
  GH_PAGES_ORIGIN="https://${GITHUB_OWNER}.github.io"
}

sync_backend_frontend_origin() {
  local backend_env
  backend_env="${ROOT_DIR}/backend/.env"

  if [[ ! -f "$backend_env" ]]; then
    say "backend/.env not found; skipping FRONTEND_URL sync"
    return
  fi

  if grep -q '^FRONTEND_URL=' "$backend_env"; then
    sed -i.bak "s|^FRONTEND_URL=.*|FRONTEND_URL=${GH_PAGES_ORIGIN}|" "$backend_env"
  else
    printf '\nFRONTEND_URL=%s\n' "$GH_PAGES_ORIGIN" >> "$backend_env"
  fi

  rm -f "${backend_env}.bak"
  say "Synced backend FRONTEND_URL to ${GH_PAGES_ORIGIN}"
}

verify_ngrok_config() {
  if ! ngrok config check >/dev/null 2>&1; then
    fail "ngrok is not configured. Run: ngrok config add-authtoken <your_token>"
  fi
}

start_ngrok_tunnel() {
  mkdir -p "$TUNNEL_DIR"

  if [[ -f "$NGROK_PID_FILE" ]]; then
    local old_pid
    old_pid="$(cat "$NGROK_PID_FILE" 2>/dev/null || true)"
    if [[ -n "$old_pid" ]] && kill -0 "$old_pid" 2>/dev/null; then
      say "Stopping previous ngrok process (pid: ${old_pid})"
      kill "$old_pid" || true
      sleep 1
    fi
  fi

  : > "$NGROK_LOG"

  say "Starting ngrok tunnel for ${TUNNEL_TARGET}"
  nohup ngrok http "$BACKEND_PORT" --log=stdout > "$NGROK_LOG" 2>&1 &
  NGROK_PID=$!
  echo "$NGROK_PID" > "$NGROK_PID_FILE"

  TUNNEL_URL=""
  local attempts=0
  until [[ -n "$TUNNEL_URL" || $attempts -ge 60 ]]; do
    if ! kill -0 "$NGROK_PID" 2>/dev/null; then
      tail -n 40 "$NGROK_LOG" >&2 || true
      fail "ngrok exited before publishing a tunnel URL"
    fi

    TUNNEL_URL="$(curl -sS "$NGROK_API_URL" 2>/dev/null | sed -nE 's/.*"public_url":"(https:[^"]+)".*/\1/p' | head -n 1 || true)"
    attempts=$((attempts + 1))
    sleep 1
  done

  [[ -n "$TUNNEL_URL" ]] || fail "Timed out waiting for ngrok tunnel URL. Check ${NGROK_LOG}"

  TUNNEL_WS_URL="${TUNNEL_URL/https:/wss:}"
  say "Ngrok tunnel URL: ${TUNNEL_URL}"
}

write_tunnel_state() {
  cat > "$TUNNEL_STATE_FILE" <<EOF
# Auto-generated by scripts/deploy-fe.sh
# Tunnel metadata
provider: ngrok
target: ${TUNNEL_TARGET}
endpoint: ${TUNNEL_URL}
websocket_endpoint: ${TUNNEL_WS_URL}
pid: ${NGROK_PID}
updated_at_utc: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF

  say "Updated ${TUNNEL_STATE_FILE}"
}

write_frontend_env() {
  cat > "${FRONTEND_DIR}/.env.production" <<EOF
VITE_API_URL=${TUNNEL_URL}
VITE_WS_URL=${TUNNEL_WS_URL}
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
  message="${DEPLOY_MSG_PREFIX} (${TUNNEL_URL})"

  say "Deploying frontend/dist to GitHub Pages"
  (
    cd "$FRONTEND_DIR"
    npx gh-pages -d dist -m "$message"
  )

}

main() {
  require_cmd git
  require_cmd npm
  require_cmd ngrok
  require_cmd gh
  require_cmd curl

  verify_ngrok_config

  [[ -d "$FRONTEND_DIR" ]] || fail "Frontend directory not found: ${FRONTEND_DIR}"
  [[ -d "${ROOT_DIR}/.git" ]] || fail "Run this from inside the git repository"

  local origin_url
  origin_url="$(cd "$ROOT_DIR" && git remote get-url origin)"
  [[ -n "$origin_url" ]] || fail "Git remote origin is missing"

  parse_remote "$origin_url"
  determine_base_path
  set_github_pages_url

  start_ngrok_tunnel
  sync_backend_frontend_origin
  write_tunnel_state
  write_frontend_env
  build_frontend
  deploy_gh_pages
  configure_github_pages
  wait_for_pages_url

  say ""
  say "Done."
  say "Backend API endpoint: ${TUNNEL_URL}"
  say "Frontend URL: ${GH_PAGES_URL}"
  say "Share this exact frontend URL: ${GH_PAGES_URL}"
  say "Ngrok log: ${NGROK_LOG}"
  if command -v pbcopy >/dev/null 2>&1; then
    printf '%s' "${GH_PAGES_URL}" | pbcopy
    say "Copied frontend URL to clipboard."
  fi
  say ""
  say "Note: Ngrok URL can change when tunnel restarts on free plans. Re-run this script whenever it changes."
}

main "$@"
