# -----------------------------------------------------------------------------
# Project:       MachineMaker
# Owner:         Joshua H. Kirby
# Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
# Last Modified: 2026-11-02
# -----------------------------------------------------------------------------
"""Fail the build if an SBOM scan found any known-malicious package.

Reads the JSON report OSV-Scanner writes for the SBOM (see
.github/workflows/sbom.yml) and separates two kinds of finding:

* **Malicious packages** -- OSV entries whose id or any alias starts with
  ``MAL-``. These come from the OpenSSF Malicious Packages dataset and mean
  the package itself is malware (typosquats, hijacked releases, install-time
  credential stealers), not merely buggy. Any one of these fails the check.
* **Ordinary vulnerabilities** -- everything else. Listed for visibility but
  never fail this check; ``npm audit`` in CI gates those by severity.

Usage::

    python security/sbom/check_malicious.py osv-results.json [--summary FILE]

Exit status: 0 when nothing malicious was found, 1 when something was, 2 when
the report can't be read.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path

MALICIOUS_PREFIX = "MAL-"


@dataclass(frozen=True)
class Finding:
    """One advisory against one package version."""

    package: str
    version: str
    advisory_id: str
    summary: str
    malicious: bool


def is_malicious(vulnerability: dict) -> bool:
    """Return whether an OSV entry flags the package itself as malware.

    Args:
        vulnerability: One entry from a package's ``vulnerabilities`` list.

    Returns:
        True if its id, or any of its aliases, is a ``MAL-`` identifier.
    """
    ids = [vulnerability.get("id", ""), *vulnerability.get("aliases", [])]
    return any(str(i).startswith(MALICIOUS_PREFIX) for i in ids)


def collect_findings(report: dict) -> list[Finding]:
    """Flatten an OSV-Scanner JSON report into one finding per advisory.

    Args:
        report: The parsed ``--format=json`` output of osv-scanner.

    Returns:
        Every advisory found, in report order.
    """
    findings: list[Finding] = []
    for result in report.get("results", []):
        for entry in result.get("packages", []):
            package = entry.get("package", {})
            for vulnerability in entry.get("vulnerabilities", []):
                findings.append(
                    Finding(
                        package=package.get("name", "?"),
                        version=package.get("version", "?"),
                        advisory_id=vulnerability.get("id", "?"),
                        summary=vulnerability.get("summary", "").strip(),
                        malicious=is_malicious(vulnerability),
                    )
                )
    return findings


def render_summary(findings: list[Finding]) -> str:
    """Build a Markdown summary for the workflow run page.

    Args:
        findings: Everything :func:`collect_findings` returned.

    Returns:
        Markdown text.
    """
    malicious = [f for f in findings if f.malicious]
    others = [f for f in findings if not f.malicious]
    lines = ["## SBOM malicious-package check", ""]
    if malicious:
        lines.append(f"**{len(malicious)} malicious package advisory(ies) found.**")
    else:
        lines.append("No known-malicious packages found.")
    lines.append("")
    if findings:
        lines += ["| Package | Version | Advisory | Malicious | Summary |", "|---|---|---|---|---|"]
        for f in malicious + others:
            summary = f.summary.replace("|", "\\|")[:120]
            flag = "**yes**" if f.malicious else "no"
            lines.append(f"| {f.package} | {f.version} | {f.advisory_id} | {flag} | {summary} |")
    else:
        lines.append("No advisories of any kind were reported.")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    """Run the check.

    Args:
        argv: Command-line arguments (defaults to ``sys.argv[1:]``).

    Returns:
        The process exit status.
    """
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("report", type=Path, help="osv-scanner JSON report")
    parser.add_argument("--summary", type=Path, help="append a Markdown summary here")
    args = parser.parse_args(argv)

    try:
        report = json.loads(args.report.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"Couldn't read OSV report {args.report}: {error}", file=sys.stderr)
        return 2

    findings = collect_findings(report)
    summary = render_summary(findings)
    print(summary)
    if args.summary:
        with args.summary.open("a", encoding="utf-8") as handle:
            handle.write(summary)

    return 1 if any(f.malicious for f in findings) else 0


if __name__ == "__main__":
    sys.exit(main())
