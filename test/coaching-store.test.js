import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { careerFixture, addThreeTeamSchedule } from './helpers/career.js';
import { sha256 } from '../server/career/bal-adapter.js';
import { CoachingStore } from '../server/career/coaching-store.js';
import { observeNativeSeasons } from '../server/career/season-observer.js';
import { initializeWorld } from '../server/career/coaching-world.js';
import { prepareObservedSeason } from '../server/career/coaching-season-plan.js';

const id = 'a'.repeat(64);
function fixture() {
  const blocks = addThreeTeamSchedule(careerFixture().blocks); setDate(blocks, '2025-10-24'); return blocks;
}
function setDate(blocks, date) {
  const [year, month, day] = date.split('-').map(Number);
  for (const at of [11322908, 11516880]) { blocks.data.writeUInt16LE(year, at); blocks.data[at + 2] = month; blocks.data[at + 3] = day; }
  blocks.description.fill(0, 128); blocks.description.write(`Synthetic Player\nTest FC 0 / Synthetic League\n${day}/${month}/${year}`, 128);
}
function draws(blocks, matches) {
  for (let slot = 0; slot < 3; slot++) {
    const at = 84 + slot * 1680 + 744;
    const played = matches % 2 && slot === 2 ? matches - 1 : matches;
    blocks.data[at + 2] = played; blocks.data[at + 3] = played; blocks.data[at + 5] = played;
  }
}
function store(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stryker-coaching-store-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, service: new CoachingStore(root) };
}

test('contracts and reserve survive restart; replay creates no new history objects', t => {
  const { root, service } = store(t), blocks = fixture(), hash = sha256(blocks.data);
  const initial = service.track(id, blocks, hash), first = service.read(id), count = fs.readdirSync(service.objects).length;
  const restarted = new CoachingStore(root), replay = restarted.track(id, blocks, hash);
  assert.deepEqual(replay, initial); assert.equal(fs.readdirSync(service.objects).length, count);
  setDate(blocks, '2025-11-18'); draws(blocks, 1);
  restarted.track(id, blocks, sha256(blocks.data));
  const later = restarted.read(id);
  assert.equal(later.checkpoint.previous, first.checkpointHash);
  assert.equal(later.checkpoint.world, first.checkpoint.world);
  assert.equal(later.observation.date, '2025-11-18');
  assert.deepEqual(later.world.state.clubs, first.world.state.clubs);
  assert.deepEqual(later.world.state.coaches, first.world.state.coaches);
});

test('failed final source verification leaves the old head and contracts intact', t => {
  const { service } = store(t), blocks = fixture();
  service.track(id, blocks, sha256(blocks.data)); const before = service.read(id);
  setDate(blocks, '2025-11-18'); draws(blocks, 1);
  assert.throws(() => service.track(id, blocks, sha256(blocks.data), () => { throw new Error('save changed'); }), /save changed/);
  assert.deepEqual(service.read(id), before);
});

test('rewinds, decreasing results and foreign appointments cannot overwrite tracking', t => {
  const { service } = store(t), blocks = fixture(); draws(blocks, 2);
  service.track(id, blocks, sha256(blocks.data)); const before = service.read(id);
  draws(blocks, 1); setDate(blocks, '2025-11-18');
  assert.throws(() => service.track(id, blocks, sha256(blocks.data)), /reculé/);
  draws(blocks, 2); setDate(blocks, '2025-10-23');
  assert.throws(() => service.track(id, blocks, sha256(blocks.data)), /antérieure/);
  setDate(blocks, '2025-11-18'); blocks.data.writeUInt32LE(90, 84 + 652); blocks.data.writeUInt32LE(90, 1260084);
  assert.throws(() => service.track(id, blocks, sha256(blocks.data)), /entraîneur/);
  assert.deepEqual(service.read(id), before);
});

test('a native ID reused for a different coach name cannot inherit the previous contract', t => {
  const { service } = store(t), blocks = fixture();
  service.track(id, blocks, sha256(blocks.data));
  const before = service.read(id);
  setDate(blocks, '2025-11-18');
  // The native ID and the team reference both remain unchanged.
  blocks.data.fill(0, 1260088, 1260088 + 46);
  blocks.data.write('Different Person Same Native ID', 1260088);
  assert.throws(() => service.track(id, blocks, sha256(blocks.data)), /entraîneur/);
  assert.deepEqual(service.read(id), before);
});

test('an unpreparable season preserves verified observations instead of blocking tracking', t => {
  const { service } = store(t), blocks = fixture();
  service.track(id, blocks, sha256(blocks.data));
  const before = service.read(id);
  // Missing a long stretch of observation cannot justify advancing the coaching
  // engine, but the newly observed complete native table is still valuable.
  setDate(blocks, '2027-05-20'); draws(blocks, 4);
  let verifications = 0;
  const summary = service.track(id, blocks, sha256(blocks.data), () => { verifications++; });
  const after = service.read(id);
  assert.equal(verifications, 1);
  assert.equal(summary.seasonPlan.ready, false);
  assert.equal(after.observation.date, '2027-05-20');
  assert.equal(after.observation.completed.length, 1);
  assert.equal(after.observation.completed[0].date, '2027-05-20');
  assert.equal(after.checkpoint.previous, before.checkpointHash);
  assert.equal(after.checkpoint.world, before.checkpoint.world);
  assert.deepEqual(after.world.state, before.world.state);
  const count = fs.readdirSync(service.objects).length;
  assert.deepEqual(service.track(id, blocks, sha256(blocks.data)), summary);
  assert.equal(fs.readdirSync(service.objects).length, count);
});

test('complete native snapshots are archived once, including a same-program next season', () => {
  const blocks = fixture(); let ledger = observeNativeSeasons(null, blocks, { careerId: id });
  setDate(blocks, '2026-05-20'); draws(blocks, 4);
  ledger = observeNativeSeasons(ledger, blocks, { careerId: id });
  assert.equal(ledger.completed.length, 1); assert.equal(ledger.completed[0].observedSince, '2025-10-24');
  const finished = structuredClone(ledger.completed[0]);
  setDate(blocks, '2026-05-21'); ledger = observeNativeSeasons(ledger, blocks, { careerId: id });
  assert.equal(ledger.completed.length, 1);
  setDate(blocks, '2026-08-25'); draws(blocks, 1); ledger = observeNativeSeasons(ledger, blocks, { careerId: id });
  assert.equal(ledger.leagues[20].cycle, 1); assert.deepEqual(ledger.completed[0], finished);
  setDate(blocks, '2027-05-20'); draws(blocks, 4); ledger = observeNativeSeasons(ledger, blocks, { careerId: id });
  assert.equal(ledger.completed.length, 2); assert.notEqual(ledger.completed[1].id, finished.id);
});

test('repeated unchanged tables cannot hide skipped years before a season reset', () => {
  const blocks = fixture(); let ledger = observeNativeSeasons(null, blocks, { careerId: id });
  setDate(blocks, '2026-05-20'); draws(blocks, 4);
  ledger = observeNativeSeasons(ledger, blocks, { careerId: id });
  setDate(blocks, '2028-05-20');
  ledger = observeNativeSeasons(ledger, blocks, { careerId: id });
  const before = structuredClone(ledger);
  setDate(blocks, '2028-08-25'); draws(blocks, 0);
  assert.throws(() => observeNativeSeasons(ledger, blocks, { careerId: id }), /reculé/);
  assert.deepEqual(ledger, before);
  assert.equal(ledger.completed[0].date, '2026-05-20');
  assert.equal(ledger.leagues[20].cycle, 0);
});

test('complete tables from distant seasons cannot be combined into one coaching interseason', () => {
  const world = initializeWorld(fixture(), { careerId: id });
  // Two small synthetic leagues, each with a complete two-match programme.
  world.state.coaches['native:4'] = { ...structuredClone(world.state.coaches['native:3']), name: 'Test Coach 3' };
  world.state.clubs['club:103'] = { ...structuredClone(world.state.clubs['club:102']), coach: 'native:4' };
  world.bindings['club:103'] = { teamSlot: 3, team: 'Test FC 3', competitionId: 21, expectedCoach: 4 };
  world.bindings['club:102'].competitionId = 21;
  world.nativeIds['native:4'] = 4;
  world.coverage.clubs = 4;
  world.coverage.leagues = [{ id: 20, name: 'Synthetic A', teams: 2 }, { id: 21, name: 'Synthetic B', teams: 2 }];
  const observation = { completed: [[100, 101], [102, 103]].map((ids, index) => ({
    id: `synthetic-completion:${index}`, competitionId: 20 + index, date: '2026-05-20', cycle: 0,
    observedSince: '2025-10-24', matchesPerTeam: 2,
    members: ids.map(db => ({ club: `club:${db}`, slot: db - 100, name: `Test FC ${db - 100}` })),
    rows: Object.fromEntries(ids.map(db => [`club:${db}`, { matches: 2, points: 2, wins: 0, draws: 2, losses: 0 }])),
  })) };
  assert.equal(prepareObservedSeason(world, observation).ready, true);
  observation.completed[1].date = '2027-05-20';
  assert.throws(() => prepareObservedSeason(world, observation), /périodes trop éloignées/);
});

test('midseason initialization reaches a native interseason without inventing its start date', () => {
  const blocks = fixture(), world = initializeWorld(blocks, { careerId: id });
  let ledger = observeNativeSeasons(null, blocks, { careerId: id });
  assert.equal(prepareObservedSeason(world, ledger).ready, false);
  setDate(blocks, '2026-05-20'); draws(blocks, 4); ledger = observeNativeSeasons(ledger, blocks, { careerId: id });
  const proposal = prepareObservedSeason(world, ledger);
  assert.equal(proposal.ready, true); assert.equal(proposal.appliedToGame, false);
  assert.equal(proposal.event.type, 'native_season_completed'); assert.equal(proposal.event.season_start, undefined);
  assert.equal(proposal.event.observed_since, '2025-10-24');
  assert.equal(world.state.date, '2025-10-24'); assert.equal(proposal.state.date, '2026-05-20');
  assert.deepEqual(prepareObservedSeason(world, ledger), proposal);
});

test('corrupted objects and traversal identifiers fail without replacing the pointer', t => {
  const { root, service } = store(t), blocks = fixture();
  service.track(id, blocks, sha256(blocks.data)); const before = service.read(id);
  fs.writeFileSync(path.join(root, 'objects', `${before.checkpoint.world}.json`), '{}');
  assert.throws(() => service.read(id), /endommagé/);
  assert.throws(() => service.read('../outside'), /Identité/);
});
