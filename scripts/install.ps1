# -----------------------------------------------------------------------------
# Project:       MachineMaker
# Owner:         Joshua H. Kirby
# Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
# Last Modified: 2026-11-03
# -----------------------------------------------------------------------------
#
# Installs or updates MachineMaker on Windows by building it from source.
# The same command does both: the first run clones and installs, every later
# run pulls the latest commit of the branch and reinstalls over the top.
#
#   irm https://raw.githubusercontent.com/jhkirby/MachineMaker/prod/scripts/install.ps1 | iex
#
# Layout (all per-user, no admin rights needed):
#   %LOCALAPPDATA%\MachineMaker\source     git checkout the build runs from
#   %LOCALAPPDATA%\Programs\MachineMaker   the installed app
#   Start Menu + Desktop shortcuts         "MachineMaker"
#
# Installed data (%APPDATA%\MachineMaker, Documents\MachineMaker) is never
# touched here, and is separate from a development checkout's data
# (... "MachineMaker Dev") - see src/main/app-channel.ts.
#
# Environment overrides: MACHINEMAKER_REPO (git URL), MACHINEMAKER_BRANCH.
#
# Keep this file plain ASCII: Windows PowerShell 5.1 reads a BOM-less script
# run with -File as Windows-1252, where a UTF-8 em dash decodes to a curly
# quote that ends the string it's in and breaks parsing for the whole file.

$ErrorActionPreference = "Stop"

$Repo = if ($env:MACHINEMAKER_REPO) { $env:MACHINEMAKER_REPO } else { "https://github.com/jhkirby/MachineMaker.git" }
$Branch = if ($env:MACHINEMAKER_BRANCH) { $env:MACHINEMAKER_BRANCH } else { "prod" }
$Root = Join-Path $env:LOCALAPPDATA "MachineMaker"
$Source = Join-Path $Root "source"
$InstallDir = Join-Path $env:LOCALAPPDATA "Programs\MachineMaker"
$MinNodeMajor = 20

function Write-Step([string]$Message) {
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-Command([string]$Name, [string]$Hint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is required but was not found. $Hint"
  }
}

# Native commands don't throw on failure; stop on a non-zero exit instead of
# carrying on with a half-built app.
function Invoke-Checked([scriptblock]$Command, [string]$What) {
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$What failed (exit code $LASTEXITCODE)."
  }
}

Assert-Command git "Install it from https://git-scm.com/download/win"
Assert-Command node "Install Node.js $MinNodeMajor+ from https://nodejs.org"
Assert-Command npm "It ships with Node.js - reinstall Node from https://nodejs.org"
$NodeMajor = [int]((node --version).TrimStart("v").Split(".")[0])
if ($NodeMajor -lt $MinNodeMajor) {
  throw "Node.js $MinNodeMajor+ is required (found $(node --version))."
}

if (Test-Path (Join-Path $Source ".git")) {
  Write-Step "Updating source ($Branch)"
  Invoke-Checked { git -C $Source fetch --depth 1 origin $Branch } "git fetch"
  # The checkout is build-only - never edited by hand - so discarding any
  # local state is always safe and keeps updates from ever conflicting.
  Invoke-Checked { git -C $Source reset --hard "origin/$Branch" } "git reset"
  Invoke-Checked { git -C $Source clean -fdx -e node_modules } "git clean"
} else {
  Write-Step "Cloning $Repo ($Branch)"
  New-Item -ItemType Directory -Force $Root | Out-Null
  Invoke-Checked { git clone --depth 1 --branch $Branch $Repo $Source } "git clone"
}
$Commit = (git -C $Source rev-parse --short HEAD).Trim()

Push-Location $Source
try {
  Write-Step "Installing dependencies (npm ci)"
  # --ignore-scripts would be safer still, but electron's own postinstall
  # downloads the runtime binary the build needs.
  Invoke-Checked { npm ci --no-audit --no-fund } "npm ci"
  Write-Step "Building"
  Invoke-Checked { npm run build } "npm run build"
  Write-Step "Packaging"
  Invoke-Checked { npx --no-install electron-builder --win --dir --publish never } "electron-builder"
} finally {
  Pop-Location
}

$Unpacked = Join-Path $Source "dist\win-unpacked"
if (-not (Test-Path (Join-Path $Unpacked "MachineMaker.exe"))) {
  throw "Packaging finished but $Unpacked\MachineMaker.exe is missing."
}

Write-Step "Installing to $InstallDir"
# A running copy holds its files open; close it so they can be replaced.
Get-Process MachineMaker -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500
New-Item -ItemType Directory -Force $InstallDir | Out-Null
# /MIR makes the install an exact copy (removing files a new version dropped).
robocopy $Unpacked $InstallDir /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) {
  throw "Copying the app into place failed (robocopy exit code $LASTEXITCODE)."
}

Write-Step "Creating shortcuts"
$Exe = Join-Path $InstallDir "MachineMaker.exe"
$Shell = New-Object -ComObject WScript.Shell
$Targets = @(
  (Join-Path ([Environment]::GetFolderPath("Programs")) "MachineMaker.lnk"),
  (Join-Path ([Environment]::GetFolderPath("Desktop")) "MachineMaker.lnk")
)
foreach ($LinkPath in $Targets) {
  $Link = $Shell.CreateShortcut($LinkPath)
  $Link.TargetPath = $Exe
  $Link.WorkingDirectory = $InstallDir
  $Link.IconLocation = $Exe
  $Link.Save()
}

Write-Host ""
Write-Host "MachineMaker ($Branch @ $Commit) is installed." -ForegroundColor Green
Write-Host "Launch it from the Start Menu or Desktop. Run this same command again to update."
