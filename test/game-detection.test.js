import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { detectAtPath } from "../server/game-detection.js";

function fixture() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "stryker-detection-"));
}

test("détecte Football Life et Sider sans créer de faux fichiers", (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "FL_2026 start.exe"), "fixture");
  fs.mkdirSync(path.join(root, "SiderAddons"));
  fs.writeFileSync(path.join(root, "SiderAddons", "sider.ini"), "[sider]\n");
  fs.writeFileSync(path.join(root, "SiderAddons", "sider.exe"), "fixture");

  const result = detectAtPath(root);
  assert.equal(result.detectedVersion, "SP Football Life 2026");
  assert.equal(path.basename(result.gameExecutablePath), "FL_2026 start.exe");
  assert.equal(path.basename(result.siderPath), "sider.ini");
});

test("refuse une installation sans sider.ini et ne la modifie pas", (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "PES2021.exe"), "fixture");

  assert.throws(() => detectAtPath(root), /sider\.ini valide/i);
  assert.deepEqual(fs.readdirSync(root), ["PES2021.exe"]);
});
