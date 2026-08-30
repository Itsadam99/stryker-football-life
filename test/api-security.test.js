import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { startServer } from "../server/index.js";

test("l’API locale bloque les origines distantes et protège les mutations", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-api-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const service = await startServer({ port: 0, rootDir: root, dataRoot: path.join(root, "data") });
  t.after(() => service.close());
  const base = `http://127.0.0.1:${service.port}`;

  const blockedOrigin = await fetch(`${base}/api/session`, { headers: { Origin: "https://attacker.invalid" } });
  assert.equal(blockedOrigin.status, 403);

  const sessionResponse = await fetch(`${base}/api/session`, { headers: { Origin: base } });
  assert.equal(sessionResponse.status, 200);
  const { token } = await sessionResponse.json();
  assert.equal(typeof token, "string");
  assert.ok(token.length >= 32);

  const missingToken = await fetch(`${base}/api/config`, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ launchMode: "game" }),
  });
  assert.equal(missingToken.status, 403);

  const malformedToken = await fetch(`${base}/api/config`, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json", "X-STRYKER-Token": "é".repeat(token.length) },
    body: JSON.stringify({ launchMode: "game" }),
  });
  assert.equal(malformedToken.status, 403);

  const allowed = await fetch(`${base}/api/config`, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json", "X-STRYKER-Token": token },
    body: JSON.stringify({ launchMode: "game", autoStartSider: false }),
  });
  assert.equal(allowed.status, 200);
  const saved = await allowed.json();
  assert.equal(saved.config.autoStartSider, false);

  const users = await fetch(`${base}/api/users`, { headers: { Origin: base } });
  assert.equal(users.status, 404);
});
