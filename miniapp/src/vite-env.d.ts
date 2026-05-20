/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NETWORK?: "testnet" | "mainnet" | "sandbox";
  readonly VITE_VERIFIER_ADDRESS?: string;
  readonly VITE_ATTESTOR_URL?: string;
  readonly VITE_TONCONNECT_MANIFEST_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
