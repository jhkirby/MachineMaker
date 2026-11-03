/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { create } from "zustand";

/** What the name popup (NamePromptDialog.tsx) is currently asking for. */
export interface NamePromptRequest {
  /** Popup heading, e.g. "New Schematic". */
  title: string;
  /** Pre-filled value, selected so typing replaces it. */
  initialValue: string;
  /** Label on the submit button, e.g. "Create". */
  submitLabel: string;
}

interface NamePromptState {
  /** The open request, or null when no popup is showing. */
  request: NamePromptRequest | null;
  /** Settles the promise {@link requestName} handed out. */
  resolve: ((name: string | null) => void) | null;
}

/** Backing store for the single name popup the app ever shows at once. */
export const useNamePromptStore = create<NamePromptState>(() => ({
  request: null,
  resolve: null,
}));

/**
 * Ask the user for a name in a popup, from anywhere (a toolbar command, a
 * home-page button) without that caller having to render the popup itself —
 * NamePromptDialog, mounted once per window, renders whatever is asked here.
 *
 * @param request - What to ask.
 * @returns The trimmed name, or null if the popup was closed without one. A
 *   second request while one is open cancels the first (resolving it null).
 */
export function requestName(request: NamePromptRequest): Promise<string | null> {
  useNamePromptStore.getState().resolve?.(null);
  return new Promise((resolve) => {
    useNamePromptStore.setState({ request, resolve });
  });
}

/**
 * Close the popup, settling its pending {@link requestName} call.
 *
 * @param name - The submitted name, or null for a cancel.
 */
export function settleNamePrompt(name: string | null): void {
  const { resolve } = useNamePromptStore.getState();
  useNamePromptStore.setState({ request: null, resolve: null });
  resolve?.(name);
}
