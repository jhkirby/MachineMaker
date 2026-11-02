/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { useMemo, useState } from "react";
import type { ProjectSummary } from "../../../../shared/project-model";
import { computeDiagramStats } from "../../model/diagram-stats";
import { relativeTime, sumDiagramStats } from "../../model/project-stats";
import StatsPanel from "./StatsPanel";

/** Props for {@link ProjectView}. */
interface ProjectViewProps {
  project: ProjectSummary;
  busy: boolean;
  onBack: () => void;
  onNewSchematic: () => void;
  /** Open these schematics in the editor. */
  onOpenSchematic: (path: string) => void;
}

/**
 * One project's page: its schematics and state machines on the left, and on
 * the right a stats panel of project-wide totals, plus a second one for the
 * schematic currently selected in the list. Click selects a schematic;
 * double-click (or Open) takes it into the editor.
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
}: ProjectViewProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(
    project.schematics[0]?.path ?? null,
  );
  const selected = project.schematics.find((s) => s.path === selectedPath) ?? null;

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
          <section className="home-card" aria-label="Schematics">
            <div className="home-card__header">
              <p className="home-card__eyebrow">
                Schematics <span className="home-card__count">{project.schematics.length}</span>
              </p>
              <div className="home-card__header-actions">
                <button
                  type="button"
                  className="home-button home-button--small"
                  disabled={!selected || busy}
                  onClick={() => selected && onOpenSchematic(selected.path)}
                >
                  Open
                </button>
                <button
                  type="button"
                  className="home-button home-button--small home-button--primary"
                  disabled={busy}
                  onClick={onNewSchematic}
                >
                  New Schematic
                </button>
              </div>
            </div>
            {project.schematics.length === 0 ? (
              <p className="landing__empty">
                No schematics yet — create one to start drawing.
              </p>
            ) : (
              <ul className="item-list" role="listbox" aria-label="Schematics">
                {project.schematics.map((schematic) => {
                  const isSelected = schematic.path === selectedPath;
                  return (
                    <li
                      key={schematic.path}
                      role="option"
                      aria-selected={isSelected}
                      className={`item-list__row${isSelected ? " is-selected" : ""}`}
                      onClick={() => setSelectedPath(schematic.path)}
                      onDoubleClick={() => !busy && onOpenSchematic(schematic.path)}
                      title="Double-click to open"
                    >
                      <span className="item-list__glyph" aria-hidden="true">
                        <svg viewBox="0 0 16 16" width="14" height="14">
                          <rect x="4" y="4" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                          <path d="M1.5 6h2.5M1.5 10h2.5M12 8h2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                        </svg>
                      </span>
                      <span className="item-list__name">{schematic.diagram.title}</span>
                      <span className="item-list__meta">
                        {schematic.diagram.blocks.length} components · edited{" "}
                        {relativeTime(schematic.modifiedAt)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="home-card" aria-label="State machines">
            <div className="home-card__header">
              <p className="home-card__eyebrow">
                State Machines{" "}
                <span className="home-card__count">{project.stateMachines.length}</span>
              </p>
              <button
                type="button"
                className="home-button home-button--small"
                disabled
                title="The state machine editor isn't available yet"
              >
                New State Machine
              </button>
            </div>
            {project.stateMachines.length === 0 ? (
              <p className="landing__empty">
                State machine editing is coming soon.
              </p>
            ) : (
              <ul className="item-list">
                {project.stateMachines.map((machine) => (
                  <li key={machine.path} className="item-list__row is-disabled">
                    <span className="item-list__name">{machine.name}</span>
                    <span className="item-list__meta">Editor coming soon</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
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
