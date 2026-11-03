/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { useEffect, useMemo, useState } from "react";
import type { ModuleDefinition, RtlBlock, RtlDiagram } from "../../../shared/diagram-model";
import { moduleInterfaceOf, portsMatch } from "../../../shared/module-interface";
import type { ProjectSchematic } from "../../../shared/project-model";
import { wiresDroppedByLink } from "../model/module-link-ports";
import { relativeTime } from "../model/project-stats";
import { useDiagramStore } from "../state/diagram-store";
import { cacheLinkedSchematic, projectRelative } from "../state/module-links";
import ListPickerDialog, { type PickerItem } from "./ListPickerDialog";
import Modal from "./Modal";

/** One schematic the module could link to. */
interface Candidate {
  relative: string;
  diagram: RtlDiagram;
  definition: ModuleDefinition;
  match: boolean;
  modifiedAt: string;
}

/**
 * The project-relative paths of every schematic that can reach `target`
 * through links — linking a module in `target` to any of them would make
 * a schematic contain itself.
 *
 * @param schematics - Every schematic in the project, by relative path.
 * @param target - The schematic being edited.
 * @returns Relative paths (lower-cased for comparison) that lead back to it.
 */
function schematicsReaching(
  schematics: ReadonlyMap<string, RtlDiagram>,
  target: string,
): Set<string> {
  const key = (path: string) => path.toLowerCase();
  const reaches = new Set<string>([key(target)]);
  // Grow the set until no schematic outside it links into it.
  for (let changed = true; changed; ) {
    changed = false;
    for (const [path, diagram] of schematics) {
      if (reaches.has(key(path))) {
        continue;
      }
      const linksIn = diagram.blocks.some(
        (block) => !!block.linkedModule?.path && reaches.has(key(block.linkedModule.path)),
      );
      if (linksIn) {
        reaches.add(key(path));
        changed = true;
      }
    }
  }
  return reaches;
}

/** Props for {@link LinkModuleDialog}. */
interface LinkModuleDialogProps {
  /** The module being linked. */
  block: RtlBlock;
  projectPath: string;
  onClose: () => void;
}

/**
 * The Link Module popup: every schematic in the project the module could
 * stand for, each marked "Ports Match" ✓ or ✗ (matches listed first).
 * Picking a match links straight away; picking one that doesn't match
 * first warns that the module's ports will change and how many wires that
 * disconnects. Only this project's schematics are offered — no browsing
 * the disk — and never the schematic being edited, or any that links back
 * to it, which would make a schematic contain itself.
 *
 * @param props - See {@link LinkModuleDialogProps}.
 * @returns The popup.
 */
export default function LinkModuleDialog({ block, projectPath, onClose }: LinkModuleDialogProps) {
  const diagram = useDiagramStore((s) => s.diagram);
  const filePath = useDiagramStore((s) => s.filePath);
  const applyModuleInterface = useDiagramStore((s) => s.applyModuleInterface);
  const [schematics, setSchematics] = useState<ProjectSchematic[] | null>(null);
  const [pending, setPending] = useState<Candidate | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.rtl
      .loadProject(projectPath)
      .then((project) => !cancelled && setSchematics(project.schematics))
      .catch(() => !cancelled && setSchematics([]));
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  const candidates = useMemo<Candidate[]>(() => {
    if (!schematics) {
      return [];
    }
    const byRelative = new Map<string, ProjectSchematic>();
    for (const schematic of schematics) {
      const relative = projectRelative(projectPath, schematic.path);
      if (relative) {
        byRelative.set(relative, schematic);
      }
    }
    const self = filePath ? projectRelative(projectPath, filePath) : null;
    const excluded = self
      ? schematicsReaching(
          new Map([...byRelative].map(([path, s]) => [path, s.diagram])),
          self,
        )
      : new Set<string>();
    const list = [...byRelative]
      .filter(([relative]) => !excluded.has(relative.toLowerCase()))
      .map(([relative, schematic]) => {
        const definition = moduleInterfaceOf(schematic.diagram, relative);
        return {
          relative,
          diagram: schematic.diagram,
          definition,
          match: portsMatch(block, definition),
          modifiedAt: schematic.modifiedAt,
        };
      });
    // Matches first; within each group the project's newest-first order
    // holds (Array.prototype.sort is stable).
    return list.sort((a, b) => Number(b.match) - Number(a.match));
  }, [schematics, projectPath, filePath, block]);

  const link = (candidate: Candidate) => {
    cacheLinkedSchematic(candidate.relative, candidate.diagram);
    applyModuleInterface(block.id, candidate.definition);
    onClose();
  };

  if (pending) {
    const dropped = wiresDroppedByLink(diagram, block.id, pending.definition);
    return (
      <Modal title="Ports don't match" onClose={() => setPending(null)}>
        <p className="modal__detail">
          Linking to {pending.diagram.title} changes this module's ports to match
          that schematic&apos;s I/O ports
          {dropped > 0
            ? ` and disconnects ${dropped} wire${dropped === 1 ? "" : "s"} from ports that no longer fit.`
            : "."}
        </p>
        <div className="modal__actions modal__actions--spread">
          <button type="button" className="modal__button modal__button--quiet" onClick={() => setPending(null)}>
            Back
          </button>
          <button type="button" className="modal__button" onClick={() => link(pending)}>
            Link Anyway
          </button>
        </div>
      </Modal>
    );
  }

  const linkedPath = block.linkedModule?.path?.toLowerCase();
  const items: PickerItem[] = candidates.map((candidate) => ({
    key: candidate.relative,
    name: candidate.diagram.title,
    path: candidate.relative,
    badge: candidate.relative.toLowerCase() === linkedPath ? "Linked" : undefined,
    details: [
      {
        label: "Ports Match:",
        value: candidate.match ? "✓" : "✗",
        tone: candidate.match ? "good" : "bad",
      },
      { label: "Edited", value: relativeTime(candidate.modifiedAt) },
    ],
  }));

  return (
    <ListPickerDialog
      title="Link Module"
      searchPlaceholder="Search schematics"
      emptyText="No other schematics in this project to link to. Use Create Module to make one."
      loading={schematics === null}
      items={items}
      onPick={(item) => {
        const candidate = candidates.find((c) => c.relative === item.key);
        if (candidate) {
          if (candidate.match) {
            link(candidate);
          } else {
            setPending(candidate);
          }
        }
      }}
      onClose={onClose}
    />
  );
}
