#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Project:       MachineMaker
# Owner:         Joshua H. Kirby
# Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
# Last Modified: 2026-11-02
# -----------------------------------------------------------------------------
#
# Runs the same CodeQL analysis as .github/workflows/codeql.yml, locally,
# writing security/codeql/results.sarif. Needs `codeql` on PATH.
#
#   bash security/run-codeql.sh

set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
command -v codeql >/dev/null || { echo "codeql CLI not found on PATH" >&2; exit 1; }

db="${TMPDIR:-/tmp}/machinemaker-codeql-db"
sarif="$repo/security/codeql/results.sarif"

codeql database create "$db" --overwrite --language=javascript-typescript \
  --source-root="$repo" --codescanning-config="$repo/security/codeql/codeql-config.yml"
codeql database analyze "$db" "codeql/javascript-queries:codeql-suites/javascript-security-extended.qls" \
  --download --format=sarif-latest --output="$sarif" --threads=0

python3 - "$sarif" <<'PY'
import json, sys
results = json.load(open(sys.argv[1], encoding="utf-8"))["runs"][0]["results"]
print(f"CodeQL findings: {len(results)}")
for r in results:
    loc = r["locations"][0]["physicalLocation"]
    print(f"  {r['ruleId']}  {loc['artifactLocation']['uri']}:{loc['region']['startLine']}  {r['message']['text']}")
PY
