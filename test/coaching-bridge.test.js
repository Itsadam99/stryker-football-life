import assert from 'node:assert/strict';
import test from 'node:test';
import { careerFixture, addThreeTeamSchedule } from './helpers/career.js';
import { DIMENSIONS } from '../server/career/coaching.js';
import { advanceFromNativeSave, operationsFromCoaching } from '../server/career/coaching-bridge.js';
import { addFictionalCoaches } from '../server/career/coach-table.js';
import { applyOperations, readCareer, sha256 } from '../server/career/bal-adapter.js';
import { encodeSave, decodeSave } from '../server/career/save-codec.js';

function fixture(matches = 4) {
  const blocks = addThreeTeamSchedule(careerFixture().blocks), native = Buffer.alloc(400);
  const state = { version: 1, career_id: 'explicit-synthetic-lineage', mode: 'BAL', user_club: 'club:0',
    date: '2025-10-24', seed: 1245, next_generated: 0, coaches: {}, clubs: {} };
  const bindings = {};
  for (let i = 0; i < 4; i++) {
    const name = `Test Coach ${i}`;
    state.coaches[`coach:${i}`] = { name, kind: 'fictional', birth_date: '1954-01-01', retired: false,
      reputation: .6, adaptability: .5, style: Object.fromEntries(DIMENSIONS.map(k => [k, .7])), formations: ['4-3-3', '4-2-3-1'] };
    native.writeUInt32LE(i + 1, i * 100); native.write(name, i * 100 + 8); native.write(name, i * 100 + 54);
    if (i >= 3) continue;
    state.clubs[`club:${i}`] = { kind: 'club', coach: `coach:${i}`, reputation: .6, expected_ppg: 1.6,
      identity: Object.fromEntries(DIMENSIONS.map(k => [k, .6])), appointed: '2025-07-01', contract_end: '2027-07-01' };
    bindings[`club:${i}`] = { teamSlot: i, team: `Test FC ${i}`, expectedCoach: i + 1, competitionId: 20 };
    const at = 84 + i * 1680 + 744;
    blocks.data[at + 2] = matches; blocks.data[at + 3] = matches; blocks.data[at + 5] = matches;
  }
  for (const at of [11322908, 11516880]) { blocks.data.writeUInt16LE(2026, at); blocks.data[at + 2] = 7; blocks.data[at + 3] = 1; }
  blocks.description.fill(0, 128); blocks.description.write('Synthetic Player\nTest FC / League\n1/7/2026', 128);
  return { blocks, native, state, bindings };
}
const event = { seasonStart: '2025-07-01', eventId: 'explicit-season-2026', leagueIds: [20] };

test('native schedule and standings drive retirements, generated identities, formations and encrypted save as one verified chain', () => {
  const { blocks, native, state, bindings } = fixture(), before = Buffer.from(blocks.data);
  const result = advanceFromNativeSave(state, blocks, bindings, event);
  const generated = Object.entries(result.state.coaches).filter(([, c]) => c.kind === 'fictional' && !c.retired)
    .map(([identity, c], index) => ({ identity, name: c.name, kind: 'fictional', id: 2000000 + index }));
  assert.equal(generated.length, 3);
  const registry = addFictionalCoaches(native, generated, { templateId: 1, expectedHash: sha256(native) });
  const operations = operationsFromCoaching(result.state, blocks, bindings, registry.mapping, registry.catalog);
  const applied = applyOperations(blocks, operations, registry.catalog);
  const roundtrip = decodeSave(encodeSave(applied.blocks));
  assert.ok(roundtrip.data.equals(applied.blocks.data));
  const current = readCareer(roundtrip);
  for (let slot = 0; slot < 3; slot++) assert.equal(current.teams[slot].coachName, result.state.coaches[result.state.clubs[`club:${slot}`].coach].name);
  assert.ok(blocks.data.equals(before));
  assert.equal(applied.blocks.data[9000000], before[9000000]);
  assert.equal(result.audit.appliedToGame, false);
  assert.deepEqual(advanceFromNativeSave(result.state, roundtrip, bindings, event).state, result.state);
});

test('native bridge never advances an incomplete schedule or invents an annual calendar', () => {
  const partial = fixture(2);
  assert.throws(() => advanceFromNativeSave(partial.state, partial.blocks, partial.bindings, event), /pas terminé/);
  const complete = fixture();
  assert.throws(() => advanceFromNativeSave(complete.state, complete.blocks, complete.bindings, { ...event, seasonStart: undefined }), /date/i);
  delete complete.bindings['club:2'];
  assert.throws(() => advanceFromNativeSave(complete.state, complete.blocks, complete.bindings, event), /complète/);
});
