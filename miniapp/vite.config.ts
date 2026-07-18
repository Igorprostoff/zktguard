import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // Cloudflare quick tunnels get a random *.trycloudflare.com
    // subdomain per start; allow the whole suffix for demo tunnels.
    allowedHosts: [".trycloudflare.com"],
    // Same-origin paths for the off-chain services so the app works
    // from a phone / Telegram webview through a single public URL
    // (tunnel or hosting). Point VITE_ATTESTOR_URL=/api/attestor and
    // VITE_PROVER_URL=/api/prover to use them; the absolute
    // 127.0.0.1 defaults keep working for plain local browsing.
    proxy: {
      "/api/attestor": {
        target: "http://127.0.0.1:7677",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/attestor/, ""),
      },
      "/api/prover": {
        target: "http://127.0.0.1:7679",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/prover/, ""),
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.spec.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
