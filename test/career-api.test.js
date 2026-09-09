import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { startServer } from '../server/index.js';
import { CareerManager } from '../server/career/manager.js';
import { careerFixture } from './helpers/career.js';

test('career API requires a session and linked FL26, applies and removes through the full HTTP path', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stryker-career-api-'));
  const saves = path.join(root, 'saves'); fs.mkdirSync(saves);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(saves, 'BL00000000'), careerFixture().encrypted);
  const service = await startServer({ rootDir: root, dataRoot: path.join(root, 'app'), port: 0 });
  t.after(() => service.close());
  service.runtime.careerManager = new CareerManager({ dataRoot: path.join(root, 'app'), directories: [saves], gameClosed: async () => {} });
  const base = `http://127.0.0.1:${service.port}/api`;
  const { token } = await (await fetch(`${base}/session`)).json();
  const { saves: list } = await (await fetch(`${base}/careers`)).json();
  assert.equal(list.length, 1);
  let preview = await (await fetch(`${base}/careers/${list[0].id}`)).json();
  const route = `${base}/careers/${list[0].id}`;
  const mutate = (action, session = true) => fetch(`${route}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(session ? { 'X-STRYKER-Token': token } : {}) }, body: JSON.stringify({ hash: preview.hash }) });
  assert.equal((await mutate('apply', false)).status, 403);
  assert.equal((await mutate('apply')).status, 400);
  service.runtime.store.update(s => { s.settings.isLinked = true; s.settings.detectedVersion = 'SP Football Life 2026'; });
  assert.equal((await mutate('apply')).status, 200);
  preview = await (await fetch(route)).json();
  assert.equal(preview.installed, true);
  assert.equal((await mutate('remove')).status, 200);
});

test('public Hub never exposes local careers or their contents', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stryker-career-public-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const service = await startServer({ rootDir: root, dataRoot: path.join(root, 'app'), port: 0, publicHub: true, adminToken: 'b'.repeat(48) });
  t.after(() => service.close());
  service.runtime.careerManager = { list: () => { throw new Error('Must not access local careers'); } };
  assert.equal((await fetch(`http://127.0.0.1:${service.port}/api/careers`)).status, 404);
});
