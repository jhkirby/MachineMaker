# Security Review — 2026-11-02

The first security review of MachineMaker. It covers three things: a CodeQL static-analysis scan, a dependency audit, and a manual review of the Electron hardening that CodeQL doesn't cover. Every finding listed here has been fixed or explicitly accepted. The ongoing practices that keep it that way are in [docs/SECURITY.md](../docs/SECURITY.md).

## Summary

| Area | Result |
|---|---|
| CodeQL (`javascript-security-extended`, 65 files) | **0 findings** |
| `npm audit` before | 1 critical, 16 high, 19 moderate (36 total) |
| `npm audit` after | 0 critical, 0 high, 15 moderate — all build-time only, accepted below |
| Electron hardening (manual) | 5 issues found, all fixed |

## 1. CodeQL static analysis

- **Tool:** CodeQL CLI 2.27.3, pack `codeql/javascript-queries@2.5.0`, suite `javascript-security-extended`.
- **Scope:** `src/` (main, preload, renderer, shared), configured in [codeql/codeql-config.yml](codeql/codeql-config.yml). Build output and tests are excluded.
- **Raw results:** [codeql/results.sarif](codeql/results.sarif).
- **Result:** no findings. The suite covers XSS, path injection, prototype pollution, ReDoS, unsafe deserialization, insecure randomness and Electron's `webSecurity`/`nodeIntegration` checks.

Rerun locally with `pwsh security/run-codeql.ps1` (Windows) or `bash security/run-codeql.sh`. The same scan runs in GitHub Actions on every push and weekly ([.github/workflows/codeql.yml](../.github/workflows/codeql.yml)).

## 2. Dependency audit

| Package | Was | Now | Severity | Why it mattered |
|---|---|---|---|---|
| `electron` | 33.x | 45.2.1 | High | Ships in the app. Electron 33 was out of security support, and its bundled Chromium had unpatched CVEs. |
| `yaml` | 2.6.x | 2.9.1 | Moderate | Ships in the app and parses user-imported YAML. Deeply nested input could overflow the stack (GHSA-48c2-rrv3-qjmp). |
| `electron-builder` | 25.x | 26.18.1 | Critical (via `tar`) | Build-time only. Its packaging chain pulled a vulnerable `tar`. |
| `vite` / `electron-vite` / `@vitejs/plugin-react` | 5 / 2 / 4 | 8 / 6 / 6 | High | Dev-server only. The old Vite dev server had file-disclosure advisories. |

**Accepted — 15 moderate advisories**, all in electron-builder's packaging dependencies: `minimatch` ReDoS, plus `glob`, `rimraf`, `temp`, `ejs`/`jake` and `@electron/asar` through it. These run only while packaging, on the developer's own machine and on CI. They never ship inside the app and never process untrusted input. npm's suggested "fix" downgrades electron-builder to 20.x, which is older and worse, so the right fix is waiting for an upstream release. CI's audit gate (`npm audit --audit-level=high`) still blocks anything high or critical.

## 3. Electron hardening (manual review)

CodeQL doesn't model Electron's process boundaries, so these were checked against [Electron's security checklist](https://www.electronjs.org/docs/latest/tutorial/security).

| # | Finding | Risk | Fix |
|---|---|---|---|
| E1 | Renderer ran with `sandbox: false`. | A renderer compromise (e.g. via a crafted schematic exploiting a Chromium bug) would not be contained by the OS sandbox. | `sandbox: true` ([window-manager.ts](../src/main/window-manager.ts)). The preload was verified to `require` only `electron`, so it runs sandboxed unchanged. |
| E2 | `setWindowOpenHandler` passed **any** URL to `shell.openExternal`. | `file:`, `smb:` or custom-protocol URLs can launch local programs. | Only `https:` URLs are opened externally; everything else is dropped. |
| E3 | No `will-navigate` guard. | A dropped file or stray link could navigate the window away from the app while it still held the privileged preload bridge. | Navigation is blocked unless the target is the app's own page (`isAppUrl`). |
| E4 | IPC handlers trusted every sender. | Any frame that ended up in the window could call file-system endpoints. | Every `ipcMain.handle` goes through `IpcHandlers.handle`, which rejects callers whose `senderFrame.url` isn't the app's own page. String arguments are type-checked before reaching the filesystem. |
| E5 | No permission handler. | Pages could request camera, microphone, notifications, and similar. | `setPermissionRequestHandler` / `setPermissionCheckHandler` deny everything ([index.ts](../src/main/index.ts)). |

These were already correct and were left unchanged: `contextIsolation: true`, `nodeIntegration: false`, a strict CSP in `index.html` (`default-src 'self'`), and no `remote` module.

### Smaller fixes

- **Project names `.` / `..`** made it past the character filter and would have pointed New Project at the chosen folder or its parent. They're now rejected ([project-service.ts](../src/main/project-service.ts)).
- **New schematic files** are written with the `wx` flag, so creating one can never overwrite an existing file, even in a race.

## Verification

After the fixes, the app was rebuilt and driven end to end on Electron 45 with the sandbox on: home page → project page → open a schematic in the editor → create a second schematic in a new tab. It was also packaged with electron-builder and launched as an installed build, to confirm production and development each use their own data folder.
