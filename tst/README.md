<!--
  Project:       RTL Schematic
  Owner:         Joshua H. Kirby
  Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
  Last Modified: 2026-09-04
-->

# UI test suite

End-to-end Playwright tests that drive the real Electron app — main process,
preload bridge, and renderer — the way a user does: clicking the toolbar,
dragging out of the palette, wiring ports, and saving files to disk.

## Running

```bash
npm test                      # builds out/, then runs every spec
```

```bash
RTL_SKIP_BUILD=1 npm test                    # reuse the existing bundle
npm test -- palette                          # one spec file
npm test -- --grep "bus width"               # one test by name
npm test -- --debug                          # step through with the inspector
```

`npm test` rebuilds `out/` first (`tst/global-setup.ts`), so the suite always
runs against current source. No browser download is needed: Playwright launches
the project's own Electron binary.

## Layout

| Path            | What lives there                                            |
| --------------- | ----------------------------------------------------------- |
| `specs/`        | The tests, one file per area of the UI                       |
| `fixtures/`     | The `test` object every spec imports — launches the app      |
| `helpers/`      | `EditorPage` page object, dialog stubs, temp-file workspace  |
| `data/`         | Synthetic `.rtlproj` documents used as fixtures              |
| `.artifacts/`   | Traces, screenshots, and reports from failed runs (ignored)  |

Each test gets a freshly launched app with an empty document and its own temp
directory. Tests run one at a time (`workers: 1`).

## How the suite talks to the app

**Only the native dialogs are stubbed.** `MainProcessDialogs` replaces
`dialog.showOpenDialog` / `showSaveDialog` in the main process with scripted
answers, because a modal OS window is the one thing Playwright cannot drive.
Everything else is real: the real store, the real renderer, real file writes.
The stubs also record the options each dialog was opened with, so a test can
assert on the file name the app *suggested* — that is how the path-traversal
check in `export.spec.ts` works.

**Model state is read back off disk.** `EditorPage.persistedDiagram()` triggers
Save As and parses the resulting `.rtlproj`. Nothing is exported from the app
for testing, and an assertion about "what the document holds" is therefore an
assertion about what the user's file would hold. It clears the dirty flag as a
side effect, so check the dirty indicator before calling it.

**Gestures wait for the canvas to stop moving.** Opening a file, fitting the
view, and every zoom step animate for ~200 ms. `waitForViewportSettled()` polls
the React Flow transform until three identical reads, and every gesture that
depends on screen position calls it first. This was the single largest source
of flake while the suite was being written.

**Palette drags are dispatched as real HTML5 drag events**
(`dragstart` → `dragover` → `drop` → `dragend`, sharing one `DataTransfer`),
because the palette hands the block kind over on the drag payload — a mouse
gesture alone carries nothing.

## Coverage

| Spec                  | Area                                                        |
| --------------------- | ----------------------------------------------------------- |
| `app-shell`           | Window, three-pane layout, empty-document defaults           |
| `palette`             | Component list, collapse rail, both placement gestures, drop refusal and its preview |
| `blocks`              | Selection, rename, resize, drag, collision snap-back, delete |
| `ports`               | Add/rename/re-side/re-type/remove, bus widths and their limits |
| `wires`               | Drawing wires, refused connections, wire properties          |
| `history`             | Undo/redo granularity, redo invalidation, history resets     |
| `shortcuts`           | Every keyboard chord, and bare keys staying inert while typing |
| `file-io`             | Save/open round trips, the unsaved-changes guard, malformed and hostile documents |
| `export`              | SVG/PNG output, cancellation, file-name and markup escaping  |
| `canvas-view`         | Zoom, fit, lock, minimap, grid vs. snapping                  |

## Known defects

Four tests are marked `test.fail()`: they assert the behavior the app
documents, currently fail, and will report as an *unexpected pass* the moment
the underlying bug is fixed — at which point drop the `.fail`. Each carries a
`KNOWN DEFECT` comment explaining the cause.

- `blocks` — Escape in a name/number field commits the edit instead of
  abandoning it (`NameInput`, `CommitInput`, `NumericField` share the pattern).
- `blocks` — Ctrl-click does not extend the selection; it replaces it. (The
  rubber-band selection, which does work, is covered separately.)
- `blocks` — Shrinking a block can strand its ports outside the body:
  `minBlockSize` counts ports per side instead of measuring the deepest slot.
- `history` — Deleting a wired block takes two undos, and the first leaves the
  block restored without its wire.

## Adding a test

Import `test`/`expect` from `../fixtures/editor-fixture`, take the `editor`
fixture, and drive the UI through `EditorPage`. Add a locator or gesture to
`helpers/editor-page.ts` rather than reaching into markup from a spec, so a
class rename stays a one-file change.
