// MUST be first — installs the Buffer global before @ton/core or
// @tonconnect/ui-react evaluate at import time.
import "./polyfills";

import React from "react";
import ReactDOM from "react-dom/client";
import { TonConnectUIProvider } from "@tonconnect/ui-react";

import { App } from "./App";
import "./index.css";

const manifestUrl =
  import.meta.env.VITE_TONCONNECT_MANIFEST_URL ??
  "https://example.com/tonconnect-manifest.json";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <App />
    </TonConnectUIProvider>
  </React.StrictMode>,
);
