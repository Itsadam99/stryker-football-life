import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { careerFixture, addThreeTeamSchedule } from './helpers/career.js';
import { encodeSave, decodeSave } from '../server/career/save-codec.js';
import { sha256, readCareer } from '../server/career/bal-adapter.js';
import { CoachingStore } from '../server/career/coaching-store.js';
import { prepareCoachingInstallation } from '../server/career/coaching-install-plan.js';
import { unpackDatabase } from '../server/career/database-codec.js';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stryker-coaching-plan-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const blocks = addThreeTeamSchedule(careerFixture().blocks);
  blocks.description.fill(0, 128); blocks.description.write('Synthetic Player\nTest FC 0 / League\n24/10/2025', 128);
  const input = encodeSave(blocks), expectedHash = sha256(input), store = new CoachingStore(root), id = 'a'.repeat(64);
  store.track(id, blocks, expectedHash);
  const data = Buffer.alloc(400);
  for (let n = 0; n < 3; n++) { data.writeUInt32LE(n + 1, n * 100); data.write(`Test Coach ${n}`, n * 100 + 54); }
  data.writeUInt32LE(18, 300); data.write('Synthetic Template', 354);
  return { input, expectedHash, record: store.read(id), database: { data, hash: sha256(data) } };
}

test('native install plan creates new identities and reconstructs all blocks without game writes', t => {
  const source = fixture(t), before = Buffer.from(source.input), plan = prepareCoachingInstallation(source);
  assert.equal(plan.report.appliedToGame, false); assert.equal(plan.report.clubs, 3); assert.equal(plan.report.addedNativeCoaches, 24);
  assert.ok(source.input.equals(before));
  assert.ok(unpackDatabase(plan.coachDatabase).subarray(0, source.database.data.length).equals(source.database.data));
  const decoded = decodeSave(plan.save), original = decodeSave(source.input);
  for (const key of ['description', 'encryptHeader', 'header', 'logo', 'serial']) assert.ok(decoded[key].equals(original[key]));
  assert.equal(readCareer(decoded).teams.length, 730);
  const changed = new Set(plan.undo.map(([at]) => at));
  for (let at = 0; at < original.data.length; at++) if (!changed.has(at)) assert.equal(decoded.data[at], original.data[at]);
});

test('stale saves, mismatched databases and incomplete season proposals fail before preparing writes', t => {
  const source = fixture(t);
  assert.throws(() => prepareCoachingInstallation({ ...source, expectedHash: 'b'.repeat(64) }), /sauvegarde/);
  assert.throws(() => prepareCoachingInstallation({ ...source, database: { ...source.database, hash: 'b'.repeat(64) } }), /base locale/);
  assert.throws(() => prepareCoachingInstallation({ ...source, useSeasonPlan: true }), /bilan complet/);
});
