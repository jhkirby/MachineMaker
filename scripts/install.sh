#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Project:       MachineMaker
# Owner:         Joshua H. Kirby
# Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
# Last Modified: 2026-11-02
# -----------------------------------------------------------------------------
#
# Installs or updates MachineMaker on macOS or Linux by building it from
# source. The same command does both: the first run clones and installs,
# every later run pulls the latest commit of the branch and reinstalls.
#
#   curl -fsSL https://raw.githubusercontent.com/jhkirby/MachineMaker/prod/scripts/install.sh | bash
#
# Layout (per-user, no root needed except the one Linux sandbox step below):
#   ~/.machinemaker/source                git checkout the build runs from
#   macOS: ~/Applications/MachineMaker.app
#   Linux: ~/.local/share/machinemaker/app, launcher ~/.local/bin/machinemaker,
#          menu entry ~/.local/share/applications/machinemaker.desktop
#
# Installed data is never touched here, and is separate from a development
# checkout's ("MachineMaker Dev") — see src/main/app-channel.ts.
#
# Environment overrides: MACHINEMAKER_REPO (git URL), MACHINEMAKER_BRANCH.

set -euo pipefail

REPO="${MACHINEMAKER_REPO:-https://github.com/jhkirby/MachineMaker.git}"
BRANCH="${MACHINEMAKER_BRANCH:-prod}"
ROOT="$HOME/.machinemaker"
SOURCE="$ROOT/source"
MIN_NODE_MAJOR=20

step() { printf '\033[36m==> %s\033[0m\n' "$1"; }
fail() { printf '\033[31merror: %s\033[0m\n' "$1" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "$1 is required but was not found. $2"; }

need git "Install it with your package manager (or Xcode Command Line Tools on macOS)."
need node "Install Node.js ${MIN_NODE_MAJOR}+ from https://nodejs.org"
need npm "It ships with Node.js — reinstall Node from https://nodejs.org"
node_major="$(node --version | sed 's/^v//; s/\..*//')"
[ "$node_major" -ge "$MIN_NODE_MAJOR" ] || fail "Node.js ${MIN_NODE_MAJOR}+ is required (found $(node --version))."

case "$(uname -s)" in
  Darwin) PLATFORM=mac ;;
  Linux) PLATFORM=linux ;;
  *) fail "Unsupported OS $(uname -s) — on Windows use scripts/install.ps1." ;;
esac

if [ -d "$SOURCE/.git" ]; then
  step "Updating source ($BRANCH)"
  git -C "$SOURCE" fetch --depth 1 origin "$BRANCH"
  # The checkout is build-only — never edited by hand — so discarding local
  # state is always safe and keeps updates from ever conflicting.
  git -C "$SOURCE" reset --hard "origin/$BRANCH"
  git -C "$SOURCE" clean -fdx -e node_modules
else
  step "Cloning $REPO ($BRANCH)"
  mkdir -p "$ROOT"
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$SOURCE"
fi
commit="$(git -C "$SOURCE" rev-parse --short HEAD)"

cd "$SOURCE"
step "Installing dependencies (npm ci)"
npm ci --no-audit --no-fund
step "Building"
npm run build
step "Packaging"
npx --no-install electron-builder "--$PLATFORM" --dir --publish never

if [ "$PLATFORM" = mac ]; then
  app="$(find dist -maxdepth 2 -name 'MachineMaker.app' -type d | head -n 1)"
  [ -n "$app" ] || fail "Packaging finished but MachineMaker.app is missing."
  step "Installing to ~/Applications"
  # Quit a running copy so its bundle can be replaced.
  osascript -e 'quit app "MachineMaker"' >/dev/null 2>&1 || true
  mkdir -p "$HOME/Applications"
  rm -rf "$HOME/Applications/MachineMaker.app"
  cp -R "$app" "$HOME/Applications/"
  # Built locally and unsigned: clear the quarantine flag so Gatekeeper
  # doesn't refuse to open it.
  xattr -cr "$HOME/Applications/MachineMaker.app" || true
  launch_hint="Open MachineMaker from ~/Applications (or Spotlight)."
else
  unpacked="dist/linux-unpacked"
  [ -x "$unpacked/machinemaker" ] || fail "Packaging finished but $unpacked/machinemaker is missing."
  install_dir="$HOME/.local/share/machinemaker/app"
  step "Installing to $install_dir"
  pkill -x machinemaker >/dev/null 2>&1 || true
  rm -rf "$install_dir"
  mkdir -p "$(dirname "$install_dir")" "$HOME/.local/bin" "$HOME/.local/share/applications"
  cp -R "$unpacked" "$install_dir"

  # Chromium's setuid sandbox helper must be root-owned with the setuid bit,
  # or (on distros without unprivileged user namespaces) the app won't start.
  # This is the one step that needs sudo; the app stays sandboxed either way
  # rather than falling back to --no-sandbox.
  if [ -f "$install_dir/chrome-sandbox" ]; then
    step "Configuring the Chromium sandbox helper (needs sudo)"
    sudo chown root:root "$install_dir/chrome-sandbox"
    sudo chmod 4755 "$install_dir/chrome-sandbox"
  fi

  ln -sf "$install_dir/machinemaker" "$HOME/.local/bin/machinemaker"
  cp "$SOURCE/build/icon.png" "$HOME/.local/share/machinemaker/icon.png"
  cat > "$HOME/.local/share/applications/machinemaker.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=MachineMaker
Comment=Hand-authored RTL block diagrams
Exec=$install_dir/machinemaker %U
Icon=$HOME/.local/share/machinemaker/icon.png
Terminal=false
Categories=Development;Electronics;
DESKTOP
  launch_hint="Launch MachineMaker from your app menu, or run: machinemaker"
fi

printf '\n\033[32mMachineMaker (%s @ %s) is installed.\033[0m\n' "$BRANCH" "$commit"
echo "$launch_hint"
echo "Run this same command again to update."
