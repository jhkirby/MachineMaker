/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { useMemo, useState } from "react";
import type { ProjectSummary } from "../../../../shared/project-model";
import { computeDiagramStats } from "../../model/diagram-stats";
import { relativeTime, sumDiagramStats } from "../../model/project-stats";
import ProjectFileSection, { type ProjectFileItem } from "./ProjectFileSection";
import StatsPanel from "./StatsPanel";

/** Row icon for a schematic: a small block with pins. */
const SCHEMATIC_GLYPH = (
  <svg viewBox="0 0 16 16" width="14" height="14">
    <rect x="4" y="4" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M1.5 6h2.5M1.5 10h2.5M12 8h2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

/** Row icon for a state machine: two states joined by a transition. */
const STATE_MACHINE_GLYPH = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <circle cx="4" cy="10" r="2.5" />
    <circle cx="12" cy="6" r="2.5" />
    <path d="M6.2 8.8 9.8 7.2" />
  </svg>
);

/** What kind of project file a delete request is for. */
export type ProjectFileKind = "schematic" | "state machine";

/** Props for {@link ProjectView}. */
interface ProjectViewProps {
  project: ProjectSummary;
  busy: boolean;
  onBack: () => void;
  onNewSchematic: () => void;
  /** Open these schematics in the editor. */
  onOpenSchematic: (path: string) => void;
  /** Ask to delete a schematic or state machine — confirmed by the caller. */
  onDeleteFile: (kind: ProjectFileKind, item: ProjectFileItem) => void;
}

/**
 * One project's page: its schematics and state machines on the left, and on
 * the right a stats panel of project-wide totals, plus a second one for the
 * schematic currently selected in the list. Click selects a schematic;
 * double-click (or Open) takes it into the editor, and Delete asks to
 * remove it. State machines list the same way, though they can't be
 * opened until their editor exists.
 *
 * @param props - See {@link ProjectViewProps}.
 * @returns The project view.
 */
export default function ProjectView({
  project,
  busy,
  onBack,
  onNewSchematic,
  onOpenSchematic,
  onDeleteFile,
}: ProjectViewProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(
    project.schematics[0]?.path ?? null,
  );
  const [selectedMachinePath, setSelectedMachinePath] = useState<string | null>(
    project.stateMachines[0]?.path ?? null,
  );
  const selected = project.schematics.find((s) => s.path === selectedPath) ?? null;

  const schematicItems = useMemo<ProjectFileItem[]>(
    () =>
      project.schematics.map((schematic) => ({
        path: schematic.path,
        name: schematic.diagram.title,
        meta: `${schematic.diagram.blocks.length} components · edited ${relativeTime(
          schematic.modifiedAt,
        )}`,
      })),
    [project],
  );
  const machineItems = useMemo<ProjectFileItem[]>(
    () =>
      project.stateMachines.map((machine) => ({
        path: machine.path,
        name: machine.name,
        meta: "Editor coming soon",
      })),
    [project],
  );

  const totals = useMemo(
    () => sumDiagramStats(project.schematics.map((s) => s.diagram)),
    [project],
  );
  const selectedStats = useMemo(
    () => (selected ? computeDiagramStats(selected.diagram) : null),
    [selected],
  );

  return (
    <div className="project-view">
      <header className="project-view__header">
        <button
          type="button"
          className="home-icon-button"
          data-hover-fx="nudge-left"
          aria-label="Back to home"
          title="Back to home"
          onClick={onBack}
        >
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
            <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="project-view__heading">
          <h1 className="project-view__name">{project.name}</h1>
          <p className="project-view__path" title={project.path}>
            {project.path}
          </p>
        </div>
      </header>

      <div className="project-view__body">
        <div className="project-view__lists">
          <ProjectFileSection
            label="Schematics"
            items={schematicItems}
            glyph={SCHEMATIC_GLYPH}
            emptyText="No schematics yet — create one to start drawing."
            selectedPath={selectedPath}
            onSelect={setSelectedPath}
            busy={busy}
            onOpen={onOpenSchematic}
            onDelete={(item) => onDeleteFile("schematic", item)}
            newLabel="New Schematic"
            onNew={onNewSchematic}
            newEnabled
          />
          <ProjectFileSection
            label="State Machines"
            items={machineItems}
            glyph={STATE_MACHINE_GLYPH}
            emptyText="State machine editing is coming soon."
            selectedPath={selectedMachinePath}
            onSelect={setSelectedMachinePath}
            busy={busy}
            // Placeholder: there's no state machine editor to open into yet.
            onOpen={() => undefined}
            openTitle="The state machine editor isn't available yet"
            onDelete={(item) => onDeleteFile("state machine", item)}
            newLabel="New State Machine"
            onNew={() => undefined}
            newEnabled={false}
            newTitle="The state machine editor isn't available yet"
          />
        </div>

        <aside className="project-view__stats">
          <StatsPanel
            heading="Project totals"
            name={project.name}
            stats={totals}
            extra={[
              { label: "Schematics", value: project.schematics.length },
              { label: "State Machines", value: project.stateMachines.length },
            ]}
          />
          {selected && selectedStats ? (
            <StatsPanel
              heading="Selected schematic"
              name={selected.diagram.title}
              stats={selectedStats}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
