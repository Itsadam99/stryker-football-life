import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { startServer } from "../server/index.js";
import { createZip } from "./helpers/zip.js";
import { trustedDownloadRequest, trustedDownloadResponse } from "../server/remote-installer.js";

function validMetadata(overrides = {}) {
  return {
    title: "Pack de test STRYKER",
    author: "Équipe de test",
    version: "1.2.3",
    shortDesc: "Un mod LiveCPK destiné à la validation du dépôt.",
    category: "gameplay",
    compatibility: ["Football Life 2026"],
    tags: ["test"],
    distributionPermission: true,
    ...overrides,
  };
}

test("soumet, contrôle, publie et installe un mod depuis un dépôt STRYKER distant", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-hub-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const hub = await startServer({ port: 0, rootDir: root, dataRoot: path.join(root, "hub-data") });
  const client = await startServer({ port: 0, rootDir: root, dataRoot: path.join(root, "client-data") });
  t.after(() => Promise.all([hub.close(), client.close()]));

  const archive = createZip([{ name: "livecpk/test/common/fixture.bin", data: "fixture" }]);
  const submission = hub.runtime.repositoryManager.createSubmission(validMetadata());
  const reviewed = await hub.runtime.repositoryManager.receiveArchive(
    submission.id,
    Readable.from(archive),
    "pack-test.zip",
    archive.length,
  );
  assert.equal(reviewed.status, "pending_review");
  assert.ok(reviewed.archiveHash.length === 64);
  const published = hub.runtime.repositoryManager.publish(submission.id);
  assert.equal(published.status, "published");

  const installed = await client.runtime.remoteInstaller.install(`http://127.0.0.1:${hub.port}`, submission.id);
  assert.equal(installed.name, validMetadata().title);
  assert.equal(client.runtime.modEngine.list().length, 1);
  assert.equal(client.runtime.modEngine.list()[0].archiveHash, reviewed.archiveHash);
});

test("refuse une proposition sans droits de distribution et une archive exécutable", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-hub-safety-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const service = await startServer({ port: 0, rootDir: root, dataRoot: path.join(root, "data") });
  t.after(() => service.close());

  assert.throws(() => service.runtime.repositoryManager.createSubmission(validMetadata({ distributionPermission: false })), /droit de distribuer/i);
  const submission = service.runtime.repositoryManager.createSubmission(validMetadata({ title: "Archive interdite" }));
  const archive = createZip([{ name: "livecpk/test/common/setup.exe", data: "unsafe" }]);
  await assert.rejects(() => service.runtime.repositoryManager.receiveArchive(
    submission.id,
    Readable.from(archive),
    "unsafe.zip",
    archive.length,
  ), /code exécutable/i);
});

test("utilise le sélecteur Electron injecté quand il est disponible", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-native-dialog-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const selectedPath = path.join(root, "Football Life");
  const service = await startServer({
    port: 0,
    rootDir: root,
    dataRoot: path.join(root, "data"),
    nativeDialogs: {
      pickGameFolder: async () => selectedPath,
      pickArchive: async () => null,
    },
  });
  t.after(() => service.close());
  const base = `http://127.0.0.1:${service.port}`;
  const token = (await (await fetch(`${base}/api/session`)).json()).token;

  const gameResponse = await fetch(`${base}/api/game/browse`, { method: "POST", headers: { "X-STRYKER-Token": token } });
  assert.equal(gameResponse.status, 200);
  assert.equal((await gameResponse.json()).path, selectedPath);
  const archiveResponse = await fetch(`${base}/api/mods/browse-archive`, { method: "POST", headers: { "X-STRYKER-Token": token } });
  assert.equal((await archiveResponse.json()).cancelled, true);
});

test("limite les téléchargements distants au dépôt ou aux assets Release STRYKER", () => {
  const repository = new URL("https://raw.githubusercontent.com/Itsadam99/stryker-football-life/main/public/repository/");
  const release = new URL("https://github.com/Itsadam99/stryker-football-life/releases/download/mods-2026.09/mod.zip");
  assert.equal(trustedDownloadRequest(new URL("api/catalog/mod/download", repository), repository), true);
  assert.equal(trustedDownloadRequest(release, repository), true);
  assert.equal(trustedDownloadRequest(new URL("https://example.com/mod.zip"), repository), false);
  assert.equal(trustedDownloadResponse(new URL("https://release-assets.githubusercontent.com/object"), release, repository), true);
  assert.equal(trustedDownloadResponse(new URL("https://evil.example/object"), release, repository), false);
});
