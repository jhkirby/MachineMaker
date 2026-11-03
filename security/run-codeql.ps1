# -----------------------------------------------------------------------------
# Project:       MachineMaker
# Owner:         Joshua H. Kirby
# Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
# Last Modified: 2026-11-02
# -----------------------------------------------------------------------------
#
# Runs the same CodeQL analysis as .github/workflows/codeql.yml, locally.
# Writes security/codeql/results.sarif (open it with the VS Code "SARIF
# Viewer" extension, or read the summary this prints).
#
#   pwsh security/run-codeql.ps1
#
# Uses `codeql` from PATH, falling back to the CLI the VS Code CodeQL
# extension downloads. The database goes in a temp folder, not the repo.

$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot

$CodeQL = (Get-Command codeql -ErrorAction SilentlyContinue).Source
if (-not $CodeQL) {
  $CodeQL = Get-ChildItem "$env:APPDATA\Code\User\globalStorage\github.vscode-codeql\distribution*\codeql\codeql.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $CodeQL) {
  throw "CodeQL CLI not found. Install it (https://github.com/github/codeql-cli-binaries) or the VS Code CodeQL extension."
}

$Db = Join-Path ([IO.Path]::GetTempPath()) "machinemaker-codeql-db"
$Sarif = Join-Path $Repo "security\codeql\results.sarif"

& $CodeQL database create $Db --overwrite --language=javascript-typescript `
  --source-root=$Repo --codescanning-config=(Join-Path $Repo "security\codeql\codeql-config.yml")
if ($LASTEXITCODE -ne 0) { throw "codeql database create failed." }

& $CodeQL database analyze $Db "codeql/javascript-queries:codeql-suites/javascript-security-extended.qls" `
  --download --format=sarif-latest --output=$Sarif --threads=0
if ($LASTEXITCODE -ne 0) { throw "codeql database analyze failed." }

$Results = (Get-Content $Sarif -Raw | ConvertFrom-Json).runs[0].results
Write-Host "CodeQL findings: $($Results.Count)"
foreach ($R in $Results) {
  $Loc = $R.locations[0].physicalLocation
  Write-Host ("  {0}  {1}:{2}  {3}" -f $R.ruleId, $Loc.artifactLocation.uri, $Loc.region.startLine, $R.message.text)
}
