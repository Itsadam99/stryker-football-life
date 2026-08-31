import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { startServer } from "../server/index.js";
import { createZip } from "./helpers/zip.js";

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

  const droppedZip = createZip([{ name: "livecpk/drop-test/common/fixture.bin", data: "drop" }]);
  const installedDrop = await fetch(`${base}/api/mods/install-upload`, {
    method: "PUT",
    headers: {
      Origin: base,
      "Content-Type": "application/zip",
      "X-STRYKER-Token": token,
      "X-STRYKER-File-Name": encodeURIComponent("Drop Test.zip"),
    },
    body: droppedZip,
  });
  assert.equal(installedDrop.status, 201);
  const installedPayload = await installedDrop.json();
  assert.equal(installedPayload.mod.name, "Drop-Test");
  assert.equal(installedPayload.mod.sourceType, "drag-drop");
  assert.equal(service.runtime.modEngine.list().length, 1);

  const rejectedDrop = await fetch(`${base}/api/mods/install-upload`, {
    method: "PUT",
    headers: {
      Origin: base,
      "Content-Type": "application/octet-stream",
      "X-STRYKER-Token": token,
      "X-STRYKER-File-Name": encodeURIComponent("unsafe.rar"),
    },
    body: Buffer.from("not-a-zip"),
  });
  assert.equal(rejectedDrop.status, 400);

  const users = await fetch(`${base}/api/users`, { headers: { Origin: base } });
  assert.equal(users.status, 404);
});

test("le mode Hub public sépare les propositions publiques des droits de modération", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-public-hub-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const adminToken = "a".repeat(48);
  const service = await startServer({
    port: 0,
    rootDir: root,
    dataRoot: path.join(root, "data"),
    publicHub: true,
    adminToken,
  });
  t.after(() => service.close());
  const base = `http://127.0.0.1:${service.port}`;
  const { token } = await (await fetch(`${base}/api/session`)).json();
  const metadata = {
    title: "Soumission publique",
    author: "Auteur",
    version: "1.0.0",
    shortDesc: "Soumission placée dans la file privée.",
    distributionPermission: true,
  };

  const created = await fetch(`${base}/api/hub/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-STRYKER-Token": token },
    body: JSON.stringify(metadata),
  });
  assert.equal(created.status, 201);
  const submissionId = (await created.json()).submission.id;

  const sessionCannotModerate = await fetch(`${base}/api/hub/submissions/${submissionId}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-STRYKER-Token": token },
    body: JSON.stringify({ note: "Refus non autorisé" }),
  });
  assert.equal(sessionCannotModerate.status, 403);

  const adminCanModerate = await fetch(`${base}/api/hub/submissions/${submissionId}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-STRYKER-Admin-Token": adminToken },
    body: JSON.stringify({ note: "Refus de contrôle" }),
  });
  assert.equal(adminCanModerate.status, 200);
});
