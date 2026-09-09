import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '../server/career/bal-adapter.js';
import { addFictionalCoaches, readCoachTable } from '../server/career/coach-table.js';

function fixture() {
  const data = Buffer.alloc(100);
  data.writeUInt32LE(18); data.writeUInt16LE(12, 4); data[6] = 77; data[7] = 19;
  data.write('Synthetic native coach', 8); data.write('Synthetic native coach', 54);
  return data;
}
const coach = { identity: 'fictional:0', kind: 'fictional', id: 2000000, name: 'Alexis Valmont' };

test('new fictional coaches preserve every original native entry and unknown template bytes', () => {
  const data = fixture(), result = addFictionalCoaches(data, [coach], { templateId: 18, expectedHash: sha256(data) });
  assert.ok(result.data.subarray(0, 100).equals(data));
  assert.ok(result.data.subarray(104, 108).equals(data.subarray(4, 8)));
  assert.equal(readCoachTable(result.data).get(coach.id).name, coach.name);
  assert.equal(result.mapping['fictional:0'], 2000000);
  assert.equal(result.report.nativeGameValidation, false);
});

test('collisions, real-person relabeling, bad sizes and stale bases are refused', () => {
  const data = fixture(), options = { templateId: 18, expectedHash: sha256(data) };
  for (const invalid of [{ ...coach, id: 18 }, { ...coach, name: 'a'.repeat(46) }, { ...coach, kind: 'real' }]) assert.throws(() => addFictionalCoaches(data, [invalid], options));
  assert.throws(() => addFictionalCoaches(data, [coach, coach], options));
  assert.throws(() => addFictionalCoaches(data, [coach], { ...options, expectedHash: '0'.repeat(64) }));
  assert.throws(() => readCoachTable(Buffer.alloc(99)));
});
