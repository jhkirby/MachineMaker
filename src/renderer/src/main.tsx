/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-08-27
 * --------------------------------------------------------------------------- */

import React from "react";
import ReactDOM from "react-dom/client";
import { ReactFlowProvider } from "@xyflow/react";
import App from "./App";
import HomeApp from "./components/home/HomeApp";
import "@xyflow/react/dist/style.css";
import "./styles/app.css";
import "./styles/tabs.css";
import "./styles/home.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container #root is missing from index.html");
}

// Home and editor windows load this same bundle; the main process sets the
// URL hash to say which one this window is (WindowManager.createWindow).
const isHome = window.location.hash === "#home";

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    {isHome ? (
      <HomeApp />
    ) : (
      <ReactFlowProvider>
        <App />
      </ReactFlowProvider>
    )}
  </React.StrictMode>,
);
