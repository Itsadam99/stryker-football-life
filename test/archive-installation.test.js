import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { startServer } from "../server/index.js";
import { createZip } from "./helpers/zip.js";
import { createRar } from "./helpers/rar.js";

async function sandbox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-import-test-"));
  const service = await startServer({ port: 0, rootDir: root, dataRoot: path.join(root, "data") });
  service.runtime.siderManager.documentsRoots = [path.join(root, "Documents")];
  t.after(async () => { await service.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, service, engine: service.runtime.modEngine };
}

for (const [format, create] of [["zip", createZip], ["rar", createRar]]) {
  test(format + " réel : import par fichier et glisser-déposer, sans manifeste, puis désinstallation", async (t) => {
    const { root, service, engine } = await sandbox(t);
    const content = create([{ name: "Pack/LiveCPK/Grass/common/pitch.bin", data: "grass" }]);
    const archive = path.join(root, "grass." + format);
    fs.writeFileSync(archive, content);
    const first = await engine.installArchive(archive);
    assert.equal(fs.readFileSync(path.join(first.stagingPath, first.components[0].root, "common/pitch.bin"), "utf8"), "grass");
    engine.uninstall(first.id);
    const base = "http://127.0.0.1:" + service.port;
    const { token } = await (await fetch(base + "/api/session")).json();
    const response = await fetch(base + "/api/mods/install-upload", {
      method: "PUT", headers: { "X-STRYKER-Token": token, "X-STRYKER-File-Name": "grass." + format, "Content-Type": "application/octet-stream" }, body: content,
    });
    const result = await response.json();
    assert.equal(response.status, 201, JSON.stringify(result));
    assert.equal(result.mod.name, "grass");
    assert.equal(result.mod.components.length, 1);
    engine.toggle(result.mod.id, false);
    engine.uninstall(result.mod.id);
    assert.equal(engine.list().length, 0);
  });
}

test("RAR distant : fiche, téléchargement, empreinte et extraction réels", async (t) => {
  const { engine, service } = await sandbox(t);
  const archive = createRar([{ name: "Asset/model/character/face/real/123/face.fpk", data: "face" }]);
  const hash = crypto.createHash("sha256").update(archive).digest("hex");
  let status = "published";
  const hub = createServer((req, res) => {
    if (req.url === "/face.rar") { res.end(archive); return; }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ mod: { id: "face", title: "Face RAR", status, archiveHash: hash, downloadUrl: "/face.rar" } }));
  });
  await new Promise((resolve) => hub.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => hub.close(resolve)));
  const base = "http://127.0.0.1:" + hub.address().port;
  const installed = await service.runtime.remoteInstaller.install(base, "face");
  assert.equal(installed.archiveHash, hash);
  assert.equal(installed.components[0].target, "football-life-livecpk-root");
  assert.equal(engine.list().length, 1);
  status = "pending_review";
  await assert.rejects(() => service.runtime.remoteInstaller.install(base, "face"), /pas disponible/);
});

test("RAR : refuse chemins sortants, noms dupliqués et exécutables", async (t) => {
  const { root, engine } = await sandbox(t);
  for (const entries of [
    [{ name: "../outside.bin", data: "bad" }],
    [{ name: "common/file.bin", data: "a" }, { name: "common/file.bin", data: "b" }],
    [{ name: "common/setup.exe", data: "bad" }],
  ]) {
    const archive = path.join(root, "bad.rar");
    fs.writeFileSync(archive, createRar(entries));
    await assert.rejects(() => engine.installArchive(archive), /dangereux|dupliqué|exécutable/);
    assert.equal(engine.list().length, 0);
  }
  assert.equal(fs.existsSync(path.join(root, "outside.bin")), false);
});

test("archive communautaire : modules, auxiliaires, content et LiveCPK reconnus ensemble", async (t) => {
  const { root, engine, service } = await sandbox(t);
  const archive = path.join(root, "community.zip");
  fs.writeFileSync(archive, createZip([
    { name: "Community/SiderAddons/modules/a.lua", data: "local m = {}\nfunction m.init(ctx) end\nreturn m" },
    { name: "Community/SiderAddons/modules/b.lua", data: "local m = {}\nlocal function init(ctx) end\nm.init = init\nreturn m" },
    { name: "Community/SiderAddons/modules/lib/helper.lua", data: "return { helper = true }" },
    { name: "Community/SiderAddons/content/grass/common/pitch.bin", data: "server resource" },
    { name: "Community/SiderAddons/livecpk/Grass/common/global.bin", data: "global resource" },
  ]));
  const mod = await engine.installArchive(archive);
  assert.deepEqual(mod.components.map((c) => c.type).sort(), ["livecpk", "lua", "sider"]);
  assert.deepEqual(mod.components.find((c) => c.type === "lua").entrypoints.sort(), ["a.lua", "b.lua"]);
  const siderRoot = path.dirname(service.runtime.store.snapshot().settings.siderPath);
  assert.equal(fs.readFileSync(path.join(siderRoot, "content/grass/common/pitch.bin"), "utf8"), "server resource");
  assert.ok(fs.existsSync(path.join(siderRoot, "modules/STRYKER", mod.id, "lib/helper.lua")));
  engine.toggle(mod.id, false);
  assert.equal(fs.existsSync(path.join(siderRoot, "content/grass/common/pitch.bin")), false);
  engine.toggle(mod.id, true);
  engine.uninstall(mod.id);
  assert.equal(fs.existsSync(path.join(siderRoot, "content/grass/common/pitch.bin")), false);
});

test("Option File sans manifeste : destination isolée, sauvegarde et restauration", async (t) => {
  const { root, engine, service } = await sandbox(t);
  service.runtime.store.update((state) => { state.settings.isLinked = true; state.settings.detectedVersion = "SP Football Life 2026"; });
  const save = path.join(root, "Documents/KONAMI/eFootball PES 2021 SEASON UPDATE/2026/save");
  fs.mkdirSync(save, { recursive: true }); fs.writeFileSync(path.join(save, "EDIT00000000"), "original");
  const archive = path.join(root, "transfers.zip");
  fs.writeFileSync(archive, createZip([{ name: "New season/save/EDIT00000000", data: "transfers" }]));
  const mod = await engine.installArchive(archive);
  assert.equal(fs.readFileSync(path.join(save, "EDIT00000000"), "utf8"), "transfers");
  engine.uninstall(mod.id);
  assert.equal(fs.readFileSync(path.join(save, "EDIT00000000"), "utf8"), "original");
});

test("dépendances par identifiant de paquet et conflits dans content", async (t) => {
  const { root, engine } = await sandbox(t);
  const make = (id, dependencies = []) => {
    const archive = path.join(root, id + ".zip");
    fs.writeFileSync(archive, createZip([
      { name: "stryker.mod.json", data: JSON.stringify({ id, dependencies, components: [{ type: "sider", root: "content", target: "content" }] }) },
      { name: "content/pyro/settings.ini", data: id },
    ]));
    return archive;
  };
  const base = await engine.installArchive(make("pyro"));
  const patch = await engine.installArchive(make("patch", [{ id: "pyro" }]));
  assert.deepEqual(engine.dependencyIssues(), []);
  assert.equal(engine.conflicts().conflicts[0].file, "content/pyro/settings.ini");
  assert.equal(engine.conflicts().conflicts[0].winnerModId, patch.id);
  engine.toggle(base.id, false);
  assert.equal(engine.dependencyIssues()[0].reason, "disabled");
  engine.uninstall(base.id);
  assert.equal(engine.dependencyIssues()[0].reason, "missing");
  engine.uninstall(patch.id);
});

test("manifeste explicite invalide ou vide : aucune installation partielle", async (t) => {
  const { root, engine } = await sandbox(t);
  for (const manifest of ["{bad", JSON.stringify({ components: [] })]) {
    const archive = path.join(root, "broken.zip");
    fs.writeFileSync(archive, createZip([{ name: "stryker.mod.json", data: manifest }, { name: "common/test.bin", data: "a" }]));
    await assert.rejects(() => engine.installArchive(archive), /[Mm]anifeste/);
    assert.equal(engine.list().length, 0);
  }
});

test("mise à jour : réadapte les modules déjà installés une seule fois", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-module-migration-"));
  let service = await startServer({ port: 0, rootDir: root, dataRoot: path.join(root, "data") });
  t.after(async () => { await service.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const archive = path.join(root, "module.zip");
  const source = 'local m={}\nfunction m.init(ctx) local p=ctx.sider_dir .. "\\\\modules\\\\settings.ini" end\nreturn m';
  fs.writeFileSync(archive, createZip([
    { name: "modules/mod.lua", data: source },
    { name: "modules/settings.ini", data: "setting=1" },
  ]));
  const mod = await service.runtime.modEngine.installArchive(archive);
  const deployed = path.join(path.dirname(service.runtime.store.snapshot().settings.siderPath), "modules/STRYKER", mod.id, "mod.lua");
  fs.writeFileSync(deployed, source);
  service.runtime.store.update((state) => { state.settings.isLinked = true; delete state.deployment.engineRevision; });
  await service.close();
  service = await startServer({ port: 0, rootDir: root, dataRoot: path.join(root, "data") });
  assert.ok(fs.readFileSync(deployed, "utf8").includes("STRYKER"));
  assert.equal(service.runtime.store.snapshot().deployment.engineRevision, 2);
  const timestamp = fs.statSync(deployed).mtimeMs;
  await service.close();
  service = await startServer({ port: 0, rootDir: root, dataRoot: path.join(root, "data") });
  assert.equal(fs.statSync(deployed).mtimeMs, timestamp);
});

test("ajouter un mod existant à un autre profil l’active sans dupliquer le paquet", async (t) => {
  const { root, engine } = await sandbox(t);
  const archive = path.join(root, "shared.zip");
  fs.writeFileSync(archive, createZip([{ name: "common/shared.bin", data: "shared" }]));
  const first = await engine.installArchive(archive);
  const profile = engine.createProfile({ name: "Second", cloneActive: false });
  engine.activateProfile(profile.id);
  const second = await engine.installArchive(archive);
  assert.equal(second.id, first.id);
  assert.equal(engine.list()[0].enabled, true);
  assert.equal(fs.readdirSync(path.dirname(first.stagingPath)).length, 1);
});
