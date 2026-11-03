<!--
  Project:       MachineMaker
  Owner:         Joshua H. Kirby
  Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
  Last Modified: 2026-11-02
-->

# MachineMaker

[![CI](https://github.com/jhkirby/MachineMaker/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/jhkirby/MachineMaker/actions/workflows/ci.yml)
[![CodeQL](https://github.com/jhkirby/MachineMaker/actions/workflows/codeql.yml/badge.svg?branch=dev)](https://github.com/jhkirby/MachineMaker/actions/workflows/codeql.yml)
[![SBOM](https://github.com/jhkirby/MachineMaker/actions/workflows/sbom.yml/badge.svg)](https://github.com/jhkirby/MachineMaker/actions/workflows/sbom.yml)

A desktop editor for hand-authoring RTL block diagrams: modules, registers, logic gates, I/O and the wires between their ports, organized into projects. It runs on Windows, macOS and Linux, and is built with Electron, React, TypeScript and [React Flow](https://reactflow.dev).

## Highlights

- **Projects and a home page:** keep related schematics together, with stats for the whole project and for each schematic.
- **Tabbed editor:** up to 8 schematics open at once, each with its own undo history and view.
- **Real hardware symbols:** AND/OR/XOR gates with their negated forms, clocked modules, typed ports and buses.
- **Click-to-connect wiring:** wires route themselves and refuse invalid connections.
- **Autosave:** nothing to remember. Export to PNG, SVG, JSON or YAML.
- **Hardened by default:** sandboxed renderer, validated IPC, CodeQL in CI, weekly SBOM malicious-package scans.

The full list is in [docs/FEATURES.md](docs/FEATURES.md).

## Install

One command installs, and the same command updates:

```powershell
# Windows
irm https://raw.githubusercontent.com/jhkirby/MachineMaker/prod/scripts/install.ps1 | iex
```

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/jhkirby/MachineMaker/prod/scripts/install.sh | bash
```

Requirements, install locations, options and uninstalling are covered in [docs/INSTALL.md](docs/INSTALL.md).

## Documentation

| Document | For | What's in it |
|---|---|---|
| [USER_GUIDE.md](docs/USER_GUIDE.md) | Users | How to use the app, from the home page to keyboard shortcuts. |
| [INSTALL.md](docs/INSTALL.md) | Users | One-line install and update on Windows, macOS and Linux. |
| [FEATURES.md](docs/FEATURES.md) | Everyone | Every feature with an ID, cross-referenced to its tests. |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Developers | Tech stack, process model, data on disk, branches and CI. |
| [UI_STANDARDS.md](docs/UI_STANDARDS.md) | Developers | The rules every screen follows: theme, controls, popups, motion, shortcuts. |
| [TESTING_STRATEGY.md](docs/TESTING_STRATEGY.md) | Developers | How and why the app is tested. |
| [TESTS.md](docs/TESTS.md) | Developers | Every automated test with an ID, cross-referenced to features. |
| [SECURITY.md](docs/SECURITY.md) | Developers | Threat model, hardening, and continuous security checks. |
| [security/SECURITY_REVIEW.md](security/SECURITY_REVIEW.md) | Developers | Findings and fixes from the latest security review. |
| [tst/README.md](tst/README.md) | Developers | Mechanics of the end-to-end test suite. |

## Development

```bash
npm install
npm run dev          # launch with hot reload (uses separate "MachineMaker Dev" data)
```

| Script | Purpose |
|---|---|
| `npm run dev` | Run the app from source with hot reload. |
| `npm run build` | Bundle main, preload and renderer into `out/`. |
| `npm run typecheck` | Type-check every TypeScript project. |
| `npm test` | Build, then run the Playwright end-to-end suite. |
| `npm run package:dir` | Build an unpacked app into `dist/` (what the installer does). |

### Branches

Work happens on **`dev`**. It's promoted to **`qa`** for release checks, then to **`prod`**, which is what the install command builds. Every push runs CI; pushes to `qa` and `prod` also package the app on all three operating systems. See [ARCHITECTURE.md](docs/ARCHITECTURE.md#branches-ci-and-delivery).

### Project layout

```
src/main/       Electron main process: windows, IPC, files, projects
src/preload/    The typed bridge exposed to the UI as window.rtl
src/renderer/   React UI: home page, editor, canvas, inspector
src/shared/     Data model and IPC contract shared by both sides
tst/            Playwright end-to-end tests
scripts/        Install / update scripts
security/       CodeQL config and results, review report, SBOM checker
docs/           Documentation
```

## License

MachineMaker is released under the [MIT License](LICENSE).

Copyright (c) 2026 Joshua H. Kirby.
