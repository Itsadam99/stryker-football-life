import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startServer } from "../server/index.js";

const project = process.cwd();
const archiveDirs = ["artifacts/new-mod-packages-v2/output", "artifacts/new-mod-packages-v3/output", "artifacts/new-mod-packages-v4/output", "bundled-mods"];
// Sans argument, tout le catalogue est audité ; un chemin d'archive permet de
// contrôler un seul paquet sans réinstaller les 780 Mo des autres.
const selected = process.argv.slice(2);
const archives = selected.length
  ? selected.map((name) => path.resolve(name))
  : archiveDirs.filter((dir) => fs.existsSync(dir)).flatMap((dir) => fs.readdirSync(dir).filter((name) => /\.zip$/i.test(name)).map((name) => path.resolve(dir, name)));
const bundled = JSON.parse(fs.readFileSync("bundled-mods/catalog.json", "utf8"));
const results = [];
for (const archive of archives) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-catalog-audit-"));
  let service;
  try {
    service = await startServer({ port: 0, rootDir: root, dataRoot: path.join(root, "data") });
    const { modEngine, siderManager, store } = service.runtime;
    siderManager.documentsRoots = [path.join(root, "Documents")];
    store.update((state) => { state.settings.isLinked = true; state.settings.detectedVersion = "SP Football Life 2026"; });
    const save = path.join(root, "Documents/KONAMI/eFootball PES 2021 SEASON UPDATE/2026/save");
    fs.mkdirSync(save, { recursive: true });
    fs.writeFileSync(path.join(save, "EDIT00000000"), "original audit save");
    const siderRoot = path.dirname(store.snapshot().settings.siderPath);
    const kitMap = path.join(siderRoot, "content/kits/map.txt");
    fs.mkdirSync(path.dirname(kitMap), { recursive: true });
    fs.writeFileSync(kitMap, '999999, "Original team"\n');
    const mod = await modEngine.installArchive(archive);
    const metadataPath = path.join(project, "public/repository/api/catalog", mod.packageId);
    const expected = bundled.find((entry) => entry.archiveFile === path.basename(archive))
      || (fs.existsSync(metadataPath) ? JSON.parse(fs.readFileSync(metadataPath, "utf8")).mod : null);
    assert.ok(expected, "Catalogue manquant : " + mod.packageId);
    assert.equal(mod.archiveHash, expected.archiveHash, "Empreinte divergente : " + mod.packageId);
    assert.equal(fs.statSync(archive).size, expected.archiveSize, "Taille divergente");
    assert.ok(mod.components.length);
    assert.match(fs.readFileSync(kitMap, "utf8"), /Original team/);
    modEngine.toggle(mod.id, false);
    assert.equal(fs.readFileSync(path.join(save, "EDIT00000000"), "utf8"), "original audit save");
    modEngine.toggle(mod.id, true);
    modEngine.uninstall(mod.id);
    assert.equal(modEngine.list().length, 0);
    assert.equal(fs.readFileSync(kitMap, "utf8"), '999999, "Original team"\n');
    assert.equal(fs.readFileSync(path.join(save, "EDIT00000000"), "utf8"), "original audit save");
    results.push({ id: mod.packageId, archive: path.basename(archive), status: "passed", components: mod.components.map((c) => c.type), files: mod.components.reduce((n, c) => n + (c.files?.length || c.entrypoints?.length || 0), 0) });
    console.log("OK " + mod.packageId);
  } catch (error) {
    results.push({ archive: path.basename(archive), status: "failed", error: error.message });
    console.log("FAILED " + path.basename(archive) + ": " + error.message);
  } finally {
    if (service) await service.close();
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  }
}
fs.mkdirSync("artifacts", { recursive: true });
fs.writeFileSync("artifacts/catalog-audit-results.json", JSON.stringify({ at: new Date().toISOString(), game: "isolated simulated FL2026 installation, no game execution", results }, null, 2));
console.log(JSON.stringify({ passed: results.filter((r) => r.status === "passed").length, failed: results.filter((r) => r.status === "failed").length }));
if (results.some((r) => r.status === "failed")) process.exitCode = 1;
