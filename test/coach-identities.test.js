import assert from 'node:assert/strict';
import test from 'node:test';
import { registerCoachIdentities } from '../server/career/coach-identities.js';

function fixture() {
  const data = Buffer.alloc(200);
  data.writeUInt32LE(18, 0); data.writeUInt32LE(12345, 4); data.write('Synthetic Template', 54);
  data.writeUInt32LE(2_000_000, 100); data.write('Existing Other Mod Coach', 154);
  return data;
}
const request = (careerId = 'a'.repeat(64), name = 'Alexis Valmont') => ({ careerId, templateId: 18,
  profiles: [{ kind: 'fictional', identity: 'fictional:0', name }] });

test('career-local coach IDs never collide across saves or with another mod', () => {
  const data = fixture(), first = registerCoachIdentities(data, null, request());
  const second = registerCoachIdentities(first.data, first.registry, request('b'.repeat(64), 'Milan Novak'));
  assert.equal(first.mapping['fictional:0'], 2_000_001);
  assert.equal(second.mapping['fictional:0'], 2_000_002);
  assert.equal(second.added, 1); assert.ok(second.data.subarray(0, data.length).equals(data));
  assert.equal(first.registry.entries[`${'a'.repeat(64)}/fictional:0`].name, 'Alexis Valmont');
  assert.equal(Object.keys(first.registry.entries).length, 1);
});

test('replay and base refresh preserve all careers native identities', () => {
  const base = fixture(), first = registerCoachIdentities(base, null, request());
  const replay = registerCoachIdentities(first.data, first.registry, request());
  assert.equal(replay.added, 0); assert.ok(replay.data.equals(first.data));
  const second = registerCoachIdentities(first.data, first.registry, request('b'.repeat(64), 'Milan Novak'));
  const rebuilt = registerCoachIdentities(base, second.registry, request());
  assert.equal(rebuilt.added, 2); assert.ok(rebuilt.data.equals(second.data));
});

test('changed names and reused native IDs are conflicts, not silent overwrites', () => {
  const first = registerCoachIdentities(fixture(), null, request()), before = Buffer.from(first.data);
  assert.throws(() => registerCoachIdentities(first.data, first.registry, request('a'.repeat(64), 'Someone Else')), /nom/);
  const conflicting = Buffer.from(first.data); conflicting.fill(0, 254, 300); conflicting.write('Other Mod', 254);
  assert.throws(() => registerCoachIdentities(conflicting, first.registry, request()), /autre mod/);
  assert.ok(first.data.equals(before));
  const broken = structuredClone(first.registry); broken.entries.unknown = structuredClone(Object.values(broken.entries)[0]);
  assert.throws(() => registerCoachIdentities(first.data, broken, request()), /endommagé/);
});
