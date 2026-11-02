/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { useEffect, useState } from "react";
import type { ProjectSchematic } from "../../../shared/project-model";
import { relativeTime } from "../model/project-stats";
import { useDiagramStore } from "../state/diagram-store";
import {
  closeSchematicPicker,
  useSchematicPicker,
} from "../state/schematic-picker-store";
import { activateTabByPath, openInNewTab, useTabStore } from "../state/tab-store";
import ListPickerDialog, { type PickerItem } from "./ListPickerDialog";

/**
 * Open a schematic by path: switch to it if this window has it, bring the
 * other window forward if one does, otherwise load it into a new tab here.
 *
 * @param path - The schematic file.
 */
async function openSchematicPath(path: string): Promise<void> {
  if (openHere(path)) {
    await activateTabByPath(path);
    return;
  }
  if (await window.rtl.focusOpenDocument(path)) {
    return;
  }
  await openInNewTab(await window.rtl.loadDiagram(path), path);
}

/**
 * Whether this window already has `path` open in some tab.
 *
 * @param path - A schematic file.
 * @returns True if so.
 */
function openHere(path: string): boolean {
  const { tabs, activeId } = useTabStore.getState();
  const livePath = useDiagramStore.getState().filePath;
  return tabs.some((tab) =>
    tab.id === activeId ? livePath === path : tab.snapshot?.filePath === path,
  );
}

/**
 * The editor's Open Schematic popup (File → Open Schematic, Ctrl+O): every
 * schematic in this window's project, newest first, under a search box.
 * The corner folder button opens one from anywhere on disk instead.
 * Mount once per editor window.
 *
 * @returns The popup, or null when closed.
 */
export default function SchematicPickerDialog() {
  const open = useSchematicPicker((s) => s.open);
  return open ? <SchematicPickerBody /> : null;
}

/**
 * The open popup: loads the project's schematics on mount.
 *
 * @returns The popup.
 */
function SchematicPickerBody() {
  const projectPath = useTabStore((s) => s.projectPath);
  const [schematics, setSchematics] = useState<ProjectSchematic[] | null>(
    projectPath ? null : [],
  );

  useEffect(() => {
    if (!projectPath) {
      return;
    }
    let cancelled = false;
    window.rtl
      .loadProject(projectPath)
      .then((project) => !cancelled && setSchematics(project.schematics))
      .catch(() => !cancelled && setSchematics([]));
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  const items: PickerItem[] = (schematics ?? []).map((schematic) => ({
    key: schematic.path,
    name: schematic.diagram.title,
    path: schematic.path,
    badge: openHere(schematic.path) ? "Open" : undefined,
    details: [
      { label: "Edited", value: relativeTime(schematic.modifiedAt) },
      { label: "Components", value: String(schematic.diagram.blocks.length) },
    ],
  }));

  const pick = (item: PickerItem) => {
    closeSchematicPicker();
    void openSchematicPath(item.key).catch((error: unknown) =>
      window.alert(
        `Couldn't open that schematic.\n\n${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  };

  const browse = async () => {
    closeSchematicPicker();
    const result = await window.rtl.openDiagram({
      defaultPath: projectPath ?? undefined,
    });
    if (result.ok && result.data && result.path) {
      if (openHere(result.path)) {
        await activateTabByPath(result.path);
      } else if (!(await window.rtl.focusOpenDocument(result.path))) {
        await openInNewTab(result.data, result.path);
      }
    }
  };

  return (
    <ListPickerDialog
      title="Open Schematic"
      searchPlaceholder="Search schematics"
      browseLabel="Browse for a schematic file"
      emptyText={
        projectPath
          ? "This project has no schematics yet."
          : "This window isn't part of a project. Use the folder button to open a schematic from disk."
      }
      loading={schematics === null}
      items={items}
      onPick={pick}
      onBrowse={() => void browse()}
      onClose={closeSchematicPicker}
    />
  );
}
