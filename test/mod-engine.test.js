import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { startServer } from "../server/index.js";
import { createZip } from "./helpers/zip.js";

function writeZip(filePath, entries) {
  fs.writeFileSync(filePath, createZip(entries));
  return filePath;
}

test("installe, ordonne, détecte un conflit, désactive et désinstalle", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-engine-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const service = await startServer({ port: 0, rootDir: root, dataRoot: path.join(root, "data") });
  t.after(() => service.close());
  const firstArchive = writeZip(path.join(root, "first.zip"), [
    { name: "livecpk/first/common/fixture.bin", data: "first" },
  ]);
  const secondArchive = writeZip(path.join(root, "second.zip"), [
    { name: "livecpk/second/common/fixture.bin", data: "second" },
  ]);
  const selfOverlapArchive = writeZip(path.join(root, "self-overlap.zip"), [
    { name: "livecpk/menu/common/self.bin", data: "menu" },
    { name: "livecpk/colors/common/self.bin", data: "colors" },
  ]);

  const first = await service.runtime.modEngine.installArchive(firstArchive, { name: "Premier mod" });
  const second = await service.runtime.modEngine.installArchive(secondArchive, { name: "Second mod" });
  const selfOverlap = await service.runtime.modEngine.installArchive(selfOverlapArchive, { name: "Deux racines du même mod" });
  assert.equal(service.runtime.modEngine.list().length, 3);
  assert.equal(service.runtime.modEngine.conflicts().total, 1);
  assert.equal(service.runtime.modEngine.conflicts().conflicts[0].winnerModId, first.id);

  service.runtime.modEngine.reorder([second.id, first.id, selfOverlap.id]);
  assert.equal(service.runtime.modEngine.conflicts().conflicts[0].winnerModId, second.id);
  service.runtime.modEngine.toggle(second.id, false);
  assert.equal(service.runtime.modEngine.conflicts().total, 0);

  const result = service.runtime.modEngine.uninstall(second.id);
  assert.equal(result.success, true);
  assert.ok(result.recoverablePaths.length > 0);
  assert.equal(service.runtime.modEngine.list().length, 2);
});

test("refuse les traversées de chemin et le code exécutable", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-archive-safety-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const service = await startServer({ port: 0, rootDir: root, dataRoot: path.join(root, "data") });
  t.after(() => service.close());
  const traversal = writeZip(path.join(root, "traversal.zip"), [
    { name: "../outside.txt", data: "unsafe" },
    { name: "livecpk/mod/common/file.bin", data: "fixture" },
  ]);
  const executable = writeZip(path.join(root, "executable.zip"), [
    { name: "livecpk/mod/common/setup.exe", data: "not-an-exe" },
  ]);
  const symlink = writeZip(path.join(root, "symlink.zip"), [
    {
      name: "livecpk/mod/common/link",
      data: "../../../../outside.txt",
      versionMadeBy: 0x0314,
      externalFileAttributes: (0o120777 << 16) >>> 0,
    },
  ]);

  await assert.rejects(() => service.runtime.modEngine.installArchive(traversal), /dangereux|invalid relative path|invalid/i);
  assert.equal(fs.existsSync(path.join(root, "outside.txt")), false);
  await assert.rejects(() => service.runtime.modEngine.installArchive(executable), /code exécutable/i);
  await assert.rejects(() => service.runtime.modEngine.installArchive(symlink), /lien ou fichier spécial/i);
  assert.equal(service.runtime.modEngine.list().length, 0);
});

test("réinstalle un paquet sans doublon et conserve son état désactivé", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-reinstall-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const service = await startServer({ port: 0, rootDir: root, dataRoot: path.join(root, "data") });
  t.after(() => service.close());
  const archive = writeZip(path.join(root, "reinstall.zip"), [
    { name: "livecpk/reinstall/common/file.bin", data: "fixture" },
  ]);

  const first = await service.runtime.modEngine.installArchive(archive, { id: "catalog-fixture", name: "Catalogue fixture" });
  service.runtime.modEngine.toggle(first.id, false);
  const second = await service.runtime.modEngine.installArchive(archive, { id: "catalog-fixture", name: "Catalogue fixture" });
  const installed = service.runtime.modEngine.list();

  assert.equal(second.id, first.id);
  assert.equal(second.packageId, "catalog-fixture");
  assert.equal(second.installCount, 2);
  assert.equal(installed.length, 1);
  assert.equal(installed[0].enabled, false);
  assert.ok(fs.existsSync(second.stagingPath));
  assert.ok(fs.readdirSync(service.runtime.dataDirectories.trash).some((name) => name.startsWith("replaced-catalog-fixture")));
});

test("installe et restaure les données content requises par un module Sider", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-sider-content-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const service = await startServer({ port: 0, rootDir: root, dataRoot: path.join(root, "data") });
  t.after(() => service.close());
  const siderRoot = path.dirname(service.runtime.store.snapshot().settings.siderPath);
  const originalPath = path.join(siderRoot, "content", "ui-colors", "map.txt");
  fs.mkdirSync(path.dirname(originalPath), { recursive: true });
  fs.writeFileSync(originalPath, "original");
  const manifest = JSON.stringify({
    name: "UI Colors fixture",
    components: [
      { type: "lua", root: "modules", entrypoints: ["UIColors.lua"] },
      { type: "sider", root: "content", target: "content" },
    ],
  });
  const archive = writeZip(path.join(root, "ui-colors.zip"), [
    { name: "stryker.mod.json", data: manifest },
    { name: "modules/UIColors.lua", data: "return {}" },
    { name: "content/ui-colors/map.txt", data: "managed" },
  ]);

  const mod = await service.runtime.modEngine.installArchive(archive);
  assert.equal(fs.readFileSync(originalPath, "utf-8"), "managed");

  service.runtime.modEngine.toggle(mod.id, false);
  assert.equal(fs.readFileSync(originalPath, "utf-8"), "original");
});

test("clone et active des profils sans dupliquer les fichiers", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-profile-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const service = await startServer({ port: 0, rootDir: root, dataRoot: path.join(root, "data") });
  t.after(() => service.close());
  const archive = writeZip(path.join(root, "profile.zip"), [
    { name: "livecpk/profile/common/file.bin", data: "fixture" },
  ]);
  const mod = await service.runtime.modEngine.installArchive(archive, { name: "Profil fixture" });
  const clone = service.runtime.modEngine.createProfile({ name: "Carrière", cloneActive: true });
  service.runtime.modEngine.toggle(mod.id, false);
  service.runtime.modEngine.activateProfile(clone.id);

  assert.equal(service.runtime.modEngine.list()[0].enabled, true);
  assert.equal(service.runtime.modEngine.profiles().filter((profile) => profile.active)[0].id, clone.id);
  assert.equal(fs.readdirSync(service.runtime.dataDirectories.mods).length, 1);
});
