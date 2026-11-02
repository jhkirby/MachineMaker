# Features

Every user-facing feature of MachineMaker, with a stable ID. The **Tests** column lists the [TESTS.md](TESTS.md) entries that exercise each feature, and each test there points back to the features it covers. A `—` means the feature has no automated test yet.

**Keeping it current:** a new feature gets the next free `F-` ID, which is never reused. When you add or change a test, update both tables.

| ID | Area | Feature | Description | Tests |
|---|---|---|---|---|
| F-001 | Home | Landing page | Opens on a themed home page with the app logo and name, an animated circuit-board backdrop, and New Project / Open Project buttons. | — |
| F-002 | Home | Recent projects | Lists up to 8 recently opened projects, newest first. One click reopens; the × forgets one. Projects whose folder is gone are dropped automatically. | — |
| F-003 | Home | Create project | New Project asks for a name, then a parent folder, and creates a project folder with a manifest and schematics / state-machines subfolders. | — |
| F-004 | Home | Open project | Open Project shows a popup listing every known project (name, path, creation date, last opened) under a search box; the corner folder button picks a folder from disk instead (validated by its rtl-project.json manifest). | — |
| F-005 | Home | Project page | Lists the project's schematics (newest first) and state machines. Click selects; double-click or Open opens it in a new editor window while the home window stays open (a schematic already open anywhere is brought forward instead of opened twice). New Schematic asks for a name and opens it. | — |
| F-006 | Home | Project statistics | Project-total stats (sums over every schematic) and stats for the selected schematic. | — |
| F-007 | Shell | Light / dark theme | Theme toggle in the toolbar and on the home page (Ctrl+T). The choice persists. | — |
| F-008 | Shell | Custom title bar | Frameless window with its own title bar; minimize / maximize / close appear on hover. | T-002, T-007 |
| F-009 | Editor | Document tabs | Up to 8 schematics open as tabs in the title bar, each keeping its own zoom, pan and undo history. Close (×) shows on hover; middle-click closes. Drag a tab along the strip to reorder it, onto another window's strip to move it there, or anywhere else to tear it off into its own window (a lone tab moves its window), so schematics can be spread across monitors. Undo history travels with the tab. The house button (Ctrl+H) brings the home window forward, reopening it if closed. Ctrl+W closes the current tab (the window, if it's the last); Ctrl+Shift+W closes every tab in the window. | — |
| F-010 | Editor | Name prompt | New Schematic (Ctrl+N), New Project, and New Schematic on the project page ask for a name in a popup before creating anything. | T-100 |
| F-011 | Editor | Component palette | Lists every component kind with a hint; collapses to an icon rail (Ctrl+L). | T-003, T-006, T-061–T-063 |
| F-012 | Editor | Placing components | Click-to-place, drag-and-drop or double-click. Snaps to the grid, auto-numbers names, and refuses drops on or too close to another block. | T-064–T-071 |
| F-013 | Editor | Selection | Click, Ctrl+click to add/remove, rubber-band box, and Select All (Ctrl+A / toolbar). The selection ring animates in and out. | T-008–T-011, T-103 |
| F-014 | Editor | Renaming blocks | Inline name field; names must be unique and start with a letter. | T-014–T-015 |
| F-015 | Editor | Resizing blocks | Width / height in grid cells with − / + steppers; blocks never shrink below what their ports need. | T-001, T-016 |
| F-016 | Editor | Moving blocks | Drag to move, snapped to the grid; a drop onto another block snaps back. | T-013, T-017–T-018 |
| F-017 | Editor | Deleting with confirmation | Delete, Backspace or the inspector's Delete button opens a popup that requires typing DELETE; connected wires go too. Wires alone delete without a popup. | T-012, T-019–T-021, T-118 |
| F-018 | Editor | Ports | Add, rename, move between sides, flip direction and remove ports. Names are validated; removing a port removes its wires. | T-072–T-082, T-088–T-089 |
| F-019 | Editor | Bus widths | Per-port bus width with range validation, shown as [N-1:0] on the block. | T-083–T-087 |
| F-020 | Editor | Sequential / combinational modules | Sequential modules get a clock (drawn as a triangle) and a reset pinned in fixed positions; combinational ones drop them. | T-090–T-095 |
| F-021 | Editor | Logic gates | AND / NAND / OR / NOR / XOR / XNOR with real symbols, four rotations, inputs kept symmetric about the output, and a body that widens as inputs are added. | — |
| F-022 | Editor | Wiring | Click a port, then a compatible port, to connect. Refuses mismatched widths, duplicates, self-loops and output-to-output. | T-109–T-114, T-118 |
| F-023 | Editor | Wire inspection | Selecting a wire shows its endpoints and an editable label. | T-115–T-117 |
| F-024 | Editor | Wire routing | Orthogonal wires route around blocks and follow a block as it moves. | T-119 |
| F-025 | Editor | Canvas view controls | Zoom in/out, fit view, lock canvas, grid toggle (snapping persists) and minimap toggle. | T-003, T-006, T-022–T-028, T-101–T-102, T-104–T-105 |
| F-026 | Editor | Undo / redo | Full history per document; a drag or a rename is a single step. | T-005, T-052–T-060, T-096–T-097 |
| F-027 | Editor | Keyboard shortcuts | Ctrl chords work everywhere; bare keys are suppressed while typing; Alt chords are ignored; every shortcut is disabled while a popup is open. | T-096–T-108 |
| F-028 | Files | Save, open and autosave | Schematics are .rtlproj JSON files, autosaved shortly after every edit. Open Schematic (Ctrl+O) shows a searchable popup of the project's schematics (the corner folder button browses disk) and adds a tab. | T-004, T-036–T-047, T-098–T-099 |
| F-029 | Files | Untrusted documents | Malformed or hostile files are rejected without losing the open document; label markup renders as text. | T-048–T-051 |
| F-030 | Files | Import schematic as code | Build a schematic from a JSON or YAML description; it opens in a new tab. | — |
| F-031 | Files | Export | PNG, SVG, JSON and YAML export. File names can't escape the chosen folder; SVG escapes label markup. | T-029–T-035 |
| F-032 | Editor | Status bar | Live counts: cursor, zoom, viewport, components, area, signals, links, wires, empty ports and selection. | — |
| F-033 | Editor | Inspector | Properties for the selected block or wire; a multi-selection shows a summary with Delete. | T-003, T-006, T-008–T-011 |
| F-034 | Editor | Block colors | Color wheel, swatches and hex / RGB entry per block. | — |
| F-035 | Editor | Module linking | Create a module definition from a block, and link / unlink blocks to it. | — |
| F-036 | Platform | Install and update | One command builds the prod branch from source and installs or updates the app on Windows, macOS and Linux. | — |
| F-037 | Platform | Dev / production data separation | Installed builds and from-source runs keep settings, recent projects and loose autosaves in separate folders. | — |
| F-038 | Platform | Security hardening | Sandboxed renderer, IPC sender validation, navigation and permission lockdown, https-only external links. | T-034–T-035, T-048–T-051 |

## Coverage gaps

These features have no automated test yet. They're listed in priority order for new end-to-end specs; see [TESTING_STRATEGY.md](TESTING_STRATEGY.md).

1. **F-017, F-009, F-010:** the delete popup, document tabs and name prompt. These are new editor behaviors, and the older specs that touch them need updating (marked *Needs update* in [TESTS.md](TESTS.md)).
2. **F-001 – F-006:** home page and projects. They need a spec fixture that launches on the home page (no `RTL_START_VIEW=editor`) with a temporary project folder.
3. **F-021:** gate geometry. Symmetric inputs, minimum sizing and the output-label clearance are pure functions in `port-layout.ts` and `GateSymbol.tsx`, so unit tests would suit them best.
4. **F-037:** dev / production data separation. `configureDataPaths` takes its `app` and `env` as parameters, so it can be unit-tested without Electron.
5. **F-007, F-030, F-032, F-034, F-035, F-036:** everything else.
