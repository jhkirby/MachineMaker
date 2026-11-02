# Testing Strategy

How MachineMaker is tested and why. The individual tests are logged in [TESTS.md](TESTS.md) and mapped to the [features](FEATURES.md) they cover.

## Principles

1. **Test what the user experiences.** Most of MachineMaker's behavior lives in the interaction between the canvas, the inspector, the stores and the file system. Testing pieces in isolation would mostly test mocks, so the primary suite drives the real app.
2. **Mock only what can't be driven.** Native OS dialogs are the one thing an automated test can't click. They're replaced in the main process with scripted answers. Everything else is real: the store, the renderer, IPC, and actual files written to a temp folder.
3. **Assert on the artifact, not the internals.** "What the document contains" is checked by saving it and reading the file back. Nothing is exported from the app just for tests, so a passing test means the user's file would really contain that.
4. **Adversarial cases are first-class.** Malformed files, path-traversal titles, markup in labels and out-of-range values each have their own tests, not just the happy path.
5. **Every test traces to a feature.** A test without a feature is either testing nothing users care about or revealing an undocumented feature. Both get fixed in [FEATURES.md](FEATURES.md).

## Test levels

| Level | Tooling | Scope | Status |
|---|---|---|---|
| **End-to-end** | Playwright + `_electron` | The whole app: main, preload and renderer, launched as a real Electron process. | **Primary suite**, 119 tests in `tst/specs/`. |
| **Unit** | (planned: Vitest) | Pure logic in `src/renderer/src/model/` and `src/main/app-channel.ts`: geometry, wire routing, gate layout, stats, data paths. | Planned. These modules are already written as pure functions with injected dependencies, ready for it. |
| **Static analysis** | TypeScript strict, CodeQL | Type safety across the IPC boundary; security queries. | Every push (CI). |
| **Supply chain** | `npm audit`, SBOM + OSV-Scanner | Known-vulnerable and known-malicious dependencies. | Every push (audit) and weekly (SBOM). |

## How the end-to-end suite works

- **One fresh app per test.** Each test launches its own Electron process with an empty document, its own temp workspace folder, and its own throwaway user-data folder (`MACHINEMAKER_USER_DATA`). No test can see another's files, recent projects or settings, or the developer's own.
- **Editor-first launch.** Specs start straight in the editor (`RTL_START_VIEW=editor`). Home-page specs will use a separate fixture that launches on the home page.
- **Serial execution.** Tests run one at a time (`workers: 1`), because parallel Electron windows compete for OS focus on Windows.
- **Stable gestures.** Interactions wait for the canvas viewport to stop animating before clicking, which removes the most common source of flakiness.
- **Build first.** `npm test` rebuilds `out/` before running (`tst/global-setup.ts`), so tests always run against current source.

The mechanics (page objects, dialog stubs, fixtures) are documented in [tst/README.md](../tst/README.md).

## When tests run

| When | What runs |
|---|---|
| While developing | The spec(s) for the area being changed: `npx playwright test --config tst/playwright.config.ts tst/specs/<area>.spec.ts`. |
| Every push / PR to `dev`, `qa`, `prod` | Typecheck, build, `npm audit`, the full end-to-end suite (Linux, virtual display), CodeQL. |
| Push to `qa` / `prod` | All of the above, plus packaging on Windows, macOS and Linux, proving the install script will work on each OS. |
| Weekly | CodeQL re-scan and the SBOM malicious-package check. |

A failed end-to-end run uploads the Playwright traces and screenshots as a CI artifact for 14 days.

## Writing a new test

1. Find or add the feature in [FEATURES.md](FEATURES.md).
2. Add the test to the spec file for that area of the UI (or create a new `<area>.spec.ts`). Drive it through `EditorPage` helpers rather than raw selectors where one exists.
3. Cover the failure path and at least one hostile input, not just the happy path.
4. Log it in [TESTS.md](TESTS.md) with the next free `T-` ID and its feature IDs, and add the `T-` ID to the feature's **Tests** cell.

## Known gaps

- Several features have no automated coverage yet: the home page and projects, tabs, gates, and dev/prod data separation. They're listed in priority order under *Coverage gaps* in [FEATURES.md](FEATURES.md).
- Eight tests are marked **Needs update** in [TESTS.md](TESTS.md). They predate autosave, tabs and the delete-confirmation popup, and must be rewritten to match current behavior.
- There's no unit-test runner yet. Adding Vitest for the `model/` layer is the next step for fast feedback on the geometry and routing logic.
