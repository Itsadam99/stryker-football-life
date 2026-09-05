import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ensureDataDirectories } from "../server/paths.js";
import { MANAGED_END, MANAGED_START, SiderManager } from "../server/sider-manager.js";

test("déploie un bloc géré, préserve le manuel et restaure une sauvegarde", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-sider-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const data = ensureDataDirectories(path.join(root, "data"));
  const siderPath = path.join(root, "game", "SiderAddons", "sider.ini");
  fs.mkdirSync(path.dirname(siderPath), { recursive: true });
  const original = '[sider]\r\noverlay.vkey.toggle = 0x20\r\ncpk.root = ".\\livecpk\\manual"\r\nlua.module = "manual.lua"\r\n';
  fs.writeFileSync(siderPath, original);

  const staging = path.join(data.mods, "fixture");
  fs.mkdirSync(path.join(staging, "content", "common"), { recursive: true });
  fs.mkdirSync(path.join(staging, "lua"), { recursive: true });
  fs.mkdirSync(path.join(staging, "sider-content", "ui-colors"), { recursive: true });
  fs.mkdirSync(path.join(path.dirname(siderPath), "content", "ui-colors"), { recursive: true });
  fs.writeFileSync(path.join(staging, "content", "common", "file.bin"), "content");
  fs.writeFileSync(path.join(staging, "lua", "feature.lua"), "return {}\n");
  fs.writeFileSync(path.join(staging, "sider-content", "ui-colors", "map.txt"), "managed");
  fs.writeFileSync(path.join(path.dirname(siderPath), "content", "ui-colors", "map.txt"), "original");
  const state = {
    settings: { siderPath },
    mods: {
      fixture: {
        id: "fixture", name: "Fixture", version: "1.0.0", stagingPath: staging,
        siderOverlay: { toggleVkey: "0x79", primary: true },
        components: [
          { type: "livecpk", root: "content" },
          { type: "lua", root: "lua", entrypoints: ["feature.lua"] },
          { type: "sider", root: "sider-content", target: "content" },
        ],
      },
    },
  };
  const profile = { id: "default", name: "Test", modOrder: ["fixture"], enabledMods: ["fixture"] };
  const manager = new SiderManager({ dataDirectories: data });
  const deployment = manager.deploy(state, profile);
  const deployed = fs.readFileSync(siderPath, "utf-8");

  assert.match(deployed, /cpk\.root = "\.\\livecpk\\manual"/);
  assert.match(deployed, new RegExp(MANAGED_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(deployed.indexOf(MANAGED_START) < deployed.indexOf('cpk.root = ".\\livecpk\\manual"'));
  assert.match(deployed, /overlay\.vkey\.toggle = 0x79/);
  assert.match(deployed, /lua\.module = "STRYKER\\fixture\\feature\.lua"/);
  assert.ok(deployed.indexOf('lua.module = "STRYKER\\fixture\\feature.lua"') < deployed.indexOf('lua.module = "manual.lua"'));
  assert.ok(fs.existsSync(path.join(path.dirname(siderPath), "modules", "STRYKER", "fixture", "feature.lua")));
  assert.equal(fs.readFileSync(path.join(path.dirname(siderPath), "content", "ui-colors", "map.txt"), "utf-8"), "managed");
  assert.ok(fs.existsSync(deployment.backupPath));

  manager.deploy(state, { ...profile, enabledMods: [] });
  assert.equal(fs.readFileSync(path.join(path.dirname(siderPath), "content", "ui-colors", "map.txt"), "utf-8"), "original");
  assert.match(fs.readFileSync(siderPath, "utf-8"), /overlay\.vkey\.toggle = 0x20/);

  const backupName = path.basename(deployment.backupPath);
  manager.restoreBackup(siderPath, backupName);
  assert.equal(fs.readFileSync(siderPath, "utf-8"), original);
  assert.equal(manager.parse(siderPath).mods.filter((mod) => !mod.managed).length, 2);
  assert.ok(!fs.readFileSync(siderPath, "utf-8").includes(MANAGED_END));
});

test("installe les Facepacks dans la racine LiveCPK de Football Life et les restaure à la désactivation", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-facepack-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const data = ensureDataDirectories(path.join(root, "data"));
  const siderRoot = path.join(root, "game", "SiderAddons");
  const siderPath = path.join(siderRoot, "sider.ini");
  const relativeFace = path.join("Asset", "model", "character", "face", "real", "12345", "#Win", "face.fpk");
  const destination = path.join(siderRoot, "livecpk", "root", relativeFace);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(siderPath, '[sider]\ncpk.root = ".\\livecpk\\root"\n');
  fs.writeFileSync(destination, "original-face");

  const staging = path.join(data.mods, "facepack");
  const source = path.join(staging, "livecpk", "faces", relativeFace);
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, "stryker-face");
  const state = {
    settings: { siderPath },
    mods: {
      facepack: {
        id: "facepack", name: "Facepack", version: "1.0.0", stagingPath: staging,
        components: [{
          type: "livecpk",
          root: "livecpk/faces",
          target: "football-life-livecpk-root",
          files: [relativeFace.replace(/\\/g, "/").toLowerCase()],
        }],
      },
    },
  };
  const profile = { id: "default", name: "Test", modOrder: ["facepack"], enabledMods: ["facepack"] };
  const manager = new SiderManager({ dataDirectories: data });

  manager.deploy(state, profile);
  assert.equal(fs.readFileSync(destination, "utf-8"), "stryker-face");
  const deployedIni = fs.readFileSync(siderPath, "utf-8");
  assert.doesNotMatch(deployedIni, /AppData.*Facepack/i);
  assert.equal((deployedIni.match(/cpk\.root/g) || []).length, 1);

  manager.deploy(state, { ...profile, enabledMods: [] });
  assert.equal(fs.readFileSync(destination, "utf-8"), "original-face");
});

test("installe, préserve puis restaure un Option File Football Life", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-save-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const data = ensureDataDirectories(path.join(root, "data"));
  const siderPath = path.join(root, "game", "SiderAddons", "sider.ini");
  fs.mkdirSync(path.dirname(siderPath), { recursive: true });
  fs.writeFileSync(siderPath, "[sider]\n");
  const documents = path.join(root, "Documents");
  const saveRoot = path.join(documents, "KONAMI", "eFootball PES 2021 SEASON UPDATE", "2026", "save");
  fs.mkdirSync(saveRoot, { recursive: true });
  const editPath = path.join(saveRoot, "EDIT00000000");
  fs.writeFileSync(editPath, "original");
  const staging = path.join(data.mods, "transfers");
  fs.mkdirSync(path.join(staging, "save"), { recursive: true });
  fs.writeFileSync(path.join(staging, "save", "EDIT00000000"), "transfers-v7");
  const state = {
    settings: { siderPath, detectedVersion: "SP Football Life 2026" },
    mods: {
      transfers: {
        id: "transfers", name: "Transfers", stagingPath: staging,
        components: [{ type: "save", root: "save", target: "football-life-save" }],
      },
    },
  };
  const profile = { id: "default", name: "Test", modOrder: ["transfers"], enabledMods: ["transfers"] };
  const manager = new SiderManager({ dataDirectories: data, documentsRoots: [documents] });

  manager.deploy(state, profile);
  assert.equal(fs.readFileSync(editPath, "utf-8"), "transfers-v7");
  fs.writeFileSync(editPath, "player-customized");
  manager.deploy(state, profile);
  assert.equal(fs.readFileSync(editPath, "utf-8"), "player-customized");
  manager.deploy(state, { ...profile, enabledMods: [] });
  assert.equal(fs.readFileSync(editPath, "utf-8"), "original");
  assert.ok(fs.readdirSync(path.join(data.backups, "football-life-saves", "history")).length > 0);
});

test("fusionne les maps Kitserver de plusieurs Kitpacks selon la priorité", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-kitmaps-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const data = ensureDataDirectories(path.join(root, "data"));
  const siderPath = path.join(root, "game", "SiderAddons", "sider.ini");
  fs.mkdirSync(path.dirname(siderPath), { recursive: true });
  fs.writeFileSync(siderPath, "[sider]\n");
  const first = path.join(data.mods, "first", "content", "kits");
  const second = path.join(data.mods, "second", "content", "kits");
  fs.mkdirSync(first, { recursive: true });
  fs.mkdirSync(second, { recursive: true });
  fs.writeFileSync(path.join(first, "map.txt"), '101, "First League\\Alpha"\n102, "First League\\Beta"\n');
  fs.writeFileSync(path.join(second, "map.txt"), '101, "Second League\\Duplicate"\n201, "Second League\\Gamma"\n');
  const destinationMap = path.join(path.dirname(siderPath), "content", "kits", "map.txt");
  fs.mkdirSync(path.dirname(destinationMap), { recursive: true });
  const originalMap = '101, "Original Alpha"\n999, "Original Team"\n';
  fs.writeFileSync(destinationMap, originalMap);
  const state = {
    settings: { siderPath },
    mods: {
      first: { id: "first", name: "First", stagingPath: path.join(data.mods, "first"), components: [{ type: "sider", root: "content", target: "content" }] },
      second: { id: "second", name: "Second", stagingPath: path.join(data.mods, "second"), components: [{ type: "sider", root: "content", target: "content" }] },
    },
  };
  const manager = new SiderManager({ dataDirectories: data });
  manager.deploy(state, { id: "default", name: "Test", modOrder: ["first", "second"], enabledMods: ["first", "second"] });
  const merged = fs.readFileSync(path.join(path.dirname(siderPath), "content", "kits", "map.txt"), "utf-8");
  assert.match(merged, /101, "First League\\Alpha"/);
  assert.doesNotMatch(merged, /Second League\\Duplicate/);
  assert.match(merged, /201, "Second League\\Gamma"/);
  assert.match(merged, /999, "Original Team"/);
  assert.doesNotMatch(merged, /Original Alpha/);
  manager.deploy(state, { id: "default", name: "Test", modOrder: ["first", "second"], enabledMods: ["second"] });
  const remaining = fs.readFileSync(destinationMap, "utf8");
  assert.match(remaining, /Second League\\Duplicate/);
  assert.doesNotMatch(remaining, /First League/);
  assert.match(remaining, /Original Team/);
  manager.deploy(state, { id: "default", name: "Test", modOrder: ["first", "second"], enabledMods: [] });
  assert.equal(fs.readFileSync(destinationMap, "utf8"), originalMap);
});
