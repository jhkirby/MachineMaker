# UI Standards

The rules every MachineMaker screen follows. They were extracted from the interface as it stands, and new rules get added here as the app grows. When a change would break a rule, either follow the rule or update it here deliberately, in the same change.

Each rule has an ID (`UI-…`) so reviews and commits can cite it.

## 1. Theme and color

| ID | Rule |
|---|---|
| UI-1.1 | **Colors come from tokens only.** Use the custom properties in `styles/tokens.css` (`--surface-*`, `--text-*`, `--border-*`, `--accent`, `--danger`, …). Never hardcode a color in a component or rule, except a token's own definition. |
| UI-1.2 | **Every token exists in both themes.** A new token is defined under `:root` (dark) *and* `:root[data-theme="light"]`. Every screen must be checked in both. |
| UI-1.3 | **Accent means "interactive / selected"; danger means "destructive / invalid".** Don't use either decoratively. |
| UI-1.4 | **A block's own color wins inside its context.** Inspector controls for a block read `--block-stroke` (falling back to `--accent`), so the panel matches the block being edited. |
| UI-1.5 | **The theme toggle is available everywhere:** toolbar, home page, and Ctrl+T. The choice persists. |

## 2. Layout and spacing

| ID | Rule |
|---|---|
| UI-2.1 | **Spacing uses the scale** `--space-1…5` (4, 8, 12, 16, 24 px). No one-off margins or paddings. |
| UI-2.2 | **Corners use `--radius` (6 px).** Pills (home buttons, badges) use `999px`; round icon buttons use `50%`. |
| UI-2.3 | **Everything on the canvas sits on the grid.** Blocks, ports and wires snap to grid points; sizes are whole cells. Gates use even cell counts so their midline lands on the grid. |
| UI-2.4 | **Paired fields span the panel.** Side-by-side inspector fields (Width / Height) spread to the panel's full width, flush with the full-width field above them. |
| UI-2.5 | **Long text truncates with an ellipsis and shows in full as a tooltip.** This applies to tab names, paths and list rows. Popup titles wrap instead. |

## 3. Typography

| ID | Rule |
|---|---|
| UI-3.1 | **One UI font** (`--font-ui`). Monospace (`--font-mono`) only for code-like values: the status bar, hex colors, the type-DELETE field. |
| UI-3.2 | **Base size 13 px.** Secondary text 12 px, metadata and paths 11 px. Headings go up from there: popup title 16 px, project name 26 px, app title 40 px. |
| UI-3.3 | **Buttons, menu items and popup titles use Title Case** ("New Schematic", "Open Project"). **Section labels** ("Recent projects", "Components") are small uppercase letter-spaced eyebrows. |
| UI-3.4 | **Interface text can't be selected; text you type can.** `body` sets `user-select: none`, and inputs opt back in. |
| UI-3.5 | **Numbers that change in place use tabular figures** (`font-variant-numeric: tabular-nums`) so they don't jitter. |

## 4. Controls

| ID | Rule |
|---|---|
| UI-4.1 | **Every hover state fades.** Background, border and color changes transition over **180 ms ease**; nothing snaps. |
| UI-4.2 | **Icon buttons move their icon on hover** through `data-hover-fx`. The effect hints at the action: nudge toward the direction, spin a quarter turn for +, wiggle for lock, and so on. It uses the shared springy easing (260 ms, slight overshoot) and plays in reverse on leave. Pick an existing effect before inventing one. |
| UI-4.3 | **Disabled means 40% opacity and no hover reaction.** Disabled menu items carry a tooltip saying why (e.g. the tab limit). |
| UI-4.4 | **No focus rings.** Every control has its own hover, focus or active cue instead (focused inputs get an accent border and glow). |
| UI-4.5 | **Number fields use flanking − / + steppers**, never the browser's spin buttons. They're sized to the widest value the field accepts. |
| UI-4.6 | **Invalid input shows a red (`--danger`) border.** A field never goes blank: on blur it commits a valid value or snaps back to the last good one. |
| UI-4.7 | **Destructive buttons use the red outline style:** raised surface, red text, red border, and a faint red wash on hover. Solid red fills aren't used. |
| UI-4.8 | **Icons are inline SVG** on a 16-unit viewBox, stroked in `currentColor` at 1.5–1.6 width with round caps and joins, so they follow the text color and theme. |

## 5. Tooltips and shortcuts

| ID | Rule |
|---|---|
| UI-5.1 | **Every icon-only button has a tooltip and an `aria-label`.** Tooltips are written as plain `title` props; `TooltipLayer` renders them in the app's own style. |
| UI-5.2 | **A tooltip names the shortcut in parentheses** when there is one: "Zoom in (+)", "Home (Ctrl+H)", "Close (Esc)". |
| UI-5.3 | **Ctrl chords work everywhere,** including while typing. The exceptions are chords a text field needs for itself (Ctrl+A). **Bare-key shortcuts are ignored while typing**, and **Alt chords are never used.** |
| UI-5.4 | **Ctrl+/ jumps the cursor to the screen's main text field; Escape takes it back out.** In the editor that's the schematic name; in a popup it's the popup's field. |
| UI-5.5 | **Every shortcut is listed** in the User Guide's shortcut table, and in the relevant tooltip. |

## 6. Popups

| ID | Rule |
|---|---|
| UI-6.1 | **Every popup is built on `Modal`.** It's centered in the window over a blurred backdrop, and the rest of the app is made `inert` (no clicks, focus or shortcuts) until it closes. |
| UI-6.2 | **Layout:** the title is centered at the top; a **×** sits in the top-right corner, with any extra icon actions just left of it (e.g. the folder button that browses the file system); the primary action is centered at the bottom. No Cancel buttons; the × and Escape cancel. |
| UI-6.3 | **The keyboard contract (`usePopupKeys`):** the popup's text field has the cursor on open; **Ctrl+/** returns to it; **Escape** leaves it, and a second Escape closes the popup; **Enter** submits once the input is valid. |
| UI-6.4 | **Things to open are picked from a list, not straight from the OS dialog.** Open Project and Open Schematic list what's known, with a search box above (matching every word against name and path), ↑/↓ to move, and Enter to open. The corner folder button falls back to the OS dialog. Rows show the name, the path, and dates on the right. |
| UI-6.5 | **Creating something asks for its name first** (New Project, New Schematic), with a sensible default pre-selected so typing replaces it. |
| UI-6.6 | **Deleting components requires typing `DELETE`.** The field accepts only that word's letters, shows them uppercase, and the confirm button reads "Confirm". Deleting only wires needs no confirmation (undo covers it). |

## 7. Motion

| ID | Rule |
|---|---|
| UI-7.1 | **Standard durations:** 120 ms for canvas hover tints and port feedback, **140 ms** (`--selection-ring-duration`) for selection rings, **180 ms** for control hovers, 260 ms for springy icon motion, 400–500 ms for page entrances. |
| UI-7.2 | **State changes animate rather than jump.** A selection ring grows from zero width; a popup fades in; a page rises in. |
| UI-7.3 | **Decorative motion respects `prefers-reduced-motion`.** The home page's circuit pulses, logo glow and entrance animations turn off. |
| UI-7.4 | **Things follow the pointer with no transition** (a dragged tab or block), so they never lag behind the cursor. |

## 8. Windows and tabs

| ID | Rule |
|---|---|
| UI-8.1 | **Frameless windows with the app's own title bar.** Window buttons appear on title-bar hover; the empty title bar drags the window. |
| UI-8.2 | **Tabs behave like a browser's:** click to switch; the × shows on hover; middle-click closes; drag to reorder; drag out to tear off into a new window, or onto another window's strip to move it. At most 8 per window, after which the actions that add tabs are disabled. |
| UI-8.3 | **A file is open in at most one place.** Opening something already open brings its window and tab forward instead. |
| UI-8.4 | **Ctrl+W closes the current tab** (the window, if it's the last tab), **Ctrl+Shift+W closes every tab in the window**, and **Ctrl+H brings up the home window.** |

## 9. Canvas

| ID | Rule |
|---|---|
| UI-9.1 | **Selection shows as a thicker outline** of the component's own shape: a 3 px inset ring in the block's color. Gates ring their actual silhouette, not a box. |
| UI-9.2 | **Hover lightens the exact shape under the pointer.** A block tint never shows at the same time as a port's own hover. |
| UI-9.3 | **Invalid placement is shown before the drop:** the preview turns red where a component can't go. |
| UI-9.4 | **Labels never touch a border.** Port labels keep a fixed inset from the body's actual edge, including curved gate bodies and negation bubbles. |
| UI-9.5 | **Symmetric symbols stay symmetric.** A gate's inputs are spaced evenly about its output's midline, and adding an input never shrinks the gate. |

## 10. Accessibility

| ID | Rule |
|---|---|
| UI-10.1 | **Semantic roles on custom widgets:** tabs (`tablist`/`tab`), list pickers (`listbox`/`option`), popups (`alertdialog` with `aria-modal`). Selection and pressed states use `aria-selected` and `aria-pressed`. |
| UI-10.2 | **Everything is reachable from the keyboard,** and every icon-only control has an accessible name (UI-5.1). |
| UI-10.3 | **Decorative graphics are hidden from assistive tech** (`aria-hidden`): the circuit backdrop, icon SVGs and gate symbols. |
