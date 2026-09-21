<!--
  Project:       RTL Schematic
  Owner:         Joshua H. Kirby
  Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
  Last Modified: 2026-08-27
-->

# RTL Schematic

A desktop editor for hand-authoring RTL block diagrams — modules, registers,
muxes, ALUs, memories, and the wires between their ports. Built with Electron,
TypeScript, React, and [React Flow](https://reactflow.dev).

## Features

- **Component palette** — drag modules, registers, muxes, ALUs, memories, I/O
  pins, and constants onto an infinite canvas (or double-click to drop one).
- **Typed ports & wires** — every block carries named input/output ports; wires
  connect port to port and can be tagged with a bus width and drawn thick.
- **Inspector** — rename blocks, resize them, add/remove/re-side ports, and edit
  wire labels without touching a dialog.
- **Undo/redo** — full history for every edit (`Ctrl+Z` / `Ctrl+Y`).
- **Save/Open** — projects persist as human-readable `.rtlproj` JSON.
- **Export** — PNG (raster) or standalone SVG (vector) of the whole diagram.

## Getting started

```bash
npm install
npm run dev        # launches Electron with hot reload
```

## Other scripts

| Script              | Purpose                                        |
| ------------------- | ---------------------------------------------- |
| `npm run build`     | Type-check and bundle main/preload/renderer    |
| `npm run typecheck` | Type-check only                                |
| `npm run package`   | Build and produce an installer via electron-builder |

## Project layout

```
src/
  shared/     Types and the IPC contract used by both processes
  main/       Electron main process — window, menu, file dialogs, IPC
  preload/    contextBridge API exposed to the renderer as window.rtl
  renderer/
    src/
      model/       Pure logic: component library, geometry, SVG export, adapters
      state/       Zustand store + the command hook
      components/   React UI (toolbar, palette, canvas, inspector, nodes, edges)
      styles/       Design tokens + stylesheet
```

The persistent model (`src/shared/diagram-model.ts`) is the single source of
truth; the React Flow node/edge arrays are derived views of it.
