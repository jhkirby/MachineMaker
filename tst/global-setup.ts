/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-04
 * --------------------------------------------------------------------------- */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..");

/**
 * Bundle main/preload/renderer into `out/` so the suite always exercises the
 * current source. Set `RTL_SKIP_BUILD=1` to reuse an existing bundle while
 * iterating on tests.
 *
 * @returns Nothing; throws if the build fails or leaves no entry point.
 * @throws {Error} If `out/main/index.js` is missing after the build.
 */
export default function globalSetup(): void {
  if (process.env["RTL_SKIP_BUILD"] !== "1") {
    // execSync, not execFileSync: on Windows the npm entry point is a .cmd
    // shim, which Node refuses to spawn directly (EINVAL) without a shell.
    execSync("npm run build", { cwd: REPO_ROOT, stdio: "inherit" });
  }

  const entry = resolve(REPO_ROOT, "out/main/index.js");
  if (!existsSync(entry)) {
    throw new Error(`Electron entry point not found at ${entry}. Run "npm run build".`);
  }
}
