import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveCoachDatabase, parseNativeFileList } from '../server/career/database-source.js';
import { packDatabase } from '../server/career/database-codec.js';
import { sha256 } from '../server/career/bal-adapter.js';

function nativeList(names) {
  const bytes = Buffer.alloc(Math.max(64, names.length * 48 + 16));
  bytes.writeUInt32LE(100, 0);
  names.forEach((name, i) => { bytes.writeUInt32LE(names.length - i, 4 + i * 48); bytes.write(name, 16 + i * 48); });
  return bytes;
}
function table(name) {
  const bytes = Buffer.alloc(100); bytes.writeUInt32LE(18); bytes.write(name, 54);
  return packDatabase(bytes, Buffer.from('ff10815745535953', 'hex'));
}
function fixture(t, enabled = 1) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stryker-native-source-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'download'));
  const sider = path.join(root, 'SiderAddons'); fs.mkdirSync(sider);
  const ini = path.join(sider, 'sider.ini'); fs.writeFileSync(ini, `[sider]\r\nlivecpk.enabled = ${enabled}\r\ncpk.root = ".\\first"\r\ncpk.root = ".\\second"\r\n`);
  const names = ['base.cpk', 'patch.cpk'];
  fs.writeFileSync(path.join(root, 'download', 'spFileList.bin'), nativeList(names));
  for (const name of names) fs.writeFileSync(path.join(root, 'download', name), Buffer.alloc(32));
  const live = (folder, name) => { const target = path.join(sider, folder, 'common', 'etc', 'pesdb', 'Coach.bin'); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, table(name)); return target; };
  return { root, ini, live };
}

test('configured first LiveCPK root wins and preserves the packed native header', t => {
  const f = fixture(t), expected = f.live('first', 'First Synthetic'); f.live('second', 'Second Synthetic');
  const result = resolveCoachDatabase({ gamePath: f.root, siderPath: f.ini }, { readEntry: () => { throw new Error('CPK must not be consulted'); } });
  assert.equal(result.source.path, expected); assert.equal(result.catalog.get(18).name, 'First Synthetic');
  assert.equal(result.hash, sha256(result.data)); assert.equal(result.nativeHeader.toString('hex'), 'ff10815745535953');
});

test('disabled LiveCPK uses the last native package containing the table', t => {
  const f = fixture(t, 0); f.live('first', 'Disabled Synthetic'); const checked = [];
  const result = resolveCoachDatabase({ gamePath: f.root, siderPath: f.ini }, { readEntry: file => { checked.push(path.basename(file)); return table('Patched Synthetic'); } });
  assert.deepEqual(checked, ['patch.cpk']); assert.equal(result.source.kind, 'cpk'); assert.equal(result.catalog.get(18).name, 'Patched Synthetic');
  const fallback = resolveCoachDatabase({ gamePath: f.root, siderPath: f.ini }, { readEntry: file => path.basename(file) === 'patch.cpk' ? null : table('Base Synthetic') });
  assert.equal(fallback.catalog.get(18).name, 'Base Synthetic');
});

test('malformed priorities, traversal paths and missing archives fail closed', t => {
  const f = fixture(t, 0), list = nativeList(['base.cpk', 'patch.cpk']);
  assert.deepEqual(parseNativeFileList(list), ['base.cpk', 'patch.cpk']);
  list.writeUInt32LE(9, 52); assert.throws(() => parseNativeFileList(list), /Chaînage/);
  assert.throws(() => parseNativeFileList(nativeList(['../outside.cpk'])), /non local/);
  assert.throws(() => parseNativeFileList(nativeList(['same.cpk', 'SAME.cpk'])), /dupliqué/);
  fs.unlinkSync(path.join(f.root, 'download', 'base.cpk'));
  assert.throws(() => resolveCoachDatabase({ gamePath: f.root, siderPath: f.ini }, { readEntry: () => table('Not Loaded') }), /absente/);
  fs.writeFileSync(f.ini, '[sider]\nlivecpk.enabled=1\nlivecpk.enabled=0\n');
  assert.throws(() => resolveCoachDatabase({ gamePath: f.root, siderPath: f.ini }), /ambiguë/);
});

test('source changes during resolution invalidate the result', t => {
  const f = fixture(t, 0);
  assert.throws(() => resolveCoachDatabase({ gamePath: f.root, siderPath: f.ini }, { readEntry: () => {
    fs.appendFileSync(path.join(f.root, 'download', 'patch.cpk'), 'changed'); return table('Changed Source');
  } }), /changé/);
});
