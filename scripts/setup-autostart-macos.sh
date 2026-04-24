#!/usr/bin/env bash

set -euo pipefail

ACTION="${1:-install}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCH_AGENTS_DIR="${HOME}/Library/LaunchAgents"
PLIST_PATH="${LAUNCH_AGENTS_DIR}/com.talky.deploy-fe.plist"
LOG_DIR="${HOME}/.talky-tunnel"
STDOUT_LOG="${LOG_DIR}/autostart.out.log"
STDERR_LOG="${LOG_DIR}/autostart.err.log"

say() {
  printf '%s\n' "$1"
}

ensure_dirs() {
  mkdir -p "$LAUNCH_AGENTS_DIR"
  mkdir -p "$LOG_DIR"
}

write_plist() {
  cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.talky.deploy-fe</string>

    <key>ProgramArguments</key>
    <array>
      <string>/bin/bash</string>
      <string>${ROOT_DIR}/scripts/deploy-fe.sh</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${ROOT_DIR}</string>

    <key>RunAtLoad</key>
    <true/>

    <key>StandardOutPath</key>
    <string>${STDOUT_LOG}</string>

    <key>StandardErrorPath</key>
    <string>${STDERR_LOG}</string>
  </dict>
</plist>
EOF
}

install_agent() {
  ensure_dirs
  write_plist

  launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
  launchctl load "$PLIST_PATH"

  say "Installed LaunchAgent: $PLIST_PATH"
  say "It will run on user login (including after reboot when you log in)."
  say "Logs: $STDOUT_LOG and $STDERR_LOG"
}

uninstall_agent() {
  launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
  rm -f "$PLIST_PATH"
  say "Removed LaunchAgent: $PLIST_PATH"
}

status_agent() {
  if [[ -f "$PLIST_PATH" ]]; then
    say "LaunchAgent file exists: $PLIST_PATH"
  else
    say "LaunchAgent file not found."
  fi

  launchctl list | grep -E "com\\.talky\\.deploy-fe" || true
}

case "$ACTION" in
  install)
    install_agent
    ;;
  uninstall)
    uninstall_agent
    ;;
  status)
    status_agent
    ;;
  *)
    say "Usage: $0 [install|uninstall|status]"
    exit 1
    ;;
esac
