# miniapp

Reference Telegram Mini App, built with React and deployed as a static site. Demonstrates the end-to-end flow: request a claim, attest, prove, verify on-chain, mint the soulbound credential. Uses TON Connect 2.0 for the wallet handshake and the Telegram Web App API for context.

The app expects a locally running attestor and prover; their URLs are configurable via environment variables. This is a reference integration, not a hosted service.
