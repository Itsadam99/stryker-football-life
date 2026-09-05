import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createZip } from '../../test/helpers/zip.js';
import { startServer } from '../../server/index.js';

const source = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(source, '../../artifacts/team-identity-research');
fs.mkdirSync(output, { recursive: true });
const archive = path.join(output, 'STRYKER-Team-Identity-Diagnostic-0.1.0.zip');
const names = ['stryker.mod.json', 'README.md', 'modules/team-identity-probe.lua'];
fs.writeFileSync(archive, createZip(names.map(name => ({ name, data: fs.readFileSync(path.join(source, name)) }))));

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stryker-identity-probe-check-'));
let service;
try {
  service = await startServer({ port: 0, rootDir: root, dataRoot: path.join(root, 'data') });
  const { modEngine, siderManager, store } = service.runtime;
  siderManager.documentsRoots = [path.join(root, 'Documents')];
  store.update(state => { state.settings.isLinked = true; state.settings.detectedVersion = 'SP Football Life 2026'; });
  const initial = store.snapshot();
  siderManager.deploy(initial, initial.profiles[0]);
  const ini = store.snapshot().settings.siderPath;
  const original = fs.readFileSync(ini, 'utf8');
  const mod = await modEngine.installArchive(archive);
  assert.equal(mod.packageId, 'stryker-team-identity-probe');
  assert.equal(mod.components.length, 1);
  assert.equal(mod.components[0].type, 'lua');
  const deployed = path.join(path.dirname(ini), 'modules/STRYKER', mod.id, 'team-identity-probe.lua');
  assert.equal(fs.readFileSync(deployed, 'utf8'), fs.readFileSync(path.join(source, 'modules/team-identity-probe.lua'), 'utf8'));
  assert.match(fs.readFileSync(ini, 'utf8'), /team-identity-probe\.lua/);
  modEngine.toggle(mod.id, false);
  assert.doesNotMatch(fs.readFileSync(ini, 'utf8'), /team-identity-probe\.lua/);
  modEngine.toggle(mod.id, true);
  assert.ok(fs.existsSync(deployed));
  modEngine.uninstall(mod.id);
  assert.equal(modEngine.list().length, 0);
  assert.equal(fs.readFileSync(ini, 'utf8'), original);
  assert.ok(!fs.existsSync(deployed));
  console.log('PASS: diagnostic archive imported, deployed unchanged, toggled and removed in isolated mock game.');
  console.log(archive);
} finally {
  if (service) await service.close();
  assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
  fs.rmSync(root, { recursive: true, force: true });
}
