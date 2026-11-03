# User Guide

MachineMaker is a drawing tool for digital hardware. You lay out the building blocks of a design (modules, registers, logic gates, inputs and outputs), connect them with wires, and keep everything organized in projects. This guide walks through the whole app. No programming knowledge is needed.

## Contents

1. [The home page](#1-the-home-page)
2. [Projects](#2-projects)
3. [The editor at a glance](#3-the-editor-at-a-glance)
4. [Adding components](#4-adding-components)
5. [Selecting, moving and resizing](#5-selecting-moving-and-resizing)
6. [Ports](#6-ports)
7. [Logic gates](#7-logic-gates)
8. [Wires](#8-wires)
9. [Deleting](#9-deleting)
10. [Tabs](#10-tabs)
11. [Saving, importing and exporting](#11-saving-importing-and-exporting)
12. [Getting around the canvas](#12-getting-around-the-canvas)
13. [Keyboard shortcuts](#13-keyboard-shortcuts)

## 1. The home page

MachineMaker opens on its home page. From here you can:

- **New Project:** start a fresh project. Give it a name, then choose the folder to create it in.
- **Open Project:** shows every project you've created or opened, with its location, creation date and when you last opened it. Type to search, use ↑/↓ and **Enter** to open one, or click it. A project that isn't listed yet? Click the **folder** button in the popup's corner to find it on disk. **Ctrl+/** puts the cursor back in the search box and **Escape** takes it out (press Escape again to close).
- **Recent projects:** click any project in the list to jump back in. Hovering a row shows an **×** that removes it from the list; the project itself isn't deleted.

The sun/moon button in the top-right corner switches between light and dark mode.

## 2. Projects

A project is a folder that holds your related schematics, for example every diagram for one CPU design. Opening a project shows its page:

- **Schematics** (left) lists every schematic in the project, most recently edited first. Click one to select it, then double-click it or press **Open** to edit it in a new window. The home window stays open, so you can open more. A schematic that's already open somewhere just brings its window to the front. **New Schematic** asks for a name and opens the new schematic straight away.
- **State machines** are coming in a future version.
- **Project totals** (right) add up every schematic's counts: components, wires, empty ports and so on. **Selected schematic** shows the same counts for whichever schematic you've clicked.

The **‹** button at the top left goes back to the home page.

## 3. The editor at a glance

| Area | What it's for |
|---|---|
| **Tabs** (very top) | Every schematic you have open. The house button returns to the project page. |
| **Toolbar** | Undo/redo, the File, Import and Export menus, the schematic's name, and the view buttons on the right. |
| **Components** (left) | The parts you can add. The **«** button shrinks it to a slim strip of icons. |
| **Canvas** (middle) | Your diagram. |
| **Inspector** (right) | Appears when something is selected and shows its settings. |
| **Status bar** (bottom) | Live counts: zoom level, number of components, wires, empty ports, and more. |

Your work **saves automatically** a moment after every change. There's no Save button to remember.

## 4. Adding components

There are three ways to add a component from the **Components** panel:

- **Click it**, move to where you want it on the canvas, and click again to drop it.
- **Drag it** onto the canvas.
- **Double-click it** to drop one near the middle.

Components snap to the grid and get a name automatically (Module 1, Module 2, …). If the spot is too close to another component, it shows red and won't drop there.

Single keys start placing a component too: **M** module, **R** register, **G** gate, **I** I/O port, **K** constant.

## 5. Selecting, moving and resizing

- **Click** a component to select it. Its outline thickens and the inspector opens.
- **Ctrl+click** adds or removes components from the selection.
- **Shift+drag** across the canvas to box-select everything inside.
- **Ctrl+A** (or the dashed-square toolbar button) selects everything.
- **Escape** or a click on empty canvas clears the selection.

**Move** a component by dragging it. If you drop it on top of another one, it slides back to where it was.

**Rename** it in the inspector's **Name** field. Names must be unique and start with a letter.

**Resize** it with the **−** and **+** buttons next to Width and Height, or type a number. Sizes are measured in grid squares. A component never shrinks smaller than its ports need.

**Color:** pick any color for a component in the inspector's **Color** section.

## 6. Ports

Ports are the connection points on a component's edges. In the inspector's **Ports** table you can:

- **Add** a port with **+ Port** (or press **P**).
- **Rename** it, choose which **side** it sits on, and whether it's an **input** or **output**.
- Set its **width** for multi-bit buses. A 32-bit bus shows as `[31:0]`.
- **Remove** it with **×**. Any wires attached to it go too.

**Modules** can be **sequential** (with a clock, drawn as a small triangle, and a reset) or **combinational** (no clock).

## 7. Logic gates

Add a **Gate**, then pick its type in the inspector: **AND, NAND, OR, NOR, XOR or XNOR**. **Rotation** points it right, left, up or down.

Gates always have one output. Add inputs with **+ Port**. The inputs stay evenly spaced and centered on the output, and the gate grows taller and wider to fit as you add more.

## 8. Wires

To connect two ports, **click the first port**, then **click the second**. The first port stays highlighted while you choose. Ports that can't be connected (two outputs, or buses of different widths) are marked as you hover. Press **Escape** to cancel.

Click a wire to select it. The inspector shows which ports it joins and lets you give it a **label**. Wires route themselves around components and follow along when you move things.

## 9. Deleting

- **Wires:** select and press **Delete**. They're removed straight away.
- **Components:** select one or more and press **Delete** (or **Backspace**), or use the red **Delete** button at the bottom of the inspector. A confirmation box appears: type **DELETE** and press **Enter**. Wires connected to deleted components are removed too.

In the confirmation box, **Ctrl+/** puts the cursor in the text field and **Escape** takes it out. Press Escape again, or the **×**, to cancel.

Changed your mind? **Ctrl+Z** undoes it.

## 10. Tabs

Each open schematic gets a tab at the top of its window, with up to 8 per window.

- Click a tab to switch to it. Each tab remembers its own zoom, position and undo history.
- Hover a tab to show its **×**, or middle-click it, to close it.
- **File → New Schematic** (Ctrl+N) and **File → Open Schematic** (Ctrl+O) always open a new tab. They're greyed out when 8 tabs are already open. Open Schematic lists the project's schematics with a search box, just like Open Project, and its **folder** button opens a file from anywhere on disk.
- **Ctrl+W** closes the current tab (or the window, if it's the only tab). **Ctrl+Shift+W** closes every tab in the window.
- The **house** button (**Ctrl+H**) brings the home window to the front, reopening it if you closed it. Closing a window's last tab closes that window.

**Working across windows and monitors.** Tabs drag just like in a web browser:

- **Drag a tab sideways** along the strip to reorder it.
- **Drag a tab away from the strip** and let go to open it in its own window, right where you dropped it. Use this to put schematics on different monitors.
- **Drag a tab onto another window's tabs** to move it into that window.
- Dragging a window's **only** tab moves the whole window.

A tab keeps its undo history when it moves between windows.

## 11. Saving, importing and exporting

- **Saving** is automatic. Schematics are stored as `.rtlproj` files inside the project's `schematics` folder.
- **Import → JSON / YAML** builds a schematic from a text description and opens it in a new tab.
- **Export** saves the current schematic as a **PNG** image, an **SVG** drawing (sharp at any size, good for documents and slides), or as **JSON / YAML** text.

## 12. Getting around the canvas

| Control | Does |
|---|---|
| Scroll wheel | Zoom in and out |
| Drag empty canvas | Pan |
| Shift+scroll / Ctrl+scroll | Pan sideways / up and down |
| **+** / **−** | Zoom in / out |
| Corners button (or **C**) | Fit the whole diagram on screen |
| Grid button (Ctrl+G) | Show or hide the grid; components still snap to it |
| Lock button (**L**) | Lock the canvas so nothing can be moved by accident |
| Map button | Show or hide the minimap in the corner |

## 13. Keyboard shortcuts

| Shortcut | Action |
|---|---|
| Ctrl+N / Ctrl+O | New / open schematic (new tab) |
| Ctrl+W / Ctrl+Shift+W | Close the tab (or window, if it's the last) / close every tab |
| Ctrl+H | Go to the home window |
| Ctrl+S | Save now (it also saves automatically) |
| Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) | Undo / redo |
| Ctrl+A | Select everything |
| Delete / Backspace | Delete the selection |
| Escape | Clear the selection, or cancel a wire in progress |
| P | Add a port to the selected component |
| M / R / G / I / K | Place a module / register / gate / I/O port / constant |
| + / − / C | Zoom in / zoom out / fit view |
| L | Lock or unlock the canvas |
| Ctrl+G | Toggle the grid |
| Ctrl+T | Toggle light / dark mode |
| Ctrl+L | Collapse or expand the components panel |
| Ctrl+F / Ctrl+E | Open the File / Export menu |
| Ctrl+/ | Jump to the schematic name (or, in a popup, to its text field) |
| F11 | Full screen |

Single-key shortcuts are ignored while you're typing in a text field, so typing a name never triggers them.
