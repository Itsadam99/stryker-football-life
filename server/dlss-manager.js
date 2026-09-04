import crypto from "crypto";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

export const LEGACY_DLSSNR_FILE = "nvngx_dlssnr.dll";
export const LEGACY_DLSSNR_VERSION = "310.8.0.0";
export const LEGACY_DLSSNR_SIZE = 165840496;
export const LEGACY_DLSSNR_PATCHED_SHA256 = "e67dee209320cdafe0e93e45675d7aa34323a53acc57a72b2e40a181581c989a";
export const DLSSNR_NVIDIA_SHA256 = "e16bcf15e16e13f527491cdf7845b2fe6521a738d8f7c9c721866a8496e1fc8e";
export const LEGACY_DLSSNR_PIN_URL = "https://discord.com/channels/1408098019194310818/1543976771920330884";

export const DLSS_QUALITY_MODES = [
  { value: 0, id: "default", label: "Jeu / automatique" },
  { value: 1, id: "performance", label: "Performance" },
  { value: 2, id: "balanced", label: "Équilibré" },
  { value: 3, id: "quality", label: "Qualité" },
  { value: 4, id: "ultra-performance", label: "Ultra Performance" },
  { value: 5, id: "ultra-quality", label: "Ultra Qualité" },
  { value: 6, id: "dlaa", label: "DLAA" },
];

const REQUIRED_FILES = [
  "ReShade.ini",
  "renodx-dlss.addon64",
  "nvngx_dlss.dll",
  "nvngx_dlssnr.dll",
  "sl.interposer.dll",
];

const STRYKER_OVERLAY_KEY = "121,0,0,0"; // F10
const STRYKER_STYLE = {
  StyleIndex: 3,
  FontSize: 16,
  Alpha: 1,
  FrameRounding: 7,
  GrabRounding: 7,
  PopupRounding: 8,
  ScrollbarRounding: 8,
  TabRounding: 7,
  WindowRounding: 10,
  WindowBg: "0.025,0.018,0.027,0.97",
  ChildBg: "0.055,0.035,0.060,0.94",
  PopupBg: "0.045,0.025,0.050,0.98",
  Border: "0.443,0.075,0.380,0.72",
  Text: "0.960,0.940,0.960,1.000",
  TextDisabled: "0.500,0.430,0.500,1.000",
  FrameBg: "0.090,0.055,0.100,1.000",
  FrameBgHovered: "0.240,0.065,0.220,1.000",
  FrameBgActive: "0.443,0.075,0.380,1.000",
  TitleBg: "0.040,0.025,0.045,1.000",
  TitleBgActive: "0.270,0.045,0.235,1.000",
  CheckMark: "0.850,0.310,0.760,1.000",
  SliderGrab: "0.710,0.150,0.620,1.000",
  SliderGrabActive: "0.940,0.420,0.850,1.000",
  Button: "0.443,0.075,0.380,0.88",
  ButtonHovered: "0.650,0.120,0.560,1.000",
  ButtonActive: "0.820,0.210,0.710,1.000",
  Header: "0.443,0.075,0.380,0.72",
  HeaderHovered: "0.650,0.120,0.560,0.88",
  HeaderActive: "0.820,0.210,0.710,1.000",
  Tab: "0.160,0.045,0.145,1.000",
  TabHovered: "0.650,0.120,0.560,1.000",
  TabSelected: "0.443,0.075,0.380,1.000",
};

const DLSS_DEFAULTS = {
  intensity: 1,
  autoMask: true,
  diffuseWhiteNits: 500,
  uiCorrectionMode: 2,
  globalToneStrength: 1,
  localToneStrength: 1,
  localStructureStrength: 1,
  skinStructureStrength: 1,
};

function readBoolean(content, section, key, fallback = false) {
  const value = readIniValue(content, section, key);
  return value === undefined ? fallback : value === "1";
}

function readNumber(content, section, key, fallback) {
  const value = Number(readIniValue(content, section, key));
  return Number.isFinite(value) ? value : fallback;
}

function boundedNumber(value, minimum, maximum, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} doit être compris entre ${minimum} et ${maximum}.`);
  }
  return parsed;
}

function sectionBounds(lines, sectionName) {
  const wanted = sectionName.toLowerCase();
  let start = -1;
  let end = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].trim().match(/^\[([^\]]+)\]$/);
    if (!match) continue;
    if (start >= 0) {
      end = index;
      break;
    }
    if (match[1].trim().toLowerCase() === wanted) start = index;
  }
  return { start, end };
}

export function readIniValue(content, sectionName, key) {
  const lines = String(content || "").split(/\r?\n/);
  const { start, end } = sectionBounds(lines, sectionName);
  if (start < 0) return undefined;
  const wanted = key.toLowerCase();
  for (let index = start + 1; index < end; index += 1) {
    const match = lines[index].match(/^\s*([^=;#]+?)\s*=\s*(.*?)\s*$/);
    if (match && match[1].trim().toLowerCase() === wanted) return match[2];
  }
  return undefined;
}

export function updateIniSection(content, sectionName, values) {
  const lines = String(content || "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const normalizedValues = new Map(Object.entries(values).map(([key, value]) => [key.toLowerCase(), { key, value: String(value) }]));
  let { start, end } = sectionBounds(lines, sectionName);

  if (start < 0) {
    while (lines.length > 0 && lines.at(-1) === "") lines.pop();
    if (lines.length > 0) lines.push("");
    lines.push(`[${sectionName}]`);
    for (const { key, value } of normalizedValues.values()) lines.push(`${key}=${value}`);
    lines.push("");
    return lines.join("\r\n");
  }

  const seen = new Set();
  for (let index = start + 1; index < end; index += 1) {
    const match = lines[index].match(/^\s*([^=;#]+?)\s*=/);
    if (!match) continue;
    const normalizedKey = match[1].trim().toLowerCase();
    const replacement = normalizedValues.get(normalizedKey);
    if (!replacement) continue;
    lines[index] = `${replacement.key}=${replacement.value}`;
    seen.add(normalizedKey);
  }
  const missing = [...normalizedValues.entries()].filter(([key]) => !seen.has(key)).map(([, item]) => `${item.key}=${item.value}`);
  if (missing.length > 0) lines.splice(end, 0, ...missing);
  return lines.join("\r\n");
}

function atomicWrite(filePath, content) {
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tempPath, content, "utf-8");
  try {
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    if (!["EEXIST", "EPERM", "EACCES"].includes(error.code)) throw error;
    fs.copyFileSync(tempPath, filePath);
    fs.unlinkSync(tempPath);
  }
}

function hashFile(filePath) {
  const hash = crypto.createHash("sha256");
  const descriptor = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest("hex");
}

function atomicCopy(sourcePath, targetPath) {
  const tempPath = path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`);
  fs.copyFileSync(sourcePath, tempPath);
  try {
    fs.copyFileSync(tempPath, targetPath);
  } finally {
    if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
  }
}

export function parseRtxGeneration(name) {
  const normalized = String(name || "").trim();
  const match = normalized.match(/\bRTX\s*(20|30|40|50)\d{2}\b/i);
  return match ? `rtx${match[1]}` : normalized ? "unsupported" : "unknown";
}

export function detectNvidiaGpu() {
  const executable = process.platform === "win32" && process.env.SystemRoot
    ? path.join(process.env.SystemRoot, "System32", "nvidia-smi.exe")
    : "nvidia-smi";
  try {
    const output = execFileSync(executable, ["--query-gpu=name", "--format=csv,noheader,nounits"], {
      encoding: "utf-8",
      windowsHide: true,
      timeout: 5000,
    });
    const names = output.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    const name = names.find((value) => /^NVIDIA\s+GeForce\s+RTX/i.test(value)) || names[0] || "";
    return { name, generation: parseRtxGeneration(name) };
  } catch {
    return { name: "GPU NVIDIA non détecté", generation: "unknown" };
  }
}

export class DlssManager {
  constructor({ gpuDetector = detectNvidiaGpu, fileHasher = hashFile, legacyPatchSize = LEGACY_DLSSNR_SIZE } = {}) {
    this.gpuDetector = gpuDetector;
    this.fileHasher = fileHasher;
    this.legacyPatchSize = legacyPatchSize;
  }

  configPath(settings) {
    if (!settings?.isLinked || !settings.gamePath) return "";
    return path.join(path.resolve(settings.gamePath), "ReShade.ini");
  }

  status(settings) {
    const gamePath = settings?.isLinked && settings.gamePath ? path.resolve(settings.gamePath) : "";
    const gpu = this.gpuDetector();
    if (!gamePath) {
      return {
        linked: false, installed: false, configurable: false, enabled: false,
        qualityMode: 0, qualityId: "default", autoExposure: false,
        ...DLSS_DEFAULTS,
        overlay: { configured: false, shortcut: "F10", hotReload: true, nativePanelDetected: false },
        missingFiles: REQUIRED_FILES, configPath: "", backupPath: "",
        compatibility: this.compatibilityStatus("", gpu),
      };
    }

    const configPath = this.configPath(settings);
    const missingFiles = REQUIRED_FILES.filter((name) => !fs.existsSync(path.join(gamePath, name)));
    const injectorPresent = ["d3d11.dll", "dxgi.dll"].some((name) => fs.existsSync(path.join(gamePath, name)));
    if (!injectorPresent) missingFiles.push("d3d11.dll ou dxgi.dll");
    const content = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf-8") : "";
    const rawMode = Number.parseInt(readIniValue(content, "RENODX-DLSS", "DLSSQualityMode") || "0", 10);
    const mode = DLSS_QUALITY_MODES.find((item) => item.value === rawMode) || DLSS_QUALITY_MODES[0];
    return {
      linked: true,
      installed: missingFiles.length === 0,
      configurable: fs.existsSync(configPath),
      enabled: readIniValue(content, "RENODX-DLSS", "DirectNeuralRenderingEnabled") === "1",
      qualityMode: mode.value,
      qualityId: mode.id,
      autoExposure: readIniValue(content, "RENODX-DLSS", "DLSSAutoExposure") === "1",
      intensity: readNumber(content, "RENODX-DLSS", "DirectNeuralRenderingIntensity", DLSS_DEFAULTS.intensity),
      autoMask: readBoolean(content, "RENODX-DLSS", "DirectNeuralRenderingAutoMask", DLSS_DEFAULTS.autoMask),
      diffuseWhiteNits: readNumber(content, "RENODX-DLSS", "DirectNeuralRenderingDiffuseWhiteNits", DLSS_DEFAULTS.diffuseWhiteNits),
      uiCorrectionMode: readNumber(content, "RENODX-DLSS", "DirectNeuralRenderingUICorrectionMode", DLSS_DEFAULTS.uiCorrectionMode),
      globalToneStrength: readNumber(content, "RENODX-DLSS", "DirectNeuralRenderingGlobalToneStrength", DLSS_DEFAULTS.globalToneStrength),
      localToneStrength: readNumber(content, "RENODX-DLSS", "DirectNeuralRenderingLocalToneStrength", DLSS_DEFAULTS.localToneStrength),
      localStructureStrength: readNumber(content, "RENODX-DLSS", "DirectNeuralRenderingLocalStructureStrength", DLSS_DEFAULTS.localStructureStrength),
      skinStructureStrength: readNumber(content, "RENODX-DLSS", "DirectNeuralRenderingSkinStructureStrength", DLSS_DEFAULTS.skinStructureStrength),
      overlay: {
        configured: readIniValue(content, "INPUT", "KeyOverlay") === STRYKER_OVERLAY_KEY
          && ["3", "4"].includes(readIniValue(content, "STYLE", "StyleIndex")),
        shortcut: "F10",
        hotReload: true,
        nativePanelDetected: String(readIniValue(content, "OVERLAY", "Window") || "").includes("RenoDX DLSS"),
      },
      missingFiles,
      configPath,
      backupPath: `${configPath}.stryker-dlss.bak`,
      compatibility: this.compatibilityStatus(gamePath, gpu),
    };
  }

  compatibilityStatus(gamePath, gpu = this.gpuDetector()) {
    const runtimePath = gamePath ? path.join(gamePath, LEGACY_DLSSNR_FILE) : "";
    const backupPath = runtimePath ? `${runtimePath}.stryker-original.bak` : "";
    let runtimeHash = "";
    let runtimeState = "missing";
    if (runtimePath && fs.existsSync(runtimePath) && fs.statSync(runtimePath).isFile()) {
      runtimeHash = this.fileHasher(runtimePath);
      runtimeState = runtimeHash === LEGACY_DLSSNR_PATCHED_SHA256
        ? "legacy-patched"
        : runtimeHash === DLSSNR_NVIDIA_SHA256 ? "nvidia-original" : "custom";
    }
    const legacyGeneration = ["rtx20", "rtx30", "rtx40"].includes(gpu.generation);
    return {
      gpuName: gpu.name,
      gpuGeneration: gpu.generation,
      supported: ["rtx20", "rtx30", "rtx40", "rtx50"].includes(gpu.generation),
      needsLegacyPatch: legacyGeneration,
      patchInstalled: runtimeState === "legacy-patched",
      runtimeState,
      runtimeHash,
      runtimePath,
      pinnedVersion: LEGACY_DLSSNR_VERSION,
      pinnedHash: LEGACY_DLSSNR_PATCHED_SHA256,
      pinnedSourceUrl: LEGACY_DLSSNR_PIN_URL,
      backupPath,
      canRestore: Boolean(backupPath && fs.existsSync(backupPath)),
    };
  }

  installLegacyPatch(settings, sourcePath) {
    const current = this.status(settings);
    if (!current.linked) throw new Error("Liez Football Life avant d’installer la compatibilité RTX.");
    if (!["rtx20", "rtx30", "rtx40"].includes(current.compatibility.gpuGeneration)) {
      if (current.compatibility.gpuGeneration === "rtx50") {
        throw new Error("Votre RTX 50 utilise déjà la branche Blackwell d’origine : ce patch ne doit pas être installé.");
      }
      throw new Error("Aucune GeForce RTX 20, 30 ou 40 compatible n’a été détectée.");
    }
    if (!sourcePath || typeof sourcePath !== "string") throw new Error("Sélectionnez la DLL épinglée nvngx_dlssnr.dll.");
    const resolvedSource = path.resolve(sourcePath);
    if (path.basename(resolvedSource).toLowerCase() !== LEGACY_DLSSNR_FILE || !fs.existsSync(resolvedSource) || !fs.statSync(resolvedSource).isFile()) {
      throw new Error("Le fichier sélectionné doit être nvngx_dlssnr.dll.");
    }
    const sourceSize = fs.statSync(resolvedSource).size;
    const sourceHash = this.fileHasher(resolvedSource);
    if (sourceSize !== this.legacyPatchSize || sourceHash !== LEGACY_DLSSNR_PATCHED_SHA256) {
      throw new Error(`DLL refusée : utilisez exactement la version épinglée ${LEGACY_DLSSNR_VERSION} (SHA-256 ${LEGACY_DLSSNR_PATCHED_SHA256}).`);
    }

    const targetPath = current.compatibility.runtimePath;
    if (!fs.existsSync(targetPath)) throw new Error("La DLL nvngx_dlssnr.dll d’origine est absente du dossier du jeu.");
    if (current.compatibility.patchInstalled) return current;
    const backupPath = current.compatibility.backupPath;
    if (!fs.existsSync(backupPath)) fs.copyFileSync(targetPath, backupPath);
    atomicCopy(resolvedSource, targetPath);
    if (this.fileHasher(targetPath) !== LEGACY_DLSSNR_PATCHED_SHA256) {
      atomicCopy(backupPath, targetPath);
      throw new Error("La vérification après copie a échoué ; la DLL d’origine a été restaurée.");
    }
    return this.status(settings);
  }

  restoreLegacyPatch(settings) {
    const current = this.status(settings);
    if (!current.linked) throw new Error("Liez Football Life avant de restaurer la DLL DLSS.");
    const { backupPath, runtimePath } = current.compatibility;
    if (!backupPath || !fs.existsSync(backupPath)) throw new Error("Aucune sauvegarde de la DLL DLSS d’origine n’est disponible.");
    if (this.fileHasher(backupPath) === LEGACY_DLSSNR_PATCHED_SHA256) throw new Error("La sauvegarde est invalide : elle contient aussi la version patchée.");
    atomicCopy(backupPath, runtimePath);
    return this.status(settings);
  }

  save(settings, input = {}) {
    const current = this.status(settings);
    if (!current.linked) throw new Error("Liez Football Life avant de configurer DLSS.");
    if (!current.configurable) throw new Error("ReShade.ini est introuvable. Installez d’abord ReShade et RenoDX DLSS.");
    const allowedKeys = new Set([
      "enabled", "qualityMode", "autoExposure", "intensity", "autoMask", "diffuseWhiteNits",
      "uiCorrectionMode", "globalToneStrength", "localToneStrength", "localStructureStrength", "skinStructureStrength",
    ]);
    if (Object.keys(input).some((key) => !allowedKeys.has(key))) throw new Error("Paramètre DLSS non autorisé.");

    const qualityMode = input.qualityMode === undefined ? current.qualityMode : Number(input.qualityMode);
    if (!Number.isInteger(qualityMode) || !DLSS_QUALITY_MODES.some((item) => item.value === qualityMode)) {
      throw new Error("Niveau de qualité DLSS invalide.");
    }
    const enabled = input.enabled === undefined ? current.enabled : input.enabled;
    const autoExposure = input.autoExposure === undefined ? current.autoExposure : input.autoExposure;
    const autoMask = input.autoMask === undefined ? current.autoMask : input.autoMask;
    if (typeof enabled !== "boolean" || typeof autoExposure !== "boolean" || typeof autoMask !== "boolean") throw new Error("Réglage DLSS invalide.");
    const intensity = boundedNumber(input.intensity ?? current.intensity, 0, 1, "L’intensité Neural Rendering");
    const diffuseWhiteNits = boundedNumber(input.diffuseWhiteNits ?? current.diffuseWhiteNits, 80, 1000, "Le blanc diffus");
    const uiCorrectionMode = Number(input.uiCorrectionMode ?? current.uiCorrectionMode);
    if (![0, 1, 2].includes(uiCorrectionMode)) throw new Error("Mode de correction de l’interface invalide.");
    const globalToneStrength = boundedNumber(input.globalToneStrength ?? current.globalToneStrength, 0, 1, "La force tonale globale");
    const localToneStrength = boundedNumber(input.localToneStrength ?? current.localToneStrength, 0, 1, "La force tonale locale");
    const localStructureStrength = boundedNumber(input.localStructureStrength ?? current.localStructureStrength, 0, 1, "La structure locale");
    const skinStructureStrength = boundedNumber(input.skinStructureStrength ?? current.skinStructureStrength, 0, 1, "La structure des visages");

    const configPath = this.configPath(settings);
    const original = fs.readFileSync(configPath, "utf-8");
    fs.copyFileSync(configPath, `${configPath}.stryker-dlss.bak`);
    let updated = updateIniSection(original, "ADDON", { LoadFromDllMain: "renodx-dlss.addon64" });
    updated = updateIniSection(updated, "RENODX-DLSS", {
      DirectNeuralRenderingEnabled: enabled ? 1 : 0,
      DirectNeuralRenderingForceNgxCore: 1,
      DirectNeuralRenderingIntensity: intensity,
      DirectNeuralRenderingAutoMask: autoMask ? 1 : 0,
      DirectNeuralRenderingDiffuseWhiteNits: diffuseWhiteNits,
      DirectNeuralRenderingUICorrectionMode: uiCorrectionMode,
      DirectNeuralRenderingGlobalToneStrength: globalToneStrength,
      DirectNeuralRenderingLocalToneStrength: localToneStrength,
      DirectNeuralRenderingLocalStructureStrength: localStructureStrength,
      DirectNeuralRenderingSkinStructureStrength: skinStructureStrength,
      DLSSAutoExposure: autoExposure ? 1 : 0,
      DLSSPath: "nvngx_dlss.dll",
      DLSSQualityMode: qualityMode,
      StreamlinePath: "sl.interposer.dll",
    });
    atomicWrite(configPath, updated);
    return this.status(settings);
  }

  configureOverlay(settings) {
    const current = this.status(settings);
    if (!current.linked) throw new Error("Liez Football Life avant de configurer le panneau DLSS.");
    if (!current.configurable) throw new Error("ReShade.ini est introuvable. Installez d’abord RenoDX DLSS.");
    const configPath = this.configPath(settings);
    let updated = fs.readFileSync(configPath, "utf-8");
    fs.copyFileSync(configPath, `${configPath}.stryker-ui.bak`);
    updated = updateIniSection(updated, "INPUT", { KeyOverlay: STRYKER_OVERLAY_KEY });
    updated = updateIniSection(updated, "ADDON", { LoadFromDllMain: "renodx-dlss.addon64" });
    updated = updateIniSection(updated, "STYLE", STRYKER_STYLE);
    atomicWrite(configPath, updated);
    return this.status(settings);
  }
}
