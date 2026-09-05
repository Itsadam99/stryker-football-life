import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { adaptLuaPaths } from "../server/lua-paths.js";

async function loadTs(file) {
  const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}
const { installableCatalog, installedCatalogMod, searchCatalog, catalogInstallPlan } = await loadTs("../src/services/installableCatalog.ts");
const { DESKTOP_COMMUNITY_MODS } = await loadTs("../src/services/communityCatalogData.ts");

test("Découvrir : uniquement installable, sans doublons, archive locale prioritaire", () => {
  const remote = { id: "a", title: "remote", status: "published", installationType: "automatic", archiveHash: "abc", repositoryUrl: "https://example.com" };
  const local = { ...remote, title: "local", repositoryUrl: undefined };
  const mods = installableCatalog([local], [remote, { ...remote, id: "pending", status: "pending_review" }, { ...remote, id: "source", installationType: "manual" }]);
  assert.deepEqual(mods, [local]);
  assert.equal(installedCatalogMod(local, [{ id: "a-other-hash", packageId: "a-other", archiveHash: "def" }]), undefined);
  assert.ok(installedCatalogMod(local, [{ id: "internal", packageId: "a" }]));
  assert.equal(installedCatalogMod({ id: "none" }, [{ id: "other" }]), undefined);
});

test("recherche par mots, accents, auteur et maillots", () => {
  const items = [{ id: "a", title: "Célébration torse nu", author: "Alston", shortDesc: "", category: "other", tags: ["R3"] }];
  assert.equal(searchCatalog(items, "celebration ALSTON").length, 1);
  assert.equal(searchCatalog(items, "R3").length, 1);
  assert.equal(searchCatalog(items, "maillots").length, 0);
});

test("installation des dépendances dans le bon ordre, sans réinstaller une base active", () => {
  const base = { id: "base" };
  const patch = { id: "patch", dependencies: [{ id: "base" }] };
  assert.deepEqual(catalogInstallPlan(patch, [patch, base], []).map((m) => m.id), ["base", "patch"]);
  assert.deepEqual(catalogInstallPlan(patch, [patch, base], [{ packageId: "base", enabled: true }]).map((m) => m.id), ["patch"]);
  assert.throws(() => catalogInstallPlan(patch, [patch], []), /absent/);
});

test("chaque mod communautaire installable possède sa fiche et la même empreinte", () => {
  for (const mod of DESKTOP_COMMUNITY_MODS) {
    assert.equal(mod.status, "published", mod.id);
    const { mod: record } = JSON.parse(fs.readFileSync(new URL("../public/repository/api/catalog/" + mod.id, import.meta.url), "utf8"));
    assert.equal(record.archiveHash, mod.archiveHash, mod.id);
    assert.equal(record.downloadUrl, mod.downloadUrl, mod.id);
    assert.equal(record.archiveSize, mod.archiveSize, mod.id);
  }
});

test("modules isolés : chemins presets et ressources LiveCPK adaptés sans changer la logique", () => {
  const siderRoot = path.resolve("test-game/SiderAddons");
  const mod = { id: "nets-123", stagingPath: path.resolve("test-data/nets"), components: [{ type: "livecpk", root: "livecpk/goalnets" }] };
  const component = { root: "modules/goalnets" };
  const input = 'local p = sider_path .. "modules\\\\goalnets\\\\presets\\\\"\nlocal content = ctx.sider_dir .. ".\\\\content\\\\pyro"\n-- "modules\\\\goalnets\\\\comment"\nreturn m';
  const output = adaptLuaPaths(input, mod, component, siderRoot);
  assert.ok(output.includes('"modules\\\\STRYKER\\\\nets-123\\\\presets\\\\"'));
  assert.ok(output.includes('".\\\\content\\\\pyro"'));
  assert.ok(output.includes('-- "modules\\\\goalnets\\\\comment"'));
  assert.ok(output.endsWith("return m"));
  const shirtless = { ...mod, id: "shirtless", components: [{ type: "livecpk", root: "livecpk/ShirtlessCelebration" }] };
  const adapted = adaptLuaPaths('ctx.sider_dir .. "\\\\livecpk\\\\ShirtlessCelebration\\\\Asset" .. "\\\\face.bin"', shirtless, { root: "modules" }, siderRoot);
  assert.ok(adapted.includes("ShirtlessCelebration\\\\Asset"));
  assert.ok(adapted.includes("test-data"));
  assert.ok(adapted.endsWith('.. "\\\\face.bin"'));
});
