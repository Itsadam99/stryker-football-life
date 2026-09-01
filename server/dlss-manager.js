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
    const allowedKeys = new Set(["enabled", "qualityMode", "autoExposure"]);
    if (Object.keys(input).some((key) => !allowedKeys.has(key))) throw new Error("Paramètre DLSS non autorisé.");

    const qualityMode = input.qualityMode === undefined ? current.qualityMode : Number(input.qualityMode);
    if (!Number.isInteger(qualityMode) || !DLSS_QUALITY_MODES.some((item) => item.value === qualityMode)) {
      throw new Error("Niveau de qualité DLSS invalide.");
    }
    const enabled = input.enabled === undefined ? current.enabled : input.enabled;
    const autoExposure = input.autoExposure === undefined ? current.autoExposure : input.autoExposure;
    if (typeof enabled !== "boolean" || typeof autoExposure !== "boolean") throw new Error("Réglage DLSS invalide.");

    const configPath = this.configPath(settings);
    const original = fs.readFileSync(configPath, "utf-8");
    fs.copyFileSync(configPath, `${configPath}.stryker-dlss.bak`);
    let updated = updateIniSection(original, "ADDON", { LoadFromDllMain: "renodx-dlss.addon64" });
    updated = updateIniSection(updated, "RENODX-DLSS", {
      DirectNeuralRenderingEnabled: enabled ? 1 : 0,
      DirectNeuralRenderingForceNgxCore: 1,
      DirectNeuralRenderingHookPoint: 2,
      DirectNeuralRenderingHookPointOrder: 2,
      DLSSAutoExposure: autoExposure ? 1 : 0,
      DLSSPath: "nvngx_dlss.dll",
      DLSSQualityMode: qualityMode,
      StreamlinePath: "sl.interposer.dll",
    });
    atomicWrite(configPath, updated);
    return this.status(settings);
  }
}
