/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { create } from "zustand";

/**
 * Whether the editor's Open Schematic popup (SchematicPickerDialog.tsx) is
 * showing. A store rather than component state so the File menu command
 * and Ctrl+O (use-diagram-commands.ts) can open it from outside React.
 */
export const useSchematicPicker = create<{ open: boolean }>(() => ({ open: false }));

/** Show the Open Schematic popup. */
export function openSchematicPicker(): void {
  useSchematicPicker.setState({ open: true });
}

/** Hide the Open Schematic popup. */
export function closeSchematicPicker(): void {
  useSchematicPicker.setState({ open: false });
}
