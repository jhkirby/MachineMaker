/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import {
  RECENT_PROJECTS_SHOWN,
  type RecentProject,
} from "../../../../shared/project-model";
import { relativeTime } from "../../model/project-stats";

/** Props for {@link LandingView}. */
interface LandingViewProps {
  recents: RecentProject[];
  /** Set while a project is being created/opened, to disable the buttons. */
  busy: boolean;
  onNewProject: () => void;
  onOpenProject: () => void;
  onOpenRecent: (path: string) => void;
  onForgetRecent: (path: string) => void;
}

/**
 * The home page's front: logo and name, the New/Open Project buttons, and
 * the recent-projects list.
 *
 * @param props - See {@link LandingViewProps}.
 * @returns The landing view.
 */
export default function LandingView({
  recents,
  busy,
  onNewProject,
  onOpenProject,
  onOpenRecent,
  onForgetRecent,
}: LandingViewProps) {
  return (
    <div className="landing">
      <header className="landing__hero">
        <div className="landing__logo-ring">
          <img className="landing__logo" src="./icon.svg" alt="" />
        </div>
        <h1 className="landing__title">MachineMaker</h1>
      </header>

      <div className="landing__actions">
        <button
          type="button"
          className="home-button home-button--primary"
          disabled={busy}
          onClick={onNewProject}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          New Project
        </button>
        <button
          type="button"
          className="home-button"
          disabled={busy}
          onClick={onOpenProject}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path
              d="M1.75 4.25a1 1 0 0 1 1-1h3.5l1.5 1.5h5.5a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-10.5a1 1 0 0 1-1-1z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          Open Project
        </button>
      </div>

      <section className="home-card landing__recents" aria-label="Recent projects">
        <p className="home-card__eyebrow">Recent projects</p>
        {recents.length === 0 ? (
          <p className="landing__empty">
            Projects you create or open will show up here.
          </p>
        ) : (
          <ul className="recent-list">
            {recents.slice(0, RECENT_PROJECTS_SHOWN).map((recent) => (
              <li key={recent.path} className="recent-list__row">
                <button
                  type="button"
                  className="recent-list__open"
                  disabled={busy}
                  onClick={() => onOpenRecent(recent.path)}
                  title={recent.path}
                >
                  <span className="recent-list__name">{recent.name}</span>
                  <span className="recent-list__path">{recent.path}</span>
                  <span className="recent-list__time">{relativeTime(recent.openedAt)}</span>
                </button>
                <button
                  type="button"
                  className="recent-list__forget"
                  aria-label={`Remove ${recent.name} from recent projects`}
                  title="Remove from list (the folder is kept)"
                  onClick={() => onForgetRecent(recent.path)}
                >
                  <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true">
                    <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
