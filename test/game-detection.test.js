import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { detectAtPath } from "../server/game-detection.js";
import { resolveLaunchExecutable } from "../server/process-manager.js";
import { startServer } from "../server/index.js";

function fixture() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "stryker-detection-"));
}

test("détecte Football Life et Sider sans créer de faux fichiers", (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "FL 2026 start.exe"), "fixture");
  fs.writeFileSync(path.join(root, "FL_2026.exe"), "fixture");
  fs.writeFileSync(path.join(root, "sider.ini"), "[sider]\n; legacy fixture\n");
  fs.writeFileSync(path.join(root, "sider.exe"), "legacy fixture");
  fs.mkdirSync(path.join(root, "SiderAddons"));
  fs.writeFileSync(path.join(root, "SiderAddons", "sider.ini"), "[sider]\n");
  fs.writeFileSync(path.join(root, "SiderAddons", "sider.exe"), "fixture");

  const result = detectAtPath(root);
  assert.equal(result.detectedVersion, "SP Football Life 2026");
  assert.equal(path.basename(result.gameExecutablePath), "FL 2026 start.exe");
  assert.equal(result.siderPath, path.join(root, "SiderAddons", "sider.ini"));
  assert.equal(result.siderExecutablePath, path.join(root, "SiderAddons", "sider.exe"));
  assert.deepEqual(resolveLaunchExecutable({ ...result, launchMode: "sider" }), {
    executable: path.join(root, "FL 2026 start.exe"),
    launchType: "football-life",
  });
});

test("refuse une installation sans sider.ini et ne la modifie pas", (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "PES2021.exe"), "fixture");

  assert.throws(() => detectAtPath(root), /sider\.ini valide/i);
  assert.deepEqual(fs.readdirSync(root), ["PES2021.exe"]);
});

test("migre une ancienne liaison racine vers SiderAddons et redéploie les mods", async (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const gameRoot = path.join(root, "game");
  const siderRoot = path.join(gameRoot, "SiderAddons");
  fs.mkdirSync(siderRoot, { recursive: true });
  fs.writeFileSync(path.join(gameRoot, "FL 2026 start.exe"), "fixture");
  fs.writeFileSync(path.join(gameRoot, "sider.ini"), "[sider]\ncpk.root = \".\\livecpk\\legacy\"\n");
  fs.writeFileSync(path.join(gameRoot, "sider.exe"), "legacy");
  fs.writeFileSync(path.join(siderRoot, "sider.ini"), "[sider]\ncpk.root = \".\\livecpk\\root\"\n");
  fs.writeFileSync(path.join(siderRoot, "sider.exe"), "fixture");

  const dataRoot = path.join(root, "data");
  const first = await startServer({ port: 0, rootDir: root, dataRoot });
  const stagingPath = path.join(first.runtime.dataDirectories.mods, "fixture-mod");
  fs.mkdirSync(path.join(stagingPath, "livecpk", "fixture", "common"), { recursive: true });
  fs.writeFileSync(path.join(stagingPath, "livecpk", "fixture", "common", "file.bin"), "fixture");
  first.runtime.store.update((draft) => {
    Object.assign(draft.settings, {
      gamePath: gameRoot,
      gameExecutablePath: path.join(gameRoot, "FL 2026 start.exe"),
      siderPath: path.join(gameRoot, "sider.ini"),
      siderExecutablePath: path.join(gameRoot, "sider.exe"),
      detectedVersion: "SP Football Life 2026",
      isLinked: true,
    });
    draft.mods["fixture-mod"] = {
      id: "fixture-mod", name: "Fixture", version: "1.0.0", stagingPath,
      components: [{ type: "livecpk", root: "livecpk/fixture", files: ["common/file.bin"] }],
    };
    draft.profiles[0].modOrder = ["fixture-mod"];
    draft.profiles[0].enabledMods = ["fixture-mod"];
  });
  await first.close();

  const migrated = await startServer({ port: 0, rootDir: root, dataRoot });
  t.after(() => migrated.close());
  const settings = migrated.runtime.store.snapshot().settings;
  const deployed = fs.readFileSync(path.join(siderRoot, "sider.ini"), "utf-8");
  assert.equal(settings.siderPath, path.join(siderRoot, "sider.ini"));
  assert.equal(settings.siderExecutablePath, path.join(siderRoot, "sider.exe"));
  assert.match(deployed, /STRYKER MANAGED MODS/);
  assert.ok(deployed.indexOf("STRYKER MANAGED MODS") < deployed.indexOf('cpk.root = ".\\livecpk\\root"'));
});

test("migre automatiquement les Facepacks déjà installés vers la racine LiveCPK du jeu", async (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const gameRoot = path.join(root, "game");
  const siderRoot = path.join(gameRoot, "SiderAddons");
  fs.mkdirSync(path.join(siderRoot, "livecpk", "root"), { recursive: true });
  fs.writeFileSync(path.join(gameRoot, "FL 2026 start.exe"), "fixture");
  fs.writeFileSync(path.join(siderRoot, "sider.ini"), '[sider]\ncpk.root = ".\\livecpk\\root"\n');
  fs.writeFileSync(path.join(siderRoot, "sider.exe"), "fixture");

  const dataRoot = path.join(root, "data");
  const first = await startServer({ port: 0, rootDir: root, dataRoot });
  const stagingPath = path.join(first.runtime.dataDirectories.mods, "legacy-facepack");
  const relativeFace = "Asset/model/character/face/real/12345/#Win/face.fpk";
  const source = path.join(stagingPath, "livecpk", "faces", ...relativeFace.split("/"));
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, "legacy-face");
  first.runtime.store.update((draft) => {
    Object.assign(draft.settings, {
      gamePath: gameRoot,
      gameExecutablePath: path.join(gameRoot, "FL 2026 start.exe"),
      siderPath: path.join(siderRoot, "sider.ini"),
      siderExecutablePath: path.join(siderRoot, "sider.exe"),
      detectedVersion: "SP Football Life 2026",
      isLinked: true,
    });
    draft.mods["legacy-facepack"] = {
      id: "legacy-facepack", name: "Legacy Facepack", version: "1.0.0", category: "face", stagingPath,
      components: [{ type: "livecpk", root: "livecpk/faces", files: [relativeFace.toLowerCase()] }],
    };
    draft.profiles[0].modOrder = ["legacy-facepack"];
    draft.profiles[0].enabledMods = ["legacy-facepack"];
  });
  await first.close();

  const migrated = await startServer({ port: 0, rootDir: root, dataRoot });
  t.after(() => migrated.close());
  const state = migrated.runtime.store.snapshot();
  const destination = path.join(siderRoot, "livecpk", "root", ...relativeFace.split("/"));
  assert.equal(state.mods["legacy-facepack"].components[0].target, "football-life-livecpk-root");
  assert.equal(fs.readFileSync(destination, "utf-8"), "legacy-face");
  assert.match(state.activity[0].message, /Facepacks déplacés/i);
});
