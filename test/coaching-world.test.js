import assert from 'node:assert/strict';
import test from 'node:test';
import { careerFixture, addThreeTeamSchedule } from './helpers/career.js';
import { initializeWorld, careerFingerprint, preferredFormations } from '../server/career/coaching-world.js';
import { seedFictionalReserve, validateState, ageOn } from '../server/career/coaching.js';

function fixture() {
  const { blocks } = careerFixture();
  addThreeTeamSchedule(blocks);
  blocks.description.fill(0, 128);
  blocks.description.write('Synthetic Player\nTest FC 0 / Synthetic League\n24/10/2025', 128);
  return blocks;
}

test('world imports actual league membership and protects countries and unsupported phases', () => {
  const blocks = fixture(), before = Buffer.from(blocks.data), world = initializeWorld(blocks, { careerId: 'a'.repeat(64) });
  assert.equal(world.coverage.clubs, 3); assert.equal(world.coverage.otherTeams, 727);
  assert.equal(world.state.user_club, 'club:100');
  assert.deepEqual(Object.values(world.bindings).map(b => b.teamSlot), [0, 1, 2]);
  assert.ok(blocks.data.equals(before));
  assert.equal(world.state.clubs['club:100'].appointed, '2025-10-24');
  assert.match(world.state.clubs['club:100'].contract_source, /simulated/);
  assert.equal(world.state.coaches['native:1'].birth_date, null);
  assert.equal(world.state.coaches['native:1'].kind, 'native');
  assert.match(world.state.coaches['native:1'].retirement_policy_source, /no inferred age/);
  assert.deepEqual(initializeWorld(blocks, { careerId: 'a'.repeat(64) }), world);
});

test('reserve adds distinct fictional coaches without replacing native assignments', () => {
  const world = initializeWorld(fixture(), { careerId: 'b'.repeat(64) });
  const coaches = Object.values(world.state.coaches), fictional = coaches.filter(c => c.kind === 'fictional');
  assert.equal(fictional.length, 24);
  assert.equal(new Set(coaches.map(c => c.name)).size, coaches.length);
  assert.ok(fictional.every(c => ageOn(c.birth_date, world.state.date) >= 32 && ageOn(c.birth_date, world.state.date) <= 46 && c.formations.length === 3));
  assert.deepEqual(Object.values(world.state.clubs).map(c => c.coach), ['native:1', 'native:2', 'native:3']);
  assert.equal(validateState(world.state), true);
  assert.throws(() => seedFictionalReserve(world.state, -1));
  assert.throws(() => seedFictionalReserve(world.state, 201));
});

test('native identity mismatches and duplicate employers cannot initialize a career', () => {
  const blocks = fixture(), options = { careerId: 'c'.repeat(64) };
  assert.throws(() => initializeWorld(blocks, { ...options, catalog: new Map() }), /base locale/);
  blocks.data.writeUInt32LE(1, 84 + 1680 + 652);
  blocks.data.writeUInt32LE(1, 1260084 + 600);
  assert.throws(() => initializeWorld(blocks, options), /partagées/);
  assert.throws(() => initializeWorld(fixture(), { careerId: '../escape' }), /Identité/);
});

test('player identity must match exactly and simulated formations do not rewrite native geometry', () => {
  const blocks = fixture(), fingerprint = careerFingerprint(blocks);
  const plan = blocks.data.subarray(84 + 1116, 84 + 1276);
  assert.equal(preferredFormations(plan)[0], '4-3-3');
  blocks.description.fill(0, 128);
  blocks.description.write('Synthetic Player\nTest FC / Synthetic League\n24/10/2025', 128);
  assert.throws(() => initializeWorld(blocks, { careerId: 'a'.repeat(64) }), /identifiable/);
  assert.equal(careerFingerprint(blocks), fingerprint);
  blocks.description.fill(0, 128);
  blocks.description.write('Another Player\nTest FC 0 / Synthetic League\n24/10/2025', 128);
  assert.notEqual(careerFingerprint(blocks), fingerprint);
});
