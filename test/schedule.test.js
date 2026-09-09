import assert from 'node:assert/strict';
import test from 'node:test';
import { careerFixture } from './helpers/career.js';
import { readLeagueSchedule } from '../server/career/schedule.js';
import { packDatabase, unpackDatabase } from '../server/career/database-codec.js';

function fixture() {
  const { blocks } = careerFixture(), d = blocks.data;
  d.writeUInt16LE(20, 2040080); d.write('Synthetic League', 2040082);
  for (let i = 0; i < 58; i++) d.writeUInt32LE(i < 6 ? i : 0xffffffff, 2040216 + i * 4);
  [[0, 1], [1, 2], [2, 0], [1, 0], [2, 1], [0, 2]].forEach(([home, away], round) => {
    const at = 2276484 + round * 520;
    for (let position = 0; position < 16; position++) d.fill(255, at + position * 32, at + position * 32 + 16);
    d.writeUInt32LE(home | ((100 + home) << 14), at);
    d.writeUInt32LE(away | ((100 + away) << 14), at + 4);
    d.writeUInt32LE(round, at + 8); d.writeUInt32LE(20 | (round << 16), at + 12);
  });
  for (let slot = 0; slot < 3; slot++) d.writeUInt16LE(20, 84 + slot * 1680 + 744);
  return blocks;
}

test('native planned fixtures count byes rather than equating rounds with games', () => {
  const blocks = fixture(), schedule = readLeagueSchedule(blocks, 20);
  assert.equal(schedule.rounds, 6); assert.equal(schedule.matchesPerTeam, 4);
  assert.equal(schedule.fixtures, 6); assert.equal(schedule.complete, false);
  for (let slot = 0; slot < 3; slot++) {
    const at = 84 + slot * 1680 + 744;
    blocks.data[at + 2] = 4; blocks.data[at + 3] = 4; blocks.data[at + 5] = 4;
  }
  assert.equal(readLeagueSchedule(blocks, 20).complete, true);
});

test('schedule guards reject wrong identities, missing fixtures, out-of-bounds references and nonstandard points', () => {
  for (const mutate of [
    d => d.writeUInt32LE(0xfffffffe, 2040216),
    d => d.writeUInt32LE(21, 2276484 + 12),
    d => d.fill(255, 2276484, 2276484 + 16),
    d => { d[84 + 744 + 2] = 99; },
  ]) { const blocks = fixture(); mutate(blocks.data); assert.throws(() => readLeagueSchedule(blocks, 20)); }
  assert.throws(() => readLeagueSchedule(fixture(), 148), /phase/);
});

test('PES database wrapper preserves native flags and verifies lengths', () => {
  const data = Buffer.from('Synthetic database payload');
  const header = Buffer.from('ff10815745535953', 'hex'), packed = packDatabase(data, header);
  assert.ok(packed.subarray(0, 8).equals(header));
  assert.ok(unpackDatabase(packed).equals(data));
  packed.writeUInt32LE(1, 12);
  assert.throws(() => unpackDatabase(packed), /Taille/);
  assert.throws(() => unpackDatabase(Buffer.alloc(16)), /incompatible/);
});
