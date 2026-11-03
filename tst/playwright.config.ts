/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-09-04
 * --------------------------------------------------------------------------- */

// Playwright configuration for the UI suite. Every spec drives the real
// Electron app (main + preload + renderer) rather than a browser page, so the
// bundle in `out/` must exist and be current — `global-setup.ts` rebuilds it.

import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

export default defineConfig({
  testDir: resolve(__dirname, "specs"),
  globalSetup: resolve(__dirname, "global-setup.ts"),
  outputDir: resolve(__dirname, ".artifacts"),

  // Each test launches its own Electron process and drives native file
  // dialogs through a main-process stub. Serial execution keeps those
  // processes from competing for the OS window/focus state on Windows.
  workers: 1,
  fullyParallel: false,

  // A hung Electron launch is the common failure here, and it hangs for the
  // whole timeout — keep it short enough to fail fast, long enough for a cold
  // first launch on Windows.
  timeout: 45_000,
  expect: { timeout: 10_000 },

  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : [["list"]],

  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
