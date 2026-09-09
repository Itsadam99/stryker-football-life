// Build a private, isolated native-fictional-coach experiment. Never installs.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { decodeSave, encodeSave } from '../../server/career/save-codec.js';
import { sha256, readCareer, identityOperations, applyOperations } from '../../server/career/bal-adapter.js';
import { addFictionalCoaches } from '../../server/career/coach-table.js';
import { packDatabase, unpackDatabase } from '../../server/career/database-codec.js';

export function buildTrial({ save, coachTable, output }) {
  if (fs.existsSync(output)) throw new Error('A new output directory is required.');
  const input = fs.readFileSync(save), native = fs.readFileSync(coachTable), blocks = decodeSave(input);
  const career = readCareer(blocks), paris = career.teams.find(t => t.name === 'Paris FC');
  if (!paris) throw new Error('This controlled experiment needs Paris FC in the copied career.');
  const fictional = { identity: 'fictional:stryker-native-test-0', id: 2000000, kind: 'fictional', name: 'Alexis Valmont',
    birth_date: '1987-04-12', formations: ['4-2-3-1', '4-3-3'], status: 'fictional test identity, no real-world biography' };
  const extended = addFictionalCoaches(native, [fictional], { templateId: 18, expectedHash: sha256(native) });
  const operations = identityOperations(career);
  const operation = operations.find(o => o.slot === paris.slot);
  operation.newCoach = fictional.id;
  operation.plans = operation.plans.map((p, i) => ({ formation: i < 2 ? '4-2-3-1' : '4-3-3',
    settings: { ...p.settings, attacking_style: 1, build_up: 1, attacking_area: 0, support_range: 3,
      defensive_style: i === 2 ? 1 : 0, pressuring: i === 2 ? 1 : 0, defensive_line: i === 2 ? 4 : 7, compactness: 8 } }));
  const result = applyOperations(blocks, operations, extended.catalog);
  result.blocks.description = Buffer.from(result.blocks.description);
  result.blocks.description.fill(0, 0, 128);
  result.blocks.description.write('STRYKER TEST - Nouveau coach', 0, 127, 'utf8');
  const encoded = encodeSave(result.blocks), decoded = decodeSave(encoded);
  for (const key of Object.keys(decoded)) assert.ok(decoded[key].equals(result.blocks[key]), key);
  const originalPacked = fs.existsSync(`${coachTable}.packed`) ? fs.readFileSync(`${coachTable}.packed`) : null;
  if (originalPacked) assert.ok(unpackDatabase(originalPacked).equals(native));
  const packed = originalPacked ? packDatabase(extended.data, originalPacked) : packDatabase(extended.data);
  assert.ok(unpackDatabase(packed).equals(extended.data));
  assert.ok(fs.readFileSync(save).equals(input)); assert.ok(fs.readFileSync(coachTable).equals(native));
  const databaseTarget = path.join(output, 'livecpk', 'stryker-coachs-test', 'common', 'etc', 'pesdb');
  fs.mkdirSync(databaseTarget, { recursive: true });
  fs.writeFileSync(path.join(databaseTarget, 'Coach.bin'), packed, { flag: 'wx' });
  fs.writeFileSync(path.join(output, 'BAL-STRYKER-NEW-COACH'), encoded, { flag: 'wx' });
  const report = { trial: 'native fictional coach with an appended database identity', installed: false, inGameValidated: false,
    sourceSaveHash: sha256(input), outputSaveHash: sha256(encoded), sourceCoachTableHash: sha256(native),
    changedBytes: result.changes.length, nativeDatabase: extended.report, profile: fictional,
    targetTeam: { slot: paris.slot, name: paris.name, oldCoachId: paris.coachId },
    distribution: 'PRIVATE GAME DATA — never publish the save or rebuilt Coach.bin; distribute source code only' };
  fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [save, coachTable, output] = process.argv.slice(2);
  if (!save || !coachTable || !output) throw new Error('Usage: node build-native-coach-trial.mjs COPIED_SAVE COPIED_COACH_BIN NEW_OUTPUT');
  console.log(JSON.stringify(buildTrial({ save, coachTable, output }), null, 2));
}
