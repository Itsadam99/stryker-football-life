import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { UpdateManager, readConfiguredFeed } from "../electron/update-manager.mjs";

class FakeUpdater extends EventEmitter {
  async checkForUpdates() {
    this.emit("update-available", { version: "9.9.9" });
    return { updateInfo: { version: "9.9.9" } };
  }

  async downloadUpdate() {
    this.emit("download-progress", { percent: 42 });
    this.emit("update-downloaded", { version: "9.9.9" });
    return [];
  }

  quitAndInstall() {
    this.didInstall = true;
  }
}

test("active le flux HTTPS publié et suit le cycle complet d’une mise à jour", async (t) => {
  const resources = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-update-"));
  t.after(() => fs.rmSync(resources, { recursive: true, force: true }));
  fs.writeFileSync(path.join(resources, "app-update.yml"), "provider: generic\nurl: https://updates.example.org/stryker/windows\n");
  assert.deepEqual(readConfiguredFeed(resources), {
    configured: true,
    url: "https://updates.example.org/stryker/windows",
  });

  const updater = new FakeUpdater();
  const manager = new UpdateManager({ currentVersion: "3.4.0", isPackaged: true, resourcesPath: resources, platform: "win32", updater });
  manager.start();
  await manager.check();
  assert.equal(manager.status().state, "available");
  assert.equal(manager.status().availableVersion, "9.9.9");
  await manager.download();
  assert.equal(manager.status().state, "ready");
  assert.equal(manager.status().progress, 100);
  manager.install();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(updater.didInstall, true);
});

test("désactive proprement un flux de développement non publié", (t) => {
  const resources = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-update-disabled-"));
  t.after(() => fs.rmSync(resources, { recursive: true, force: true }));
  fs.writeFileSync(path.join(resources, "app-update.yml"), "provider: generic\nurl: https://updates.stryker.invalid/windows\n");
  assert.equal(readConfiguredFeed(resources).configured, false);
  const manager = new UpdateManager({ currentVersion: "3.4.0", isPackaged: true, resourcesPath: resources, platform: "win32", updater: new FakeUpdater() });
  assert.equal(manager.status().state, "disabled");
  assert.equal(manager.status().updaterConfigured, false);
});

test("previent le processus principal quand la mise a jour est prete", async (t) => {
  const resources = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-update-ready-"));
  t.after(() => fs.rmSync(resources, { recursive: true, force: true }));
  fs.writeFileSync(path.join(resources, "app-update.yml"), "provider: generic\nurl: https://updates.example.org/stryker/windows\n");

  const updater = new FakeUpdater();
  const announced = [];
  const manager = new UpdateManager({
    currentVersion: "3.8.1",
    isPackaged: true,
    resourcesPath: resources,
    platform: "win32",
    updater,
    onReady: (version) => announced.push(version),
  });
  manager.start();

  // Le telechargement doit demarrer seul : c'est ce qui rend la mise a jour
  // disponible au redemarrage sans clic prealable.
  assert.equal(updater.autoDownload, true);
  assert.equal(updater.autoInstallOnAppQuit, true);

  await manager.check();
  await manager.download();
  assert.deepEqual(announced, ["9.9.9"]);
});

test("une boite de dialogue en echec ne casse pas le suivi de mise a jour", async (t) => {
  const resources = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-update-throw-"));
  t.after(() => fs.rmSync(resources, { recursive: true, force: true }));
  fs.writeFileSync(path.join(resources, "app-update.yml"), "provider: generic\nurl: https://updates.example.org/stryker/windows\n");

  const manager = new UpdateManager({
    currentVersion: "3.8.1",
    isPackaged: true,
    resourcesPath: resources,
    platform: "win32",
    updater: new FakeUpdater(),
    onReady: () => { throw new Error("fenetre indisponible"); },
  });
  manager.start();
  await manager.check();
  await manager.download();
  assert.equal(manager.status().state, "ready");
});
