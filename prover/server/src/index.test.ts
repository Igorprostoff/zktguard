import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { makeServer } from "./index.ts";

async function startEphemeral() {
  const srv = makeServer();
  await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const port = (srv.address() as { port: number }).port;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => srv.close(() => r())),
  };
}

describe("zktguard-prover-server", () => {
  it("answers /health with status ok", async () => {
    const { base, close } = await startEphemeral();
    try {
      const resp = await fetch(`${base}/health`);
      assert.equal(resp.status, 200);
      const body = (await resp.json()) as { status: string };
      assert.equal(body.status, "ok");
    } finally {
      await close();
    }
  });

  it("returns 404 on unknown paths", async () => {
    const { base, close } = await startEphemeral();
    try {
      const resp = await fetch(`${base}/nope`);
      assert.equal(resp.status, 404);
    } finally {
      await close();
    }
  });

  it("returns 405 on GET /prove", async () => {
    const { base, close } = await startEphemeral();
    try {
      const resp = await fetch(`${base}/prove`);
      assert.equal(resp.status, 405);
    } finally {
      await close();
    }
  });

  it("rejects POST /prove without witness with 400", async () => {
    const { base, close } = await startEphemeral();
    try {
      const resp = await fetch(`${base}/prove`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      assert.equal(resp.status, 400);
    } finally {
      await close();
    }
  });
});
