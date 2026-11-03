# Tests

The automated test log. Every test has a stable `T-` ID and lists the [FEATURES.md](FEATURES.md) entries it covers. The suite is Playwright driving the real Electron app ([TESTING_STRATEGY.md](TESTING_STRATEGY.md) explains why). Specs live in `tst/specs/`.

**Status:**

| Status | Meaning |
|---|---|
| Active | Matches the app's current behavior. |
| Needs update | Written for behavior that has since changed (the note says what). Expect it to fail until it's rewritten. |
| Diagnostic | A helper script that captures screenshots and asserts nothing. Not part of the pass/fail signal. |

Pass/fail comes from CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)), not from this table. Run the suite locally with `npm test`, or one file with `npx playwright test --config tst/playwright.config.ts tst/specs/<file>`.

**Keeping it current:** a new test gets the next free `T-` ID, which is never reused, even if the test is deleted. When a test is added, removed or retargeted, update both this table and the feature's **Tests** cell in [FEATURES.md](FEATURES.md).

| ID | Suite | Group | Test | Features | Status | Notes |
|---|---|---|---|---|---|---|
| T-001 | `_visual-check.spec.ts` | — | visual check: shrinking width/height never overlaps or escapes | F-015 | Diagnostic | Debug screenshot script, not an assertion. |
| T-002 | `app-shell.spec.ts` | application shell | opens a single window | F-008 | Active |  |
| T-003 | `app-shell.spec.ts` | application shell | lays out toolbar, palette, canvas — inspector stays closed with nothing selected | F-011, F-025, F-033 | Active |  |
| T-004 | `app-shell.spec.ts` | application shell | starts on an empty untitled document | F-028 | Active |  |
| T-005 | `app-shell.spec.ts` | application shell | starts clean, with nothing to undo | F-026 | Active |  |
| T-006 | `app-shell.spec.ts` | application shell | shows the canvas furniture | F-011, F-025, F-033 | Active |  |
| T-007 | `app-shell.spec.ts` | application shell | window title tracks the document | F-008 | Active |  |
| T-008 | `blocks.spec.ts` | block editing | clicking a block selects it and shows its properties | F-013, F-033 | Active |  |
| T-009 | `blocks.spec.ts` | block editing | clicking empty canvas clears the selection | F-013, F-033 | Active |  |
| T-010 | `blocks.spec.ts` | block editing | selecting another block replaces the selection | F-013, F-033 | Active |  |
| T-011 | `blocks.spec.ts` | block editing | rubber-band selects every block it sweeps | F-013, F-033 | Active |  |
| T-012 | `blocks.spec.ts` | block editing | delete clears a whole rubber-band selection | F-017 | Needs update | Delete now opens the type-DELETE popup (F-017). |
| T-013 | `blocks.spec.ts` | block editing | renaming a block updates the canvas and the document | F-016 | Active |  |
| T-014 | `blocks.spec.ts` | block editing | a duplicate name is refused | F-014 | Active |  |
| T-015 | `blocks.spec.ts` | block editing | a name must start with a letter | F-014 | Active |  |
| T-016 | `blocks.spec.ts` | block editing | resizing is measured in grid cells | F-015 | Active |  |
| T-017 | `blocks.spec.ts` | block editing | dragging a block moves it and keeps it on the grid | F-016 | Active |  |
| T-018 | `blocks.spec.ts` | block editing | a block dropped on another snaps back | F-016 | Active |  |
| T-019 | `blocks.spec.ts` | block editing | delete removes the selected block and its wires | F-017 | Needs update | Delete now opens the type-DELETE popup (F-017). |
| T-020 | `blocks.spec.ts` | block editing | backspace deletes too | F-017 | Needs update | Backspace now opens the type-DELETE popup (F-017). |
| T-021 | `blocks.spec.ts` | block editing | delete with nothing selected does nothing | F-017 | Active |  |
| T-022 | `canvas-view.spec.ts` | canvas view | the zoom controls step in and out | F-025 | Active |  |
| T-023 | `canvas-view.spec.ts` | canvas view | fit view brings every block on screen | F-025 | Active |  |
| T-024 | `canvas-view.spec.ts` | canvas view | zooming never edits the document | F-025 | Active |  |
| T-025 | `canvas-view.spec.ts` | canvas view | the lock control blocks dragging and selection | F-025 | Active |  |
| T-026 | `canvas-view.spec.ts` | canvas view | unlocking restores editing | F-025 | Active |  |
| T-027 | `canvas-view.spec.ts` | canvas view | the minimap tracks the blocks | F-025 | Active |  |
| T-028 | `canvas-view.spec.ts` | canvas view | hiding the grid does not stop snapping | F-025 | Active |  |
| T-029 | `export.spec.ts` | export | writes standalone SVG markup | F-031 | Active |  |
| T-030 | `export.spec.ts` | export | writes a real PNG | F-031 | Active |  |
| T-031 | `export.spec.ts` | export | cancelling writes nothing | F-031 | Active |  |
| T-032 | `export.spec.ts` | export | suggests the document title as the file name | F-031 | Active |  |
| T-033 | `export.spec.ts` | export | an empty diagram still exports | F-031 | Active |  |
| T-034 | `export.spec.ts` | export hardening | a path-traversal title cannot escape the chosen folder | F-031, F-038 | Active |  |
| T-035 | `export.spec.ts` | export hardening | markup in a label is escaped in the SVG | F-031, F-038 | Active |  |
| T-036 | `file-io.spec.ts` | saving | writes the whole document as JSON | F-028 | Active |  |
| T-037 | `file-io.spec.ts` | saving | clears the unsaved-changes marker | F-028 | Active |  |
| T-038 | `file-io.spec.ts` | saving | cancelling leaves the document unsaved | F-028 | Active |  |
| T-039 | `file-io.spec.ts` | saving | saving again reuses the path without asking | F-028 | Active |  |
| T-040 | `file-io.spec.ts` | saving | save-as always asks, even with a path | F-028 | Active |  |
| T-041 | `file-io.spec.ts` | opening | loads blocks, wires, and the title | F-028 | Active |  |
| T-042 | `file-io.spec.ts` | opening | renders a document at working volume | F-028 | Active |  |
| T-043 | `file-io.spec.ts` | opening | cancelling changes nothing | F-028 | Active |  |
| T-044 | `file-io.spec.ts` | opening | a clean document opens without a prompt | F-028 | Active |  |
| T-045 | `file-io.spec.ts` | opening | unsaved changes are guarded | F-028 | Needs update | Superseded by autosave: there is no unsaved-changes guard any more. |
| T-046 | `file-io.spec.ts` | opening | accepting the guard replaces the document | F-028 | Needs update | Superseded by autosave and tabs: Open adds a tab instead of replacing. |
| T-047 | `file-io.spec.ts` | opening | a new document is guarded the same way | F-028 | Needs update | Superseded by autosave: there is no unsaved-changes guard any more. |
| T-048 | `file-io.spec.ts` | untrusted documents | rejects each malformed file without losing the open document | F-029, F-038 | Active |  |
| T-049 | `file-io.spec.ts` | untrusted documents | stays usable after a failed open | F-029, F-038 | Active |  |
| T-050 | `file-io.spec.ts` | untrusted documents | renders markup in a label as text, not HTML | F-029, F-038 | Active |  |
| T-051 | `file-io.spec.ts` | untrusted documents | an out-of-range bus width from a file is shown as invalid | F-029, F-038 | Active |  |
| T-052 | `history.spec.ts` | undo and redo | undo removes a freshly added block, redo restores it | F-026 | Active |  |
| T-053 | `history.spec.ts` | undo and redo | redo is unavailable until something has been undone | F-026 | Active |  |
| T-054 | `history.spec.ts` | undo and redo | undo stops at the start of the document | F-026 | Active |  |
| T-055 | `history.spec.ts` | undo and redo | a fresh edit drops the redo stack | F-026 | Active |  |
| T-056 | `history.spec.ts` | undo and redo | steps unwind in order | F-026 | Active |  |
| T-057 | `history.spec.ts` | undo and redo | a rename is one step, not one per keystroke | F-026 | Active |  |
| T-058 | `history.spec.ts` | undo and redo | a drag is one step | F-026 | Active |  |
| T-059 | `history.spec.ts` | undo and redo | a new document starts with an empty history | F-026 | Active |  |
| T-060 | `history.spec.ts` | undo and redo | opening a document starts with an empty history | F-026 | Active |  |
| T-061 | `palette.spec.ts` | component palette | lists every component the library offers | F-011 | Active |  |
| T-062 | `palette.spec.ts` | component palette | each entry carries a hint | F-011 | Active |  |
| T-063 | `palette.spec.ts` | component palette | collapses to a rail and expands again | F-011 | Active |  |
| T-064 | `palette.spec.ts` | component palette | double-click drops a block | F-012 | Active |  |
| T-065 | `palette.spec.ts` | component palette | auto-numbers per component base name | F-012 | Active |  |
| T-066 | `palette.spec.ts` | component palette | drag-and-drop lands under the cursor, on the grid | F-012 | Active |  |
| T-067 | `palette.spec.ts` | component palette | drag shows a preview and clears it on leave | F-012 | Active |  |
| T-068 | `palette.spec.ts` | component palette | cancelled drag places nothing | F-012 | Active |  |
| T-069 | `palette.spec.ts` | component palette | refuses a drop on top of an existing block | F-012 | Active |  |
| T-070 | `palette.spec.ts` | component palette | refuses a drop inside another block's routing clearance | F-012 | Active |  |
| T-071 | `palette.spec.ts` | component palette | marks an occupied drop point as invalid before the drop | F-012 | Active |  |
| T-072 | `ports.spec.ts` | ports | lists the selected block's ports | F-018 | Active |  |
| T-073 | `ports.spec.ts` | ports | adds an input on the left | F-018 | Active |  |
| T-074 | `ports.spec.ts` | ports | adds an output on the right | F-018 | Active |  |
| T-075 | `ports.spec.ts` | ports | a new port lands on a free slot | F-018 | Active |  |
| T-076 | `ports.spec.ts` | ports | the block grows to fit ports it cannot seat | F-018 | Active |  |
| T-077 | `ports.spec.ts` | ports | renaming a port updates the canvas | F-018 | Active |  |
| T-078 | `ports.spec.ts` | ports | a port name refuses digits and spaces | F-018 | Active |  |
| T-079 | `ports.spec.ts` | ports | a port name refuses a doubled separator | F-018 | Active |  |
| T-080 | `ports.spec.ts` | ports | a duplicate port name is refused | F-018 | Active |  |
| T-081 | `ports.spec.ts` | ports | moving a port to another side re-seats it | F-018 | Active |  |
| T-082 | `ports.spec.ts` | ports | flipping a port's direction changes its handle | F-018 | Active |  |
| T-083 | `ports.spec.ts` | ports | a bus width is annotated on the port | F-019 | Active |  |
| T-084 | `ports.spec.ts` | ports | width 1 drops the annotation entirely | F-019 | Active |  |
| T-085 | `ports.spec.ts` | ports | a width below the minimum is refused | F-019 | Active |  |
| T-086 | `ports.spec.ts` | ports | a width above the maximum is refused | F-019 | Active |  |
| T-087 | `ports.spec.ts` | ports | a non-numeric width is refused | F-019 | Active |  |
| T-088 | `ports.spec.ts` | ports | removing a port takes its wires with it | F-018 | Active |  |
| T-089 | `ports.spec.ts` | ports | removing an unwired port leaves the wires alone | F-018 | Active |  |
| T-090 | `ports.spec.ts` | module combinational/sequential mode | the clock renders as a triangle, not a plain port | F-020 | Active |  |
| T-091 | `ports.spec.ts` | module combinational/sequential mode | switching to combinational removes the clock | F-020 | Active |  |
| T-092 | `ports.spec.ts` | module combinational/sequential mode | switching back to sequential restores a clock and a reset | F-020 | Active |  |
| T-093 | `ports.spec.ts` | module combinational/sequential mode | a restored reset is a single plain port, not a bubble pair | F-020 | Active |  |
| T-094 | `ports.spec.ts` | module combinational/sequential mode | the clock stays bottom-most on the left when another left port is added | F-020 | Active |  |
| T-095 | `ports.spec.ts` | module combinational/sequential mode | the clock's side selector is fixed, not editable | F-020 | Active |  |
| T-096 | `shortcuts.spec.ts` | keyboard shortcuts | ctrl+z undoes and ctrl+y redoes | F-027, F-026 | Active |  |
| T-097 | `shortcuts.spec.ts` | keyboard shortcuts | ctrl+shift+z also redoes | F-027, F-026 | Active |  |
| T-098 | `shortcuts.spec.ts` | keyboard shortcuts | ctrl+s saves through the dialog | F-027, F-028 | Active |  |
| T-099 | `shortcuts.spec.ts` | keyboard shortcuts | ctrl+o opens a document | F-027, F-028 | Needs update | Ctrl+O now opens the Open Schematic popup; the file dialog is behind its folder button (F-028). |
| T-100 | `shortcuts.spec.ts` | keyboard shortcuts | ctrl+n starts a new document | F-027, F-010 | Needs update | Ctrl+N now asks for a name and opens a new tab (F-010, F-009). |
| T-101 | `shortcuts.spec.ts` | keyboard shortcuts | ctrl+g toggles the grid | F-027, F-025 | Active |  |
| T-102 | `shortcuts.spec.ts` | keyboard shortcuts | minus and plus zoom the canvas | F-027, F-025 | Active |  |
| T-103 | `shortcuts.spec.ts` | keyboard shortcuts | escape clears the selection | F-027, F-013 | Active |  |
| T-104 | `shortcuts.spec.ts` | keyboard shortcuts | l locks the canvas against edits | F-027, F-025 | Active |  |
| T-105 | `shortcuts.spec.ts` | keyboard shortcuts | c fits the diagram in view | F-027, F-025 | Active |  |
| T-106 | `shortcuts.spec.ts` | keyboard shortcuts | bare keys do not fire while typing in a field | F-027 | Active |  |
| T-107 | `shortcuts.spec.ts` | keyboard shortcuts | modifier chords still fire while typing in a field | F-027 | Active |  |
| T-108 | `shortcuts.spec.ts` | keyboard shortcuts | alt chords are ignored | F-027 | Active |  |
| T-109 | `wires.spec.ts` | wires | dragging port to port draws a wire | F-022 | Active |  |
| T-110 | `wires.spec.ts` | wires | a wire off a bus port is drawn as a bus | F-022 | Active |  |
| T-111 | `wires.spec.ts` | wires | ports of different widths cannot be wired together | F-022 | Active |  |
| T-112 | `wires.spec.ts` | wires | the same connection cannot be made twice | F-022 | Active |  |
| T-113 | `wires.spec.ts` | wires | a port cannot be wired to itself | F-022 | Active |  |
| T-114 | `wires.spec.ts` | wires | an output cannot be wired to another output | F-022 | Active |  |
| T-115 | `wires.spec.ts` | wires | selecting a wire shows both endpoints | F-023 | Active |  |
| T-116 | `wires.spec.ts` | wires | a wire label can be edited | F-023 | Active |  |
| T-117 | `wires.spec.ts` | wires | clearing the label removes it from the canvas | F-023 | Active |  |
| T-118 | `wires.spec.ts` | wires | deleting a selected wire leaves its blocks alone | F-017, F-022 | Active |  |
| T-119 | `wires.spec.ts` | wires | a wire follows its block when it moves | F-024 | Active |  |
