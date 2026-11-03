/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { useDiagramStore } from "../state/diagram-store";
import TypedDeleteDialog from "./TypedDeleteDialog";

/**
 * Confirmation popup for deleting components, shown while `pendingDelete`
 * (diagram-store) is set. The type-DELETE behavior itself lives in
 * TypedDeleteDialog.
 *
 * @returns The popup, or null when nothing is pending.
 */
export default function DeleteConfirmDialog() {
  const pending = useDiagramStore((s) => s.pendingDelete);
  const blocks = useDiagramStore((s) => s.diagram.blocks);
  const confirm = useDiagramStore((s) => s.confirmPendingDelete);
  const cancel = useDiagramStore((s) => s.cancelPendingDelete);
  if (!pending) {
    return null;
  }

  const single =
    pending.blockIds.length === 1
      ? blocks.find((block) => block.id === pending.blockIds[0])
      : undefined;

  // Keyed on the pending request so each opening starts with an empty field.
  return (
    <TypedDeleteDialog
      key={pending.blockIds.join(",")}
      title={single ? `Delete ${single.label}?` : "Delete these components?"}
      onConfirm={confirm}
      onCancel={cancel}
    />
  );
}
