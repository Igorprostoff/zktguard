import React from "react";
import ReactDOM from "react-dom/client";
import { TonConnectUIProvider } from "@tonconnect/ui-react";

import { App } from "./App";
import "@zktguard/example-shared/style.css";

const manifestUrl =
  (import.meta as any).env?.VITE_TONCONNECT_MANIFEST_URL ??
  "https://example.com/tonconnect-manifest.json";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <App />
    </TonConnectUIProvider>
  </React.StrictMode>,
);
