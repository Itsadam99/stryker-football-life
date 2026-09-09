import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readCpkFile } from '../server/career/cpk-reader.js';
import { unpackDatabase } from '../server/career/database-codec.js';

// Entirely synthetic CPK, authored by the independent pes-file-tools writer.
// Contains no game data; only the literal string asserted below.
const fixture = fileURLToPath(new URL('./fixtures/career-native-table.cpk', import.meta.url));
test('native CPK table is read without extracting an archive or invoking an external program', () => {
  assert.equal(unpackDatabase(readCpkFile(fixture, 'common/etc/pesdb/Coach.bin')).toString(), 'STRYKER synthetic database fixture\0');
  assert.equal(readCpkFile(fixture, 'common/etc/pesdb/Team.bin'), null);
  assert.throws(() => readCpkFile(fixture, '../../Coach.bin'), /connues/);
});

test('invalid or truncated CPK structures are rejected', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stryker-cpk-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bad = path.join(root, 'invalid.cpk'), data = fs.readFileSync(fixture);
  fs.writeFileSync(bad, data.subarray(0, 100));
  assert.throws(() => readCpkFile(bad, 'common/etc/pesdb/Coach.bin'), /limites/);
  data[0] = 0; fs.writeFileSync(bad, data);
  assert.throws(() => readCpkFile(bad, 'common/etc/pesdb/Coach.bin'), /Section/);
});
