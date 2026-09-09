import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MT19937, decodeSave, encodeSave } from '../server/career/save-codec.js';
import { readCareer, compilePlan, identityOperations, applyOperations, sha256 } from '../server/career/bal-adapter.js';
import { FORMATIONS } from '../server/career/tactical-data.js';
import { CareerManager, assertNoGameProcesses } from '../server/career/manager.js';
import { careerFixture } from './helpers/career.js';

test('MT matches the published reference array initialization vector', () => {
  const mt = new MT19937([0x123, 0x234, 0x345, 0x456]);
  assert.deepEqual(Array.from({ length: 10 }, () => mt.next()), [1067595299, 955945823, 477289528, 4107218783, 4228976476, 3344332714, 3355579695, 227628506, 810200273, 2591290167]);
});

test('codec preserves all six blocks, odd byte lengths and rejects damaged dimensions', () => {
  const { blocks, encrypted } = careerFixture(), decoded = decodeSave(encrypted);
  // Independently produced from these six fixture blocks by the public-domain
  // pesXdecrypter 6.0.0 C encrypter21.exe, not by this JavaScript codec.
  assert.equal(sha256(encrypted), '241b38da5fad6670b06a1d709bfe5e314a3b02c1e6e7e1e5858b8acced7bafde');
  for (const key of Object.keys(blocks)) assert.ok(decoded[key].equals(blocks[key]), key);
  assert.ok(encodeSave(decoded).equals(encrypted));
  assert.throws(() => decodeSave(encrypted.subarray(0, -1)), /incompatible/);
  assert.throws(() => decodeSave(Buffer.alloc(528)), /Dimensions|incompatible/);
  assert.throws(() => encodeSave({ ...blocks, serial: Buffer.alloc(1) }), /invalides/);
});

test('BAL date references and table guard must agree; ML is rejected', () => {
  const { blocks } = careerFixture();
  assert.equal(readCareer(blocks).teams.length, 730);
  assert.equal(readCareer(blocks).date, '2025-10-24');
  blocks.data[11322911] = 25;
  assert.throws(() => readCareer(blocks), /dates/);
  blocks.data.writeUInt32LE(12, 0);
  assert.throws(() => readCareer(blocks), /format/);
});

test('formations preserve goalkeepers and unrelated advanced instructions', () => {
  const { blocks } = careerFixture(), plan = blocks.data.subarray(84 + 1116, 84 + 1116 + 160);
  plan[108] = 9; plan[145] = 37; plan[156] = 1;
  for (const formation of Object.keys(FORMATIONS)) {
    const compiled = compilePlan(plan, {}, formation);
    assert.ok(compiled.subarray(99).equals(plan.subarray(99)));
    for (let phase = 0; phase < 3; phase++) for (const index of [0, 11, 12]) assert.equal(compiled[phase * 33 + index], plan[phase * 33 + index]);
  }
  assert.throws(() => compilePlan(plan, { randomOffset: 1 }), /inconnue/);
  assert.throws(() => compilePlan(plan, { compactness: 11 }), /limites/);
});

test('styles are idempotent, preserve direct counterattacks and reject occupied coach IDs', () => {
  const { blocks } = careerFixture();
  blocks.data[84 + 1116 + 99] = 0;
  const career = readCareer(blocks), operations = identityOperations(career);
  const result = applyOperations(blocks, operations);
  assert.equal(result.blocks.data[84 + 1116 + 100], 0);
  assert.equal(result.blocks.data[84 + 1680 + 1116 + 100], 1);
  assert.equal(result.blocks.data.length, blocks.data.length);
  assert.equal(applyOperations(result.blocks, identityOperations(readCareer(result.blocks))).changes.length, 0);
  assert.throws(() => applyOperations(blocks, [{ ...operations[0], newCoach: 2 }], { 2: 'Test Coach 1' }), /employé/);
});

function setup(t, gameClosed = async () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stryker-career-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const saves = path.join(root, 'saves'); fs.mkdirSync(saves);
  const file = path.join(saves, 'BL00000000');
  fs.writeFileSync(file, careerFixture().encrypted);
  const manager = new CareerManager({ dataRoot: path.join(root, 'app'), directories: [saves], gameClosed });
  return { root, file, manager, id: manager.list().saves[0].id };
}

test('apply, reload and remove preserve subsequent match progress and exact original tactics', async t => {
  const { file, manager, id } = setup(t), original = decodeSave(fs.readFileSync(file));
  const view = manager.inspect(id);
  assert.equal(view.teamCount, 730);
  const result = await manager.mutate(id, view.hash, 'apply');
  assert.ok(result.changedBytes > 0);
  assert.equal(sha256(fs.readFileSync(result.backupPath)), view.hash);
  const progressed = decodeSave(fs.readFileSync(file));
  progressed.data[9000000] = 99; // unrelated native progression
  for (const at of [11322908, 11516880]) progressed.data[at + 3] = 25;
  progressed.description.fill(0, 128); progressed.description.write('Synthetic Player\nTest FC / League\n25/10/2025', 128);
  fs.writeFileSync(file, encodeSave(progressed));
  await manager.mutate(id, sha256(fs.readFileSync(file)), 'remove');
  const restored = decodeSave(fs.readFileSync(file));
  assert.equal(restored.data[9000000], 99);
  assert.equal(readCareer(restored).date, '2025-10-25');
  for (const team of readCareer(original).teams) for (const at of team.offsets) assert.ok(restored.data.subarray(at, at + 160).equals(original.data.subarray(at, at + 160)));
  assert.equal(manager.list().saves[0].installed, false);
});

test('running game, stale preview, path injection and source changing during preparation never overwrite a save', async t => {
  let checks = 0;
  const { file, manager, id } = setup(t, async () => {
    checks++;
    if (checks === 2) {
      // The replacement must already be fully prepared when the last process
      // and source check runs. A later native save must win this race.
      assert.equal(fs.readdirSync(path.dirname(file)).filter(name => name.endsWith('.tmp')).length, 1);
      fs.appendFileSync(file, 'external-write');
    }
  });
  const original = fs.readFileSync(file), hash = sha256(original);
  assert.throws(() => manager.resolve('../BL00000000'), /invalide/);
  await assert.rejects(() => manager.mutate(id, '0'.repeat(64), 'apply'), /changé/);
  checks = 0;
  await assert.rejects(() => manager.mutate(id, hash, 'apply'), /changé/);
  assert.ok(fs.readFileSync(file).equals(Buffer.concat([original, Buffer.from('external-write')])));
  assert.equal(fs.readdirSync(path.dirname(file)).filter(name => name.endsWith('.tmp')).length, 0);
  manager.gameClosed = async () => { throw new Error('game running'); };
  await assert.rejects(() => manager.mutate(id, hash, 'apply'), /game running/);
});

test('undo keeps tactical fields changed independently after the mod', async t => {
  const { file, manager, id } = setup(t);
  await manager.mutate(id, sha256(fs.readFileSync(file)), 'apply');
  const blocks = decodeSave(fs.readFileSync(file)), at = 84 + 1116 + 140;
  blocks.data[at] = 2;
  fs.writeFileSync(file, encodeSave(blocks));
  const result = await manager.mutate(id, sha256(fs.readFileSync(file)), 'remove');
  assert.equal(result.preservedFields, 1);
  assert.equal(decodeSave(fs.readFileSync(file)).data[at], 2);
});

test('interrupted journal after save replacement recovers without losing the original undo data', async t => {
  const { file, manager, id } = setup(t), original = fs.readFileSync(file), saveJournal = manager.saveJournal.bind(manager);
  let writes = 0;
  manager.saveJournal = value => { if (++writes === 2) throw new Error('simulated power loss'); saveJournal(value); };
  await assert.rejects(() => manager.mutate(id, sha256(original), 'apply'), /power loss/);
  assert.equal(manager.list().saves[0].recoveryPending, true);
  assert.equal(manager.list().saves[0].installed, true);
  assert.equal(manager.inspect(id).installed, true);
  manager.saveJournal = saveJournal;
  await manager.mutate(id, sha256(fs.readFileSync(file)), 'remove');
  assert.ok(fs.readFileSync(file).equals(original));
});

test('process guard recognizes actual game variants and fails closed on unreadable task lists', () => {
  const row = name => `"${name}","123","Console","1","100 K"`;
  for (const name of ['FL_2026.exe', 'FL_2026 U.exe', 'FL 2027.exe', 'FL2026.exe', 'PES2021.exe', 'PES2021_Trial.exe', 'sider.exe']) {
    assert.throws(() => assertNoGameProcesses(`${row('explorer.exe')}\r\n${row(name)}`), /Fermez Football Life/);
  }
  assert.doesNotThrow(() => assertNoGameProcesses(`${row('System')}\r\n${row('explorer.exe')}`));
  for (const output of ['', 'ERROR: task list unavailable', `${row('explorer.exe')}\nmalformed row`]) assert.throws(() => assertNoGameProcesses(output), /Impossible|illisible/);
});

function changeSave(file, change) {
  const blocks = decodeSave(fs.readFileSync(file));
  change(blocks);
  fs.writeFileSync(file, encodeSave(blocks));
  return blocks;
}

function barcelona(file) {
  return changeSave(file, blocks => {
    blocks.data.fill(0, 84, 154); blocks.data.write('FC Barcelona', 84);
    blocks.data.writeUInt32LE(102080, 84 + 652); blocks.data.writeUInt32LE(102080, 1260084);
    blocks.data.fill(0, 1260088, 1260134); blocks.data.write('Hansi Flick', 1260088);
  });
}

test('undo preserves an independently edited formation as a whole, including previously untouched positions', async t => {
  const { file, manager, id } = setup(t), original = barcelona(file), at = 84 + 1116;
  await manager.mutate(id, sha256(fs.readFileSync(file)), 'apply');
  const installed = decodeSave(fs.readFileSync(file));
  assert.ok(!installed.data.subarray(at, at + 99).equals(original.data.subarray(at, at + 99)));
  const unchangedRole = Array.from({ length: 10 }, (_, i) => i + 1).find(i => original.data[at + i] === installed.data[at + i]);
  assert.notEqual(unchangedRole, undefined);
  const later = changeSave(file, blocks => { blocks.data[at + unchangedRole] = (blocks.data[at + unchangedRole] % 12) + 1; });
  const result = await manager.mutate(id, sha256(fs.readFileSync(file)), 'remove');
  const removed = decodeSave(fs.readFileSync(file));
  assert.ok(result.preservedFields > 1);
  assert.ok(removed.data.subarray(at, at + 99).equals(later.data.subarray(at, at + 99)));
  assert.equal(removed.data[at + 140], original.data[at + 140]);
});

test('reapplying and removing restores the latest independent formation without mixing it with an older one', async t => {
  const { file, manager, id } = setup(t), original = barcelona(file), at = 84 + 1116;
  await manager.mutate(id, sha256(fs.readFileSync(file)), 'apply');
  const later = changeSave(file, blocks => { blocks.data[at + 13] = 67; });
  await manager.mutate(id, sha256(fs.readFileSync(file)), 'apply');
  await manager.mutate(id, sha256(fs.readFileSync(file)), 'remove');
  const removed = decodeSave(fs.readFileSync(file));
  assert.ok(removed.data.subarray(at, at + 99).equals(later.data.subarray(at, at + 99)));
  for (const offset of [1260144, 1260304, 1260464]) assert.ok(removed.data.subarray(offset, offset + 99).equals(original.data.subarray(offset, offset + 99)));
});

test('failed atomic replacement leaves the original file intact and an uncommitted journal can be retried', async t => {
  const { file, manager, id } = setup(t), original = fs.readFileSync(file), rename = fs.renameSync;
  const stub = t.mock.method(fs, 'renameSync', (source, target) => {
    if (target === file) throw Object.assign(new Error('simulated sharing violation'), { code: 'EPERM' });
    return rename(source, target);
  });
  await assert.rejects(() => manager.mutate(id, sha256(original), 'apply'), /sharing violation/);
  assert.ok(fs.readFileSync(file).equals(original));
  assert.equal(manager.list().saves[0].installed, false);
  assert.equal(manager.inspect(id).installed, false);
  assert.equal(manager.list().saves[0].recoveryPending, true);
  assert.equal(fs.readdirSync(path.dirname(file)).filter(name => name.endsWith('.tmp')).length, 0);
  stub.mock.restore();
  await manager.mutate(id, sha256(original), 'apply');
  await manager.mutate(id, sha256(fs.readFileSync(file)), 'remove');
  assert.ok(fs.readFileSync(file).equals(original));
});

test('interrupted removal is shown as removed and cannot restore stale undo state on reinstall', async t => {
  const { file, manager, id } = setup(t), original = fs.readFileSync(file);
  await manager.mutate(id, sha256(original), 'apply');
  const saveJournal = manager.saveJournal.bind(manager);
  let writes = 0;
  manager.saveJournal = value => { if (++writes === 2) throw new Error('simulated power loss'); saveJournal(value); };
  await assert.rejects(() => manager.mutate(id, sha256(fs.readFileSync(file)), 'remove'), /power loss/);
  assert.ok(fs.readFileSync(file).equals(original));
  assert.equal(manager.list().saves[0].installed, false);
  assert.equal(manager.inspect(id).installed, false);
  manager.saveJournal = saveJournal;
  await manager.mutate(id, sha256(original), 'apply');
  await manager.mutate(id, sha256(fs.readFileSync(file)), 'remove');
  assert.ok(fs.readFileSync(file).equals(original));
});

test('damaged backup, invalid undo offsets and unknown interrupted states never modify the live save', async t => {
  const { file, manager, id } = setup(t), original = fs.readFileSync(file), hash = sha256(original);
  const backup = path.join(manager.root, `${hash}.save`), broken = Buffer.from(original); broken[9000000] ^= 1;
  fs.writeFileSync(backup, broken);
  await assert.rejects(() => manager.mutate(id, hash, 'apply'), /copie de sécurité/);
  assert.ok(fs.readFileSync(file).equals(original));
  fs.unlinkSync(backup);
  await manager.mutate(id, hash, 'apply');
  const installed = fs.readFileSync(file), state = manager.journal(id);
  manager.saveJournal({ ...state, originals: [...state.originals, [9000000, [0, 99]]] });
  await assert.rejects(() => manager.mutate(id, sha256(installed), 'remove'), /étrangers/);
  assert.ok(fs.readFileSync(file).equals(installed));
  manager.saveJournal({ ...state, pending: { beforeHash: 'a'.repeat(64), afterHash: 'b'.repeat(64), previous: state, next: state } });
  assert.match(manager.list().saves[0].error, /interrompue/);
  await assert.rejects(() => manager.mutate(id, sha256(installed), 'remove'), /interrompue/);
  assert.ok(fs.readFileSync(file).equals(installed));
});

test('an interrupted backup flush leaves no partial published backup and can be retried', async t => {
  const { file, manager, id } = setup(t), original = fs.readFileSync(file), hash = sha256(original);
  const stub = t.mock.method(fs, 'fsyncSync', () => { throw new Error('simulated disk flush failure'); });
  await assert.rejects(() => manager.mutate(id, hash, 'apply'), /flush failure/);
  assert.ok(fs.readFileSync(file).equals(original));
  assert.equal(fs.existsSync(path.join(manager.root, `${hash}.save`)), false);
  assert.deepEqual(fs.readdirSync(manager.root), []);
  stub.mock.restore();
  await manager.mutate(id, hash, 'apply');
  assert.equal(sha256(fs.readFileSync(path.join(manager.root, `${hash}.save`))), hash);
});

test('concurrent career writes are rejected while a process check is pending', async t => {
  let resume, checks = 0;
  const waiting = new Promise(resolve => { resume = resolve; });
  const { file, manager, id } = setup(t, async () => { if (++checks === 1) await waiting; });
  const hash = sha256(fs.readFileSync(file)), first = manager.mutate(id, hash, 'apply');
  await assert.rejects(() => manager.mutate(id, hash, 'apply'), /déjà en cours/);
  resume();
  await first;
  assert.equal(manager.list().saves[0].installed, true);
});

test('replaced player identity and earlier career dates are rejected without changing either save or journal', async t => {
  const { file, manager, id } = setup(t);
  await manager.mutate(id, sha256(fs.readFileSync(file)), 'apply');
  const installed = fs.readFileSync(file), state = manager.journal(id);
  for (const replace of [
    blocks => { blocks.description.fill(0, 128); blocks.description.write('Another Player\nTest FC / League\n24/10/2025', 128); },
    blocks => {
      for (const at of [11322908, 11516880]) blocks.data[at + 3] = 23;
      blocks.description.fill(0, 128); blocks.description.write('Synthetic Player\nTest FC / League\n23/10/2025', 128);
    },
  ]) {
    fs.writeFileSync(file, installed); changeSave(file, replace);
    const replacement = fs.readFileSync(file);
    assert.throws(() => manager.inspect(id), /remplacée ou rembobinée/);
    await assert.rejects(() => manager.mutate(id, sha256(replacement), 'remove'), /remplacée ou rembobinée/);
    assert.ok(fs.readFileSync(file).equals(replacement));
    assert.deepEqual(manager.journal(id), state);
  }
});

test('a same-day rewind of native results is rejected even when player identity and date still match', async t => {
  const { file, manager, id } = setup(t);
  changeSave(file, blocks => {
    for (const slot of [0, 1]) {
      const at = 84 + slot * 1680 + 744;
      blocks.data.writeUInt16LE(20, at); blocks.data[at + 3] = 2;
      if (slot === 0) { blocks.data[at + 2] = 6; blocks.data[at + 4] = 2; blocks.data.writeUInt32LE(2, at + 8); }
      else { blocks.data[at + 6] = 2; blocks.data.writeUInt32LE(2, at + 12); }
    }
  });
  await manager.mutate(id, sha256(fs.readFileSync(file)), 'apply');
  changeSave(file, blocks => {
    for (const slot of [0, 1]) blocks.data.fill(0, 84 + slot * 1680 + 746, 84 + slot * 1680 + 764);
  });
  const rewound = fs.readFileSync(file);
  await assert.rejects(() => manager.mutate(id, sha256(rewound), 'remove'), /résultats.*reculé/);
  assert.ok(fs.readFileSync(file).equals(rewound));
});
