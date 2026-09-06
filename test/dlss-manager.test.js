import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DLSSNR_NVIDIA_SHA256,
  DlssManager,
  LEGACY_DLSSNR_PATCHED_SHA256,
  parseRtxGeneration,
  readIniValue,
  updateIniSection,
} from "../server/dlss-manager.js";

test("lit et met à jour uniquement la section RenoDX DLSS", () => {
  const original = "[GENERAL]\r\nPresetPath=keep.ini\r\n\r\n[RENODX-DLSS]\r\nDirectNeuralRenderingEnabled=0\r\nDLSSQualityMode=1\r\n";
  const updated = updateIniSection(original, "RENODX-DLSS", {
    DirectNeuralRenderingEnabled: 1,
    DLSSQualityMode: 3,
    DLSSAutoExposure: 1,
  });
  assert.equal(readIniValue(updated, "RENODX-DLSS", "DirectNeuralRenderingEnabled"), "1");
  assert.equal(readIniValue(updated, "RENODX-DLSS", "DLSSQualityMode"), "3");
  assert.equal(readIniValue(updated, "RENODX-DLSS", "DLSSAutoExposure"), "1");
  assert.match(updated, /PresetPath=keep\.ini/);
});

test("écrit la clé RenoDX de correction d’interface et fusionne les doublons de casse", () => {
  // Relevé sur une installation réelle : STRYKER écrivait « UICorrectionMode »
  // là où RenoDX écrit « UiCorrectionMode ». Les deux lignes cohabitaient dans
  // la section, dont une avec une valeur que ReShade avait dédoublée.
  const original = [
    "[RENODX-DLSS]",
    "DirectNeuralRenderingUiCorrectionMode=0",
    "DirectNeuralRenderingEnabled=1",
    "DirectNeuralRenderingUICorrectionMode=2,2",
    "",
    "[SCREENSHOT]",
    "SavePath=keep",
  ].join("\r\n");

  const updated = updateIniSection(original, "RENODX-DLSS", {
    DirectNeuralRenderingUiCorrectionMode: 1,
    DirectNeuralRenderingEnabled: 1,
  });

  const lines = updated.split("\r\n");
  const correction = lines.filter((line) => /^DirectNeuralRendering[Uu]i?CorrectionMode=/i.test(line));
  assert.deepEqual(correction, ["DirectNeuralRenderingUiCorrectionMode=1"]);
  assert.equal(readIniValue(updated, "RENODX-DLSS", "DirectNeuralRenderingUiCorrectionMode"), "1");
  assert.match(updated, /\[SCREENSHOT\]\r\nSavePath=keep/);
});

test("configure une installation DLSS liée avec sauvegarde", (t) => {
  const gamePath = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-dlss-"));
  t.after(() => fs.rmSync(gamePath, { recursive: true, force: true }));
  for (const name of ["d3d11.dll", "renodx-dlss.addon64", "nvngx_dlss.dll", "nvngx_dlssnr.dll", "sl.interposer.dll"]) {
    fs.writeFileSync(path.join(gamePath, name), "fixture");
  }
  fs.writeFileSync(path.join(gamePath, "ReShade.ini"), "[GENERAL]\nPresetPath=keep.ini\n", "utf-8");
  const settings = { isLinked: true, gamePath };
  const manager = new DlssManager();

  const saved = manager.save(settings, { enabled: true, qualityMode: 3, autoExposure: true });
  assert.equal(saved.installed, true);
  assert.equal(saved.enabled, true);
  assert.equal(saved.qualityMode, 3);
  assert.equal(saved.autoExposure, true);
  assert.ok(fs.existsSync(`${path.join(gamePath, "ReShade.ini")}.stryker-dlss.bak`));
  assert.match(fs.readFileSync(path.join(gamePath, "ReShade.ini"), "utf-8"), /PresetPath=keep\.ini/);
  assert.throws(() => manager.save(settings, { qualityMode: 99 }), /invalide/i);
  assert.throws(() => manager.save(settings, { enabled: true, unexpected: true }), /non autorisé/i);
});

test("laisse F10 à ReShade tant que le contrôleur STRYKER n’est pas installé, puis le lui rend", (t) => {
  const gamePath = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-overlay-"));
  t.after(() => fs.rmSync(gamePath, { recursive: true, force: true }));
  for (const name of ["d3d11.dll", "renodx-dlss.addon64", "nvngx_dlss.dll", "nvngx_dlssnr.dll", "sl.interposer.dll"]) {
    fs.writeFileSync(path.join(gamePath, name), "fixture");
  }
  const configPath = path.join(gamePath, "ReShade.ini");
  fs.writeFileSync(configPath, "[GENERAL]\nPresetPath=keep.ini\n", "utf-8");
  const settings = { isLinked: true, gamePath };
  const manager = new DlssManager();

  // Sans le contrôleur installé, STRYKER ne répond pas à F10 : déplacer
  // l’overlay laisserait la touche sans effet.
  const withoutPanel = manager.configureOverlay(settings);
  assert.equal(readIniValue(fs.readFileSync(configPath, "utf-8"), "INPUT", "KeyOverlay"), "121,0,0,0");
  assert.equal(withoutPanel.overlay.configured, true);
  assert.equal(withoutPanel.overlay.shortcut, "F10");
  assert.equal(withoutPanel.overlay.advancedShortcut, "F10");

  const withHotkey = manager.configureOverlay(settings, { strykerHotkey: true });
  assert.equal(readIniValue(fs.readFileSync(configPath, "utf-8"), "INPUT", "KeyOverlay"), "36,0,0,0");
  assert.equal(withHotkey.overlay.shortcut, "F10");
  assert.equal(withHotkey.overlay.advancedShortcut, "Origine");

  // Le thème STRYKER et le fichier d’origine survivent au déplacement.
  assert.match(fs.readFileSync(configPath, "utf-8"), /PresetPath=keep\.ini/);
  assert.ok(fs.existsSync(`${configPath}.stryker-ui.bak`));
  assert.match(fs.readFileSync(`${configPath}.stryker-ui.bak`, "utf-8"), /PresetPath=keep\.ini/);
});

test("détecte les générations GeForce RTX prises en charge", () => {
  assert.equal(parseRtxGeneration("NVIDIA GeForce RTX 2080 Ti"), "rtx20");
  assert.equal(parseRtxGeneration("NVIDIA GeForce RTX 3080"), "rtx30");
  assert.equal(parseRtxGeneration("NVIDIA GeForce RTX 4070 SUPER"), "rtx40");
  assert.equal(parseRtxGeneration("NVIDIA GeForce RTX 5060"), "rtx50");
  assert.equal(parseRtxGeneration("NVIDIA GeForce GTX 1080"), "unsupported");
});

test("installe le patch RTX 20/30/40 vérifié puis restaure l’original", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-dlss-legacy-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const gamePath = path.join(root, "game");
  const sourcePath = path.join(root, "pin", "nvngx_dlssnr.dll");
  fs.mkdirSync(gamePath, { recursive: true });
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(path.join(gamePath, "nvngx_dlssnr.dll"), "original");
  fs.writeFileSync(sourcePath, "patched");
  const fakeHasher = (filePath) => fs.readFileSync(filePath, "utf-8") === "patched"
    ? LEGACY_DLSSNR_PATCHED_SHA256
    : DLSSNR_NVIDIA_SHA256;
  const manager = new DlssManager({
    gpuDetector: () => ({ name: "NVIDIA GeForce RTX 3080", generation: "rtx30" }),
    fileHasher: fakeHasher,
    legacyPatchSize: Buffer.byteLength("patched"),
  });
  const settings = { isLinked: true, gamePath };

  const installed = manager.installLegacyPatch(settings, sourcePath);
  assert.equal(installed.compatibility.patchInstalled, true);
  assert.equal(fs.readFileSync(path.join(gamePath, "nvngx_dlssnr.dll"), "utf-8"), "patched");
  assert.equal(fs.readFileSync(`${path.join(gamePath, "nvngx_dlssnr.dll")}.stryker-original.bak`, "utf-8"), "original");

  const restored = manager.restoreLegacyPatch(settings);
  assert.equal(restored.compatibility.patchInstalled, false);
  assert.equal(restored.compatibility.runtimeState, "nvidia-original");
  assert.equal(fs.readFileSync(path.join(gamePath, "nvngx_dlssnr.dll"), "utf-8"), "original");
});

test("refuse le patch de compatibilité sur une RTX 50", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-dlss-rtx50-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const gamePath = path.join(root, "game");
  const sourcePath = path.join(root, "nvngx_dlssnr.dll");
  fs.mkdirSync(gamePath, { recursive: true });
  fs.writeFileSync(path.join(gamePath, "nvngx_dlssnr.dll"), "original");
  fs.writeFileSync(sourcePath, "patched");
  const manager = new DlssManager({
    gpuDetector: () => ({ name: "NVIDIA GeForce RTX 5060", generation: "rtx50" }),
    fileHasher: () => DLSSNR_NVIDIA_SHA256,
    legacyPatchSize: Buffer.byteLength("patched"),
  });
  assert.throws(() => manager.installLegacyPatch({ isLinked: true, gamePath }, sourcePath), /RTX 50/i);
  assert.equal(fs.readFileSync(path.join(gamePath, "nvngx_dlssnr.dll"), "utf-8"), "original");
});
