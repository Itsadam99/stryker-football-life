import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { startServer } from "../server/index.js";
import { createZip } from "./helpers/zip.js";
import { createPackedPayload } from "../server/packed-payload.js";

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
  const pythonScript = writeZip(path.join(root, "python-script.zip"), [
    { name: "livecpk/mod/common/tool.pyw", data: "print('unsafe')" },
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
  await assert.rejects(() => service.runtime.modEngine.installArchive(pythonScript), /code exécutable/i);
  await assert.rejects(() => service.runtime.modEngine.installArchive(symlink), /lien ou fichier spécial/i);
  assert.equal(service.runtime.modEngine.list().length, 0);
});

test("installe un payload STRYKER à compression solide et contrôle son contenu", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-packed-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  fs.mkdirSync(path.join(source, "livecpk", "packed", "common"), { recursive: true });
  fs.writeFileSync(path.join(source, "livecpk", "packed", "common", "fixture.bin"), "packed fixture");
  const payload = path.join(root, "stryker.payload.br");
  await createPackedPayload(source, payload);
  const manifest = JSON.stringify({
    id: "packed-fixture",
    name: "Packed fixture",
    components: [{ type: "livecpk", root: "livecpk/packed" }],
  });
  const archive = writeZip(path.join(root, "packed.zip"), [
    { name: "stryker.mod.json", data: manifest },
    { name: "stryker.payload.br", data: fs.readFileSync(payload) },
  ]);
  const service = await startServer({ port: 0, rootDir: root, dataRoot: path.join(root, "data") });
  t.after(() => service.close());

  const installed = await service.runtime.modEngine.installArchive(archive);
  assert.equal(installed.packageId, "packed-fixture");
  assert.equal(fs.readFileSync(path.join(installed.stagingPath, "livecpk", "packed", "common", "fixture.bin"), "utf-8"), "packed fixture");
  assert.equal(fs.existsSync(path.join(installed.stagingPath, "stryker.payload.br")), false);
});

test("refuse le code exécutable caché dans un payload STRYKER", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-packed-unsafe-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  fs.mkdirSync(path.join(source, "livecpk", "unsafe", "common"), { recursive: true });
  fs.writeFileSync(path.join(source, "livecpk", "unsafe", "common", "setup.exe"), "unsafe");
  await assert.rejects(() => createPackedPayload(source, path.join(root, "payload.br")), /code exécutable/i);
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

test("conserve la destination Football Life déclarée par un Facepack", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-facepack-manifest-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifest = JSON.stringify({
    id: "facepack-fixture",
    name: "Facepack fixture",
    category: "face",
    components: [{ type: "livecpk", root: "livecpk/faces", target: "football-life-livecpk-root" }],
  });
  const archive = writeZip(path.join(root, "facepack.zip"), [
    { name: "stryker.mod.json", data: manifest },
    { name: "livecpk/faces/Asset/model/character/face/real/12345/#Win/face.fpk", data: "face-data" },
  ]);
  const service = await startServer({ port: 0, rootDir: root, dataRoot: path.join(root, "data") });
  t.after(() => service.close());

  const installed = await service.runtime.modEngine.installArchive(archive);
  assert.equal(installed.components[0].target, "football-life-livecpk-root");
  const destination = path.join(root, "data", "demo", "livecpk", "root", "Asset", "model", "character", "face", "real", "12345", "#Win", "face.fpk");
  assert.equal(fs.readFileSync(destination, "utf-8"), "face-data");
});

test("installe un Option File avec sauvegarde et désactivation gérées", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-option-file-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const previousUserProfile = process.env.USERPROFILE;
  const previousOneDrive = process.env.OneDrive;
  process.env.USERPROFILE = path.join(root, "profile");
  process.env.OneDrive = "";
  t.after(() => {
    if (previousUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previousUserProfile;
    if (previousOneDrive === undefined) delete process.env.OneDrive;
    else process.env.OneDrive = previousOneDrive;
  });
  const saveRoot = path.join(process.env.USERPROFILE, "Documents", "KONAMI", "eFootball PES 2021 SEASON UPDATE", "2026", "save");
  fs.mkdirSync(saveRoot, { recursive: true });
  const editPath = path.join(saveRoot, "EDIT00000000");
  fs.writeFileSync(editPath, "original-edit");
  const manifest = JSON.stringify({
    id: "option-file-fixture",
    name: "Option File fixture",
    components: [{ type: "save", root: "save", target: "football-life-save" }],
  });
  const archive = writeZip(path.join(root, "option-file.zip"), [
    { name: "stryker.mod.json", data: manifest },
    { name: "save/EDIT00000000", data: "updated-edit" },
  ]);
  const service = await startServer({ port: 0, rootDir: root, dataRoot: path.join(root, "data") });
  t.after(() => service.close());

  const mod = await service.runtime.modEngine.installArchive(archive);
  assert.equal(fs.readFileSync(editPath, "utf-8"), "updated-edit");
  service.runtime.modEngine.toggle(mod.id, false);
  assert.equal(fs.readFileSync(editPath, "utf-8"), "original-edit");
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

test("accepte le format RAR et refuse toujours les autres extensions", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-rar-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const service = await startServer({ port: 0, rootDir: root, dataRoot: path.join(root, "data") });
  t.after(() => service.close());

  // Un .7z doit encore etre rejete sur son extension, avant toute lecture.
  const unsupported = path.join(root, "mod.7z");
  fs.writeFileSync(unsupported, "peu importe");
  await assert.rejects(
    () => service.runtime.modEngine.installArchive(unsupported),
    /ZIP et RAR/,
  );

  // Un .rar franchit desormais le controle d'extension : l'erreur doit porter
  // sur le contenu illisible, pas sur le format refuse.
  const brokenRar = path.join(root, "mod.rar");
  fs.writeFileSync(brokenRar, "ceci n'est pas une archive RAR");
  await assert.rejects(
    () => service.runtime.modEngine.installArchive(brokenRar),
    (error) => {
      assert.doesNotMatch(error.message, /ZIP et RAR/);
      return true;
    },
  );
});
