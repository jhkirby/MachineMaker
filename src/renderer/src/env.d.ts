/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-08-27
 * --------------------------------------------------------------------------- */

/// <reference types="vite/client" />

import type { RtlBridgeApi } from "../../shared/ipc-contract";

declare global {
  interface Window {
    /** Preload-exposed bridge to the Electron main process. */
    rtl: RtlBridgeApi;
  }
}

export {};
