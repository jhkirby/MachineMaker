# Security

The security practices MachineMaker follows: how the app is built to contain damage, and how the code and its dependencies are checked over time. For the findings of the most recent review, see [security/SECURITY_REVIEW.md](../security/SECURITY_REVIEW.md).

## Threat model

MachineMaker is a local desktop app with no server, no accounts and no network features. The realistic risks are:

| Threat | Example | Primary defenses |
|---|---|---|
| Malicious document | A `.rtlproj` or YAML file crafted to exploit a parser or a Chromium bug. | Input validation, sandboxed renderer, escaped rendering. |
| Escaping the renderer | A compromised page using the preload bridge to read or write arbitrary files. | IPC sender validation, minimal bridge, navigation lockdown. |
| Supply-chain attack | A dependency (or a dependency of one) published with malware. | Lockfile, `npm ci`, weekly SBOM malicious-package scan, pinned CI actions. |
| Known vulnerabilities | An outdated Electron/Chromium or library with a published CVE. | `npm audit` gate in CI, CodeQL, staying on supported Electron releases. |

## Application hardening

All windows are created in `src/main/window-manager.ts` with Electron's recommended settings:

- **`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`.** Renderer code has no Node.js access and runs inside Chromium's OS-level sandbox. The preload script is bundled to depend only on `electron`, as sandboxing requires.
- **A minimal, typed bridge.** The renderer can reach the main process only through the methods in `RtlBridgeApi` (`src/shared/ipc-contract.ts`). There is no generic "send any message" channel.
- **IPC sender validation.** Every handler is registered through `IpcHandlers.handle`, which rejects any call whose sending frame isn't the app's own page (`isAppUrl`). String arguments are type-checked before they reach the filesystem.
- **Navigation lockdown.** `will-navigate` blocks the window from leaving the app's page, and `window.open` is always denied. Links meant for the outside world open in the user's browser, but only for `https:` URLs.
- **No permissions.** Requests for the camera, microphone, notifications, geolocation and so on are refused (`index.ts`).
- **Content Security Policy.** `index.html` sets `default-src 'self'`, so no remote scripts, frames or connections are possible.

### Handling untrusted files

- Schematic files are parsed as JSON and structurally validated before use. A malformed file is rejected without disturbing the open document. This is covered by T-048 – T-051 in [TESTS.md](TESTS.md), and export path-traversal and SVG escaping by T-034 – T-035.
- Labels and names are always rendered as text, never as HTML. SVG export escapes markup.
- File names derived from document titles are stripped of path separators and control characters, so an export can't escape the folder the user chose.
- New files are created with the exclusive `wx` flag, so creating one can never overwrite an existing file.

## Continuous security checks

| Check | Where | When | Fails the build on |
|---|---|---|---|
| CodeQL (`security-extended`) | `.github/workflows/codeql.yml` | every push/PR, weekly | any alert (reviewed in the GitHub Security tab) |
| Dependency audit | `ci.yml` → `npm audit --audit-level=high` | every push/PR | any high or critical advisory |
| SBOM + malicious-package scan | `.github/workflows/sbom.yml` | weekly, and when dependencies change | any package matching a `MAL-` advisory (OpenSSF Malicious Packages) |

The SBOM job installs with `--ignore-scripts`, so no dependency's install script runs before it has been checked. It keeps the CycloneDX SBOM and the OSV results as run artifacts for 90 days. The malicious-package verdict comes from `security/sbom/check_malicious.py`, which you can also run locally on any OSV-Scanner JSON report.

### Supply-chain practices

- **Lockfile always.** CI and the install scripts use `npm ci`, which installs exactly what `package-lock.json` records and fails if it's out of date.
- **Pinned actions.** Every GitHub Action is pinned to a full commit SHA (with its version in a comment), so a moved or hijacked tag can't change what runs.
- **Least privilege in CI.** Workflows default to `contents: read`. Only the CodeQL job may write security events, and checkouts don't keep the token (`persist-credentials: false`).

## Running the checks locally

```bash
pwsh security/run-codeql.ps1        # Windows: CodeQL → security/codeql/results.sarif
bash security/run-codeql.sh         # macOS/Linux (needs codeql on PATH)
npm audit --audit-level=high        # dependency advisories
```

## Accepted risks

- **Moderate advisories in electron-builder's packaging dependencies** (`minimatch`, `glob` and others). They run only at build time, on trusted input, and never ship in the app. They're revisited with each electron-builder release; details are in the [review](../security/SECURITY_REVIEW.md#2-dependency-audit).
- **Unsigned builds.** The app is built from source on the user's own machine, so it isn't code-signed. On macOS the install script clears the quarantine flag for the locally built app.

## Reporting a vulnerability

Please report security issues privately to the maintainer rather than in a public issue, through GitHub's **Security → Report a vulnerability** on the repository.
