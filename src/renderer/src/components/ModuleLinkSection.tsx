/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { useState } from "react";
import type { RtlBlock } from "../../../shared/diagram-model";
import { isLinkedModule, moduleInterfaceOf } from "../../../shared/module-interface";
import { schematicForModule } from "../model/module-link-ports";
import { useDiagramStore } from "../state/diagram-store";
import {
  cacheLinkedSchematic,
  linkedSchematic,
  projectRelative,
  resolveInProject,
  useLinkedSchematics,
} from "../state/module-links";
import { requestName } from "../state/name-prompt-store";
import { openSchematicPath, useTabStore } from "../state/tab-store";
import LinkModuleDialog from "./LinkModuleDialog";

/**
 * Report a failed link action the way the rest of the editor does.
 *
 * @param what - What was being attempted.
 * @param error - Whatever was thrown.
 */
function reportFailure(what: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  window.alert(`${what}\n\n${message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "")}`);
}

/**
 * A module block's Link section in the inspector. Unlinked, it offers
 * **Link Module** (pick an existing schematic in the project) and **Create
 * Module** (name a new schematic, built with an I/O port for each of the
 * module's ports, and link to it). Linked, it names the schematic and
 * offers Open, Change and Unlink — or says so if the schematic's file is
 * gone. Linking only works inside a project, since a link is a path within
 * one.
 *
 * @param props.block - The selected module.
 * @returns The section.
 */
export default function ModuleLinkSection({ block }: { block: RtlBlock }) {
  const projectPath = useTabStore((s) => s.projectPath);
  const byPath = useLinkedSchematics((s) => s.byPath);
  const applyModuleInterface = useDiagramStore((s) => s.applyModuleInterface);
  const unlinkModule = useDiagramStore((s) => s.unlinkModule);
  const [pickerOpen, setPickerOpen] = useState(false);

  const linked = isLinkedModule(block);
  const relative = block.linkedModule?.path;
  const child = relative ? linkedSchematic(byPath, relative) : undefined;
  const noProjectTitle = "Only modules in a project can be linked";

  const createModule = async () => {
    if (!projectPath) {
      return;
    }
    const name = await requestName({
      title: "New Module",
      initialValue: block.label,
      submitLabel: "Create",
    });
    if (!name) {
      return;
    }
    try {
      const result = await window.rtl.createSchematic({
        projectPath,
        name,
        diagram: schematicForModule(block, name),
      });
      const path = result.ok && result.path ? projectRelative(projectPath, result.path) : null;
      if (path && result.data) {
        cacheLinkedSchematic(path, result.data);
        applyModuleInterface(block.id, moduleInterfaceOf(result.data, path));
      }
    } catch (error) {
      reportFailure("Couldn't create the module's schematic.", error);
    }
  };

  const openLinked = () => {
    if (projectPath && relative) {
      void openSchematicPath(resolveInProject(projectPath, relative)).catch((error: unknown) =>
        reportFailure("Couldn't open the linked schematic.", error),
      );
    }
  };

  return (
    <>
      <h3 className="inspector__subheading">Link</h3>
      {linked ? (
        <div className="field">
          <p className="link-section__status">
            Linked to{" "}
            <span className="link-section__name">
              {child?.title ?? block.linkedModule?.name ?? relative}
            </span>
          </p>
          {child === null ? (
            <p className="field__note link-section__missing">
              Its schematic is missing — it may have been deleted. Change or
              unlink it.
            </p>
          ) : null}
          <div className="link-section__actions">
            <button
              type="button"
              title="Open the linked schematic"
              disabled={!projectPath || !child}
              onClick={openLinked}
            >
              Open
            </button>
            <button
              type="button"
              title={projectPath ? "Link to a different schematic" : noProjectTitle}
              disabled={!projectPath}
              onClick={() => setPickerOpen(true)}
            >
              Change
            </button>
            <button
              type="button"
              title="Detach this module from its schematic"
              onClick={() => unlinkModule(block.id)}
            >
              Unlink
            </button>
          </div>
        </div>
      ) : (
        <div className="field">
          <p className="inspector__muted">Module Unlinked</p>
          <div className="link-section__actions">
            <button
              type="button"
              title={projectPath ? "Link this module to a schematic in the project" : noProjectTitle}
              disabled={!projectPath}
              onClick={() => setPickerOpen(true)}
            >
              Link Module
            </button>
            <button
              type="button"
              title={
                projectPath
                  ? "Create a new schematic with this module's ports, and link to it"
                  : noProjectTitle
              }
              disabled={!projectPath}
              onClick={() => void createModule()}
            >
              Create Module
            </button>
          </div>
        </div>
      )}
      {pickerOpen && projectPath ? (
        <LinkModuleDialog
          block={block}
          projectPath={projectPath}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </>
  );
}
