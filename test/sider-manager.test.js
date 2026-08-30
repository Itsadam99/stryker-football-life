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
  const original = '[sider]\r\ncpk.root = ".\\livecpk\\manual"\r\nlua.module = "manual.lua"\r\n';
  fs.writeFileSync(siderPath, original);

  const staging = path.join(data.mods, "fixture");
  fs.mkdirSync(path.join(staging, "content", "common"), { recursive: true });
  fs.mkdirSync(path.join(staging, "lua"), { recursive: true });
  fs.writeFileSync(path.join(staging, "content", "common", "file.bin"), "content");
  fs.writeFileSync(path.join(staging, "lua", "feature.lua"), "return {}\n");
  const state = {
    settings: { siderPath },
    mods: {
      fixture: {
        id: "fixture", name: "Fixture", version: "1.0.0", stagingPath: staging,
        components: [
          { type: "livecpk", root: "content" },
          { type: "lua", root: "lua", entrypoints: ["feature.lua"] },
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
  assert.match(deployed, /lua\.module = "STRYKER\\fixture\\feature\.lua"/);
  assert.ok(fs.existsSync(path.join(path.dirname(siderPath), "modules", "STRYKER", "fixture", "feature.lua")));
  assert.ok(fs.existsSync(deployment.backupPath));

  const backupName = path.basename(deployment.backupPath);
  manager.restoreBackup(siderPath, backupName);
  assert.equal(fs.readFileSync(siderPath, "utf-8"), original);
  assert.equal(manager.parse(siderPath).mods.filter((mod) => !mod.managed).length, 2);
  assert.ok(!fs.readFileSync(siderPath, "utf-8").includes(MANAGED_END));
});
