import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { assertPathInside, sanitizeSegment, toWindowsPath } from "./paths.js";
import { adaptLuaPaths } from "./lua-paths.js";

const MANAGED_START = "; >>> STRYKER MANAGED MODS >>>";
const MANAGED_END = "; <<< STRYKER MANAGED MODS <<<";

function fileHash(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function atomicWriteText(filePath, value) {
  const directory = path.dirname(filePath);
  const tempPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tempPath, value, "utf-8");
  try {
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    if (!["EEXIST", "EPERM", "EACCES"].includes(error.code)) throw error;
    fs.copyFileSync(tempPath, filePath);
    fs.unlinkSync(tempPath);
  }
}

function atomicCopyFile(source, destination) {
  const directory = path.dirname(destination);
  fs.mkdirSync(directory, { recursive: true });
  const tempPath = path.join(directory, `.${path.basename(destination)}.${process.pid}.${Date.now()}.${crypto.randomBytes(3).toString("hex")}.tmp`);
  fs.copyFileSync(source, tempPath);
  try {
    fs.renameSync(tempPath, destination);
  } catch (error) {
    if (!["EEXIST", "EPERM", "EACCES"].includes(error.code)) throw error;
    fs.copyFileSync(tempPath, destination);
    fs.unlinkSync(tempPath);
  }
}

function listRegularFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Les liens symboliques ne sont pas acceptés dans les données Sider.");
      if (entry.isDirectory()) stack.push(fullPath);
      if (entry.isFile()) files.push(fullPath);
    }
  }
  return files;
}

export function isKitMap(value) { return /^content\/(kits|kit-server)\/map\.txt$/i.test(value); }

function normalizeSiderDataTarget(value) {
  const normalized = String(value || "").replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
  if (normalized.toLowerCase() !== "content") throw new Error("La cible des données Sider doit être le dossier content.");
  return normalized;
}

function inlineComment(value) {
  return String(value || "").replace(/[\r\n\u0000-\u001f\u007f]+/g, " ").slice(0, 240);
}

function readSiderSetting(content, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...String(content || "").matchAll(new RegExp(`^\\s*${escaped}\\s*=\\s*([^;\\r\\n]+)`, "gmi"))];
  return matches.length > 0 ? matches.at(-1)[1].trim() : null;
}

function writeSiderSetting(content, key, value) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^(\\s*${escaped}\\s*=\\s*)[^;\\r\\n]+(\\s*;.*)?$`, "gmi");
  if (pattern.test(content)) return content.replace(pattern, `$1${value}$2`);
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  return `${content.replace(/(?:\r?\n)*$/, "")}${newline}${key} = ${value}${newline}`;
}

function removeSiderSetting(content, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return content.replace(new RegExp(`^\\s*${escaped}\\s*=.*(?:\\r?\\n|$)`, "gmi"), "");
}

function parseModLine(raw, index, managed) {
  const trimmed = raw.trim();
  const uncommented = trimmed.replace(/^;\s*/, "");
  const enabled = !trimmed.startsWith(";");
  const cpkMatch = uncommented.match(/^cpk\.root\s*=\s*["']([^"']+)["'](?:\s*;.*)?$/i);
  if (cpkMatch) {
    const rootPath = cpkMatch[1];
    const folderName = rootPath.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) || rootPath;
    return {
      id: `${managed ? "managed" : "manual"}-cpk-${index}`,
      name: folderName.replace(/[_-]+/g, " "),
      folderName,
      siderLine: trimmed,
      enabled,
      type: "livecpk",
      category: inferCategory(folderName),
      priority: 0,
      lineIndex: index,
      managed,
    };
  }

  const luaMatch = uncommented.match(/^lua\.module\s*=\s*["']([^"']+)["'](?:\s*;.*)?$/i);
  if (luaMatch) {
    const moduleName = luaMatch[1];
    return {
      id: `${managed ? "managed" : "manual"}-lua-${index}`,
      name: moduleName.replace(/\.lua$/i, "").replace(/[_-]+/g, " "),
      folderName: moduleName,
      siderLine: trimmed,
      enabled,
      type: "lua",
      category: inferCategory(moduleName),
      priority: 0,
      lineIndex: index,
      managed,
    };
  }

  return null;
}

function inferCategory(value) {
  const lower = String(value).toLowerCase();
  if (/gameplay|holland|dt18|camera/.test(lower)) return "gameplay";
  if (/turf|grass|pitch|stadium/.test(lower)) return "turf";
  if (/menu|theme|ui/.test(lower)) return "menu";
  if (/audio|chant|sound|anthem/.test(lower)) return "audio";
  if (/kit|jersey|boot|glove/.test(lower)) return "kit";
  if (/face|player/.test(lower)) return "face";
  if (/score|tv|broadcast/.test(lower)) return "scoreboard";
  return "other";
}

export class SiderManager {
  constructor({ dataDirectories, documentsRoots = null }) {
    this.dataDirectories = dataDirectories;
    this.documentsRoots = documentsRoots;
  }

  parse(siderPath) {
    if (!siderPath || !fs.existsSync(siderPath)) {
      return { mods: [], totalLines: 0, error: "sider.ini introuvable" };
    }

    const lines = fs.readFileSync(siderPath, "utf-8").split(/\r?\n/);
    const mods = [];
    let inManagedBlock = false;
    let priority = 1;

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed === MANAGED_START) {
        inManagedBlock = true;
        return;
      }
      if (trimmed === MANAGED_END) {
        inManagedBlock = false;
        return;
      }

      const parsed = parseModLine(line, index, inManagedBlock);
      if (parsed) {
        parsed.priority = priority++;
        mods.push(parsed);
      }
    });

    return { mods, totalLines: lines.length, hash: fileHash(siderPath) };
  }

  backupBucket(siderPath) {
    const bucket = crypto.createHash("sha256").update(path.resolve(siderPath).toLowerCase()).digest("hex").slice(0, 16);
    return path.join(this.dataDirectories.backups, bucket);
  }

  createBackup(siderPath, reason = "change") {
    if (!siderPath || !fs.existsSync(siderPath)) throw new Error("Impossible de sauvegarder un sider.ini absent.");
    const bucket = this.backupBucket(siderPath);
    fs.mkdirSync(bucket, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const target = path.join(bucket, `sider-${stamp}-${sanitizeSegment(reason)}.ini.bak`);
    fs.copyFileSync(siderPath, target);

    const backups = fs.readdirSync(bucket)
      .filter((name) => name.endsWith(".ini.bak"))
      .map((name) => ({ name, fullPath: path.join(bucket, name), time: fs.statSync(path.join(bucket, name)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    for (const stale of backups.slice(30)) {
      fs.unlinkSync(stale.fullPath);
    }

    return target;
  }

  listBackups(siderPath) {
    const bucket = this.backupBucket(siderPath);
    if (!fs.existsSync(bucket)) return [];
    return fs.readdirSync(bucket)
      .filter((name) => name.endsWith(".ini.bak"))
      .map((name) => {
        const fullPath = path.join(bucket, name);
        const stat = fs.statSync(fullPath);
        return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  restoreBackup(siderPath, backupName) {
    const bucket = this.backupBucket(siderPath);
    const source = path.join(bucket, path.basename(backupName));
    assertPathInside(bucket, source, "Sauvegarde");
    if (!fs.existsSync(source)) throw new Error("Sauvegarde introuvable.");
    const safetyBackup = this.createBackup(siderPath, "before-restore");
    atomicWriteText(siderPath, fs.readFileSync(source, "utf-8"));
    return { restored: source, safetyBackup, hash: fileHash(siderPath) };
  }

  buildManagedLines(state, profile) {
    const enabled = new Set(profile.enabledMods);
    const orderedIds = [
      ...profile.modOrder,
      ...Object.keys(state.mods).filter((id) => !profile.modOrder.includes(id)),
    ];
    const lines = [
      MANAGED_START,
      `; Profile: ${inlineComment(profile.name)}`,
      "; Generated by STRYKER. Manual lines outside this block are preserved.",
    ];

    for (const modId of orderedIds) {
      if (!enabled.has(modId)) continue;
      const mod = state.mods[modId];
      if (!mod?.siderOverlay?.primary) continue;
      for (const component of mod.components || []) {
        if (component.type !== "lua") continue;
        lines.push(`; Interface prioritaire: ${inlineComment(mod.name)} | ${inlineComment(mod.id)}`);
        for (const entrypoint of component.entrypoints || []) {
          const relative = path.join("STRYKER", mod.id, entrypoint).replace(/\//g, "\\");
          lines.push(`lua.module = "${relative}"`);
        }
      }
    }

    for (const modId of orderedIds) {
      if (!enabled.has(modId)) continue;
      const mod = state.mods[modId];
      if (!mod) continue;

      lines.push(`; Mod: ${inlineComment(mod.name)} | ${inlineComment(mod.version || "1.0.0")} | ${inlineComment(mod.id)}`);
      for (const component of mod.components || []) {
        if (component.type === "livecpk") {
          if (component.target === "football-life-livecpk-root") continue;
          const root = path.resolve(mod.stagingPath, component.root);
          assertPathInside(this.dataDirectories.mods, mod.stagingPath, "Staging du mod");
          assertPathInside(mod.stagingPath, root, "Racine LiveCPK");
          lines.push(`cpk.root = "${toWindowsPath(root)}"`);
        }
        if (component.type === "lua") {
          if (mod.siderOverlay?.primary) continue;
          for (const entrypoint of component.entrypoints || []) {
            const relative = path.join("STRYKER", mod.id, entrypoint).replace(/\//g, "\\");
            lines.push(`lua.module = "${relative}"`);
          }
        }
      }
    }

    lines.push(MANAGED_END);
    return lines;
  }

  prepareOverlaySettings(state, profile, siderPath, original) {
    const enabled = new Set(profile.enabledMods);
    const overlayMod = profile.modOrder
      .map((modId) => enabled.has(modId) ? state.mods[modId] : null)
      .find((mod) => mod?.siderOverlay?.toggleVkey);
    const bucket = this.backupBucket(siderPath);
    const baselinePath = path.join(bucket, "sider-overlay-baseline.json");
    let baseline = null;
    if (fs.existsSync(baselinePath)) {
      try { baseline = JSON.parse(fs.readFileSync(baselinePath, "utf-8")); }
      catch { throw new Error("La sauvegarde du raccourci overlay Sider est illisible."); }
    }

    if (overlayMod) {
      let createdBaseline = false;
      if (!baseline) {
        const originalValue = readSiderSetting(original, "overlay.vkey.toggle");
        baseline = { schemaVersion: 1, hadSetting: originalValue !== null, value: originalValue };
        fs.mkdirSync(bucket, { recursive: true });
        atomicWriteText(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
        createdBaseline = true;
      }
      return {
        content: writeSiderSetting(original, "overlay.vkey.toggle", overlayMod.siderOverlay.toggleVkey),
        commit: () => undefined,
        rollback: () => { if (createdBaseline && fs.existsSync(baselinePath)) fs.unlinkSync(baselinePath); },
      };
    }

    if (!baseline) return { content: original, commit: () => undefined, rollback: () => undefined };
    const restored = baseline.hadSetting
      ? writeSiderSetting(original, "overlay.vkey.toggle", baseline.value)
      : removeSiderSetting(original, "overlay.vkey.toggle");
    return {
      content: restored,
      commit: () => { if (fs.existsSync(baselinePath)) fs.unlinkSync(baselinePath); },
      rollback: () => undefined,
    };
  }

  deployLuaComponents(state, profile, siderPath) {
    const enabled = new Set(profile.enabledMods);
    const modulesParent = path.join(path.dirname(siderPath), "modules");
    const modulesRoot = path.join(modulesParent, "STRYKER");
    const transactionId = crypto.randomBytes(6).toString("hex");
    const nextRoot = path.join(modulesParent, `.STRYKER-next-${transactionId}`);
    const previousRoot = path.join(modulesParent, `.STRYKER-previous-${transactionId}`);
    fs.mkdirSync(nextRoot, { recursive: true });

    try {
      for (const modId of profile.modOrder) {
        if (!enabled.has(modId)) continue;
        const mod = state.mods[modId];
        if (!mod) continue;
        for (const component of mod.components || []) {
          if (component.type !== "lua") continue;
          const source = path.resolve(mod.stagingPath, component.root);
          assertPathInside(this.dataDirectories.mods, mod.stagingPath, "Staging du mod");
          assertPathInside(mod.stagingPath, source, "Module Lua");
          const destination = path.join(nextRoot, mod.id);
          assertPathInside(nextRoot, destination, "Déploiement Lua");
          fs.cpSync(source, destination, { recursive: true, force: true, errorOnExist: false });
          for (const file of listRegularFiles(destination)) {
            if (!file.toLowerCase().endsWith(".lua")) continue;
            const original = fs.readFileSync(file, "utf8");
            const adapted = adaptLuaPaths(original, mod, component, path.dirname(siderPath));
            if (adapted !== original) fs.writeFileSync(file, adapted, "utf8");
          }
        }
      }

      fs.mkdirSync(modulesParent, { recursive: true });
      if (fs.existsSync(modulesRoot)) fs.renameSync(modulesRoot, previousRoot);
      fs.renameSync(nextRoot, modulesRoot);
    } catch (error) {
      if (fs.existsSync(nextRoot)) fs.rmSync(nextRoot, { recursive: true, force: true });
      if (!fs.existsSync(modulesRoot) && fs.existsSync(previousRoot)) fs.renameSync(previousRoot, modulesRoot);
      throw error;
    }

    return {
      commit: () => {
        if (fs.existsSync(previousRoot)) fs.rmSync(previousRoot, { recursive: true, force: true });
      },
      rollback: () => {
        if (fs.existsSync(modulesRoot)) fs.rmSync(modulesRoot, { recursive: true, force: true });
        if (fs.existsSync(previousRoot)) fs.renameSync(previousRoot, modulesRoot);
      },
    };
  }

  deployLiveCpkRootComponents(state, profile, siderPath) {
    const enabled = new Set(profile.enabledMods);
    const siderRoot = path.dirname(siderPath);
    const liveCpkRoot = path.join(siderRoot, "livecpk", "root");
    const desired = new Map();

    for (const modId of profile.modOrder) {
      if (!enabled.has(modId)) continue;
      const mod = state.mods[modId];
      if (!mod) continue;
      for (const component of mod.components || []) {
        if (component.type !== "livecpk" || component.target !== "football-life-livecpk-root") continue;
        const sourceRoot = path.resolve(mod.stagingPath, component.root);
        assertPathInside(this.dataDirectories.mods, mod.stagingPath, "Staging du mod");
        assertPathInside(mod.stagingPath, sourceRoot, "Facepack LiveCPK");
        if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
          throw new Error("Facepack introuvable dans le staging STRYKER.");
        }
        for (const source of listRegularFiles(sourceRoot)) {
          const relativeTarget = path.relative(sourceRoot, source).replace(/\\/g, "/");
          if (!/^asset\/model\/character\/face\/real\//i.test(relativeTarget)) {
            throw new Error("Le Facepack contient un fichier hors du dossier Asset/model/character/face/real.");
          }
          const key = relativeTarget.toLowerCase();
          if (desired.has(key)) continue;
          const destination = path.resolve(liveCpkRoot, ...relativeTarget.split("/"));
          assertPathInside(liveCpkRoot, destination, "Destination du Facepack");
          desired.set(key, { relativeTarget, source, destination, modId });
        }
      }
    }

    const bucket = this.backupBucket(siderPath);
    const statePath = path.join(bucket, "livecpk-root-state.json");
    const originalsRoot = path.join(bucket, "livecpk-root-originals");
    const previousText = fs.existsSync(statePath) ? fs.readFileSync(statePath, "utf-8") : "";
    let previousState = { schemaVersion: 1, files: {} };
    if (previousText) {
      try {
        const parsed = JSON.parse(previousText);
        if (parsed && parsed.files && typeof parsed.files === "object") previousState = parsed;
      } catch {
        throw new Error("L’état des Facepacks gérés est illisible. Restaurez une sauvegarde avant de redéployer.");
      }
    }
    const previousFiles = previousState.files || {};
    const allKeys = new Set([...Object.keys(previousFiles), ...desired.keys()]);
    const rollbackRoot = fs.mkdtempSync(path.join(this.dataDirectories.temp, "livecpk-root-rollback-"));
    const snapshots = new Map();
    const createdOriginals = [];
    const staleOriginals = [];

    const resolveManagedDestination = (relativeTarget) => {
      const normalized = String(relativeTarget || "").replace(/\\/g, "/").replace(/^\/+/, "");
      if (!normalized) throw new Error("Chemin de Facepack géré invalide.");
      const destination = path.resolve(liveCpkRoot, ...normalized.split("/"));
      assertPathInside(liveCpkRoot, destination, "Facepack géré");
      return destination;
    };
    const resolveOriginalBackup = (relativeBackup) => {
      const backup = path.resolve(bucket, ...String(relativeBackup).replace(/\\/g, "/").split("/"));
      assertPathInside(originalsRoot, backup, "Sauvegarde originale du Facepack");
      return backup;
    };

    try {
      for (const key of allKeys) {
        const relativeTarget = desired.get(key)?.relativeTarget || previousFiles[key]?.relativeTarget || key;
        const destination = resolveManagedDestination(relativeTarget);
        if (fs.existsSync(destination)) {
          if (!fs.statSync(destination).isFile()) throw new Error(`La destination du Facepack n’est pas un fichier : ${relativeTarget}`);
          const snapshotPath = path.join(rollbackRoot, `${crypto.createHash("sha256").update(key).digest("hex")}.bak`);
          fs.copyFileSync(destination, snapshotPath);
          snapshots.set(key, snapshotPath);
        } else {
          snapshots.set(key, null);
        }
      }

      const nextFiles = {};
      for (const [key, item] of desired.entries()) {
        const previous = previousFiles[key];
        let originalBackup = previous?.originalBackup || null;
        if (!previous && fs.existsSync(item.destination)) {
          fs.mkdirSync(originalsRoot, { recursive: true });
          const extension = path.extname(item.destination).slice(0, 20);
          const backupPath = path.join(originalsRoot, `${crypto.createHash("sha256").update(key).digest("hex")}${extension}`);
          atomicCopyFile(item.destination, backupPath);
          originalBackup = path.relative(bucket, backupPath).replace(/\\/g, "/");
          createdOriginals.push(backupPath);
        }
        atomicCopyFile(item.source, item.destination);
        nextFiles[key] = { relativeTarget: item.relativeTarget, originalBackup, modId: item.modId };
      }

      for (const [key, previous] of Object.entries(previousFiles)) {
        if (desired.has(key)) continue;
        const destination = resolveManagedDestination(previous.relativeTarget || key);
        if (previous.originalBackup) {
          const backupPath = resolveOriginalBackup(previous.originalBackup);
          if (!fs.existsSync(backupPath)) throw new Error(`Sauvegarde originale manquante pour ${key}.`);
          atomicCopyFile(backupPath, destination);
          staleOriginals.push(backupPath);
        } else if (fs.existsSync(destination)) {
          fs.unlinkSync(destination);
        }
      }

      fs.mkdirSync(bucket, { recursive: true });
      atomicWriteText(statePath, `${JSON.stringify({ schemaVersion: 1, siderPath: path.resolve(siderPath), files: nextFiles }, null, 2)}\n`);
    } catch (error) {
      for (const [key, snapshotPath] of snapshots.entries()) {
        const relativeTarget = desired.get(key)?.relativeTarget || previousFiles[key]?.relativeTarget || key;
        const destination = resolveManagedDestination(relativeTarget);
        if (snapshotPath) atomicCopyFile(snapshotPath, destination);
        else if (fs.existsSync(destination) && fs.statSync(destination).isFile()) fs.unlinkSync(destination);
      }
      if (previousText) atomicWriteText(statePath, previousText);
      else if (fs.existsSync(statePath)) fs.unlinkSync(statePath);
      for (const backupPath of createdOriginals) if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
      fs.rmSync(rollbackRoot, { recursive: true, force: true });
      throw error;
    }

    return {
      commit: () => {
        for (const backupPath of staleOriginals) if (fs.existsSync(backupPath)) fs.rmSync(backupPath, { force: true });
        fs.rmSync(rollbackRoot, { recursive: true, force: true });
      },
      rollback: () => {
        for (const [key, snapshotPath] of snapshots.entries()) {
          const relativeTarget = desired.get(key)?.relativeTarget || previousFiles[key]?.relativeTarget || key;
          const destination = resolveManagedDestination(relativeTarget);
          if (snapshotPath) atomicCopyFile(snapshotPath, destination);
          else if (fs.existsSync(destination) && fs.statSync(destination).isFile()) fs.unlinkSync(destination);
        }
        if (previousText) atomicWriteText(statePath, previousText);
        else if (fs.existsSync(statePath)) fs.unlinkSync(statePath);
        for (const backupPath of createdOriginals) if (fs.existsSync(backupPath)) fs.rmSync(backupPath, { force: true });
        fs.rmSync(rollbackRoot, { recursive: true, force: true });
      },
    };
  }

  deploySiderDataComponents(state, profile, siderPath) {
    const enabled = new Set(profile.enabledMods);
    const siderRoot = path.dirname(siderPath);
    const desired = new Map();

    for (const modId of profile.modOrder) {
      if (!enabled.has(modId)) continue;
      const mod = state.mods[modId];
      if (!mod) continue;
      for (const component of mod.components || []) {
        if (component.type !== "sider") continue;
        const sourceRoot = path.resolve(mod.stagingPath, component.root);
        assertPathInside(this.dataDirectories.mods, mod.stagingPath, "Staging du mod");
        assertPathInside(mod.stagingPath, sourceRoot, "Données Sider");
        if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) throw new Error("Données Sider introuvables dans le staging.");
        const targetRoot = normalizeSiderDataTarget(component.target);
        for (const source of listRegularFiles(sourceRoot)) {
          const relativeSource = path.relative(sourceRoot, source).replace(/\\/g, "/");
          const relativeTarget = `${targetRoot}/${relativeSource}`;
          const key = relativeTarget.toLowerCase();
          if (isKitMap(key) && desired.has(key)) {
            desired.get(key).mergeSources.push({ source, modId });
            continue;
          }
          if (desired.has(key)) continue;
          const destination = path.resolve(siderRoot, ...relativeTarget.split("/"));
          assertPathInside(siderRoot, destination, "Destination des données Sider");
          desired.set(key, { relativeTarget, source, destination, modId, mergeSources: [{ source, modId }] });
        }
      }
    }

    const bucket = this.backupBucket(siderPath);
    const statePath = path.join(bucket, "sider-content-state.json");
    const originalsRoot = path.join(bucket, "sider-content-originals");
    const previousText = fs.existsSync(statePath) ? fs.readFileSync(statePath, "utf-8") : "";
    let previousState = { schemaVersion: 1, files: {} };
    if (previousText) {
      try {
        const parsed = JSON.parse(previousText);
        if (parsed && parsed.files && typeof parsed.files === "object") previousState = parsed;
      } catch {
        throw new Error("L’état des données Sider gérées est illisible. Restaurez-le avant de redéployer.");
      }
    }
    const previousFiles = previousState.files || {};
    const allKeys = new Set([...Object.keys(previousFiles), ...[...desired.keys()]]);
    const rollbackRoot = fs.mkdtempSync(path.join(this.dataDirectories.temp, "sider-content-rollback-"));
    const snapshots = new Map();
    const createdOriginals = [];
    const staleOriginals = [];

    const resolveManagedDestination = (relativeTarget) => {
      const normalized = String(relativeTarget).replace(/\\/g, "/");
      if (!normalized.toLowerCase().startsWith("content/")) throw new Error("Chemin de données Sider gérées invalide.");
      const destination = path.resolve(siderRoot, ...normalized.split("/"));
      assertPathInside(siderRoot, destination, "Données Sider gérées");
      return destination;
    };
    const resolveOriginalBackup = (relativeBackup) => {
      const backup = path.resolve(bucket, ...String(relativeBackup).replace(/\\/g, "/").split("/"));
      assertPathInside(originalsRoot, backup, "Sauvegarde des données Sider");
      return backup;
    };

    const mergedRoot = fs.mkdtempSync(path.join(this.dataDirectories.temp, "sider-merged-"));
    try {
      for (const [key, item] of desired.entries()) {
        if (!isKitMap(key)) continue;
        const previous = previousFiles[key];
        const baseline = previous?.originalBackup ? resolveOriginalBackup(previous.originalBackup)
          : !previous && fs.existsSync(item.destination) ? item.destination : null;
        if (baseline && !fs.existsSync(baseline)) throw new Error("Sauvegarde de la map Kitserver manquante.");
        const sources = [...item.mergeSources, ...(baseline ? [{ source: baseline, modId: "Installation originale" }] : [])];
        const seen = new Set();
        const lines = ["# STRYKER — map Kitserver fusionnée automatiquement"];
        for (const sourceItem of sources) {
          lines.push("", "# " + inlineComment(sourceItem.modId));
          for (const line of fs.readFileSync(sourceItem.source, "utf8").split(/\r?\n/)) {
            const id = line.match(/^\s*(\d+)\s*,/)?.[1];
            if (id && seen.has(id)) continue;
            if (id) seen.add(id);
            if (line.trim()) lines.push(line);
          }
        }
        const merged = path.join(mergedRoot, crypto.createHash("sha256").update(key).digest("hex") + ".txt");
        fs.writeFileSync(merged, lines.join("\r\n") + "\r\n", "utf8");
        item.source = merged;
        item.modId = item.mergeSources.map(({ modId }) => modId).join(",");
      }
      for (const key of allKeys) {
        const relativeTarget = desired.get(key)?.relativeTarget || previousFiles[key]?.relativeTarget || key;
        const destination = resolveManagedDestination(relativeTarget);
        if (fs.existsSync(destination)) {
          if (!fs.statSync(destination).isFile()) throw new Error(`La destination Sider n’est pas un fichier : ${key}`);
          const snapshotPath = path.join(rollbackRoot, `${crypto.createHash("sha256").update(key).digest("hex")}.bak`);
          fs.copyFileSync(destination, snapshotPath);
          snapshots.set(key, snapshotPath);
        } else {
          snapshots.set(key, null);
        }
      }

      const nextFiles = {};
      for (const [key, item] of desired.entries()) {
        const previous = previousFiles[key];
        let originalBackup = previous?.originalBackup || null;
        if (!previous && fs.existsSync(item.destination)) {
          fs.mkdirSync(originalsRoot, { recursive: true });
          const extension = path.extname(item.destination).slice(0, 20);
          const backupPath = path.join(originalsRoot, `${crypto.createHash("sha256").update(key).digest("hex")}${extension}`);
          atomicCopyFile(item.destination, backupPath);
          originalBackup = path.relative(bucket, backupPath).replace(/\\/g, "/");
          createdOriginals.push(backupPath);
        }
        atomicCopyFile(item.source, item.destination);
        nextFiles[key] = { relativeTarget: item.relativeTarget, originalBackup, modId: item.modId };
      }

      for (const [key, previous] of Object.entries(previousFiles)) {
        if (desired.has(key)) continue;
        const destination = resolveManagedDestination(previous.relativeTarget || key);
        if (previous.originalBackup) {
          const backupPath = resolveOriginalBackup(previous.originalBackup);
          if (!fs.existsSync(backupPath)) throw new Error(`Sauvegarde originale manquante pour ${key}.`);
          atomicCopyFile(backupPath, destination);
          staleOriginals.push(backupPath);
        } else if (fs.existsSync(destination)) {
          fs.unlinkSync(destination);
        }
      }

      fs.mkdirSync(bucket, { recursive: true });
      atomicWriteText(statePath, `${JSON.stringify({ schemaVersion: 1, siderPath: path.resolve(siderPath), files: nextFiles }, null, 2)}\n`);
    } catch (error) {
      for (const [key, snapshotPath] of snapshots.entries()) {
        const relativeTarget = desired.get(key)?.relativeTarget || previousFiles[key]?.relativeTarget || key;
        const destination = resolveManagedDestination(relativeTarget);
        if (snapshotPath) atomicCopyFile(snapshotPath, destination);
        else if (fs.existsSync(destination) && fs.statSync(destination).isFile()) fs.unlinkSync(destination);
      }
      if (previousText) atomicWriteText(statePath, previousText);
      else if (fs.existsSync(statePath)) fs.unlinkSync(statePath);
      for (const backupPath of createdOriginals) if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
      fs.rmSync(rollbackRoot, { recursive: true, force: true });
      fs.rmSync(mergedRoot, { recursive: true, force: true });
      throw error;
    }

    return {
      commit: () => {
        for (const backupPath of staleOriginals) if (fs.existsSync(backupPath)) fs.rmSync(backupPath, { force: true });
        fs.rmSync(rollbackRoot, { recursive: true, force: true });
        fs.rmSync(mergedRoot, { recursive: true, force: true });
      },
      rollback: () => {
        for (const [key, snapshotPath] of snapshots.entries()) {
          const relativeTarget = desired.get(key)?.relativeTarget || previousFiles[key]?.relativeTarget || key;
          const destination = resolveManagedDestination(relativeTarget);
          if (snapshotPath) atomicCopyFile(snapshotPath, destination);
          else if (fs.existsSync(destination) && fs.statSync(destination).isFile()) fs.unlinkSync(destination);
        }
        if (previousText) atomicWriteText(statePath, previousText);
        else if (fs.existsSync(statePath)) fs.unlinkSync(statePath);
        for (const backupPath of createdOriginals) if (fs.existsSync(backupPath)) fs.rmSync(backupPath, { force: true });
        fs.rmSync(rollbackRoot, { recursive: true, force: true });
        fs.rmSync(mergedRoot, { recursive: true, force: true });
      },
    };
  }

  resolveFootballLifeSaveRoot(state) {
    const versionText = [
      state?.settings?.detectedVersion,
      state?.settings?.gameExecutablePath,
      state?.settings?.gamePath,
    ].filter(Boolean).join(" ");
    const year = versionText.match(/20(?:24|25|26)/)?.[0] || "2026";
    const configuredRoots = Array.isArray(this.documentsRoots) ? this.documentsRoots : [
      process.env.OneDrive ? path.join(process.env.OneDrive, "Documents") : "",
      process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "Documents") : "",
      path.join(os.homedir(), "Documents"),
    ];
    const roots = [...new Set(configuredRoots.filter(Boolean).map((root) => path.resolve(root)))];
    if (roots.length === 0) throw new Error("Le dossier Documents de Windows est introuvable.");
    const candidates = roots.map((root) => path.join(root, "KONAMI", "eFootball PES 2021 SEASON UPDATE", year, "save"));
    const existing = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory());
    const selected = existing || candidates.find((candidate) => fs.existsSync(path.dirname(path.dirname(candidate)))) || candidates[0];
    fs.mkdirSync(selected, { recursive: true });
    return selected;
  }

  deploySaveComponents(state, profile) {
    const enabled = new Set(profile.enabledMods);
    const bucket = path.join(this.dataDirectories.backups, "football-life-saves");
    const statePath = path.join(bucket, "state.json");
    const hasEnabledSave = profile.modOrder.some((modId) => enabled.has(modId)
      && state.mods[modId]?.components?.some((component) => component.type === "save"));
    if (!hasEnabledSave && !fs.existsSync(statePath)) {
      return { commit: () => undefined, rollback: () => undefined };
    }
    const saveRoot = this.resolveFootballLifeSaveRoot(state);
    const desired = new Map();
    for (const modId of profile.modOrder) {
      if (!enabled.has(modId)) continue;
      const mod = state.mods[modId];
      if (!mod) continue;
      for (const component of mod.components || []) {
        if (component.type !== "save") continue;
        if (component.target !== "football-life-save") throw new Error("Cible Option File invalide.");
        const sourceRoot = path.resolve(mod.stagingPath, component.root);
        assertPathInside(this.dataDirectories.mods, mod.stagingPath, "Staging du mod");
        assertPathInside(mod.stagingPath, sourceRoot, "Option File");
        const source = path.join(sourceRoot, "EDIT00000000");
        if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error("EDIT00000000 est introuvable dans le mod.");
        if (!desired.has("edit00000000")) {
          desired.set("edit00000000", {
            source,
            destination: path.join(saveRoot, "EDIT00000000"),
            modId,
            sourceHash: fileHash(source),
          });
        }
      }
    }

    const originalsRoot = path.join(bucket, "originals");
    const historyRoot = path.join(bucket, "history");
    const previousText = fs.existsSync(statePath) ? fs.readFileSync(statePath, "utf-8") : "";
    let previousState = { schemaVersion: 1, files: {} };
    if (previousText) {
      try {
        const parsed = JSON.parse(previousText);
        if (parsed && parsed.files && typeof parsed.files === "object") previousState = parsed;
      } catch {
        throw new Error("L’état des Option Files gérés est illisible.");
      }
    }
    const previousFiles = previousState.files || {};
    const allKeys = new Set([...Object.keys(previousFiles), ...desired.keys()]);
    const rollbackRoot = fs.mkdtempSync(path.join(this.dataDirectories.temp, "save-rollback-"));
    const snapshots = new Map();
    const createdOriginals = [];
    const createdHistory = [];

    const safeDestination = (value) => {
      const destination = path.resolve(value || path.join(saveRoot, "EDIT00000000"));
      assertPathInside(saveRoot, destination, "Sauvegarde Football Life");
      if (path.basename(destination).toLowerCase() !== "edit00000000") throw new Error("Nom d’Option File invalide.");
      return destination;
    };

    try {
      for (const key of allKeys) {
        const destination = safeDestination(desired.get(key)?.destination || previousFiles[key]?.destination);
        if (fs.existsSync(destination)) {
          const snapshot = path.join(rollbackRoot, `${key}.bak`);
          fs.copyFileSync(destination, snapshot);
          snapshots.set(key, snapshot);
        } else snapshots.set(key, null);
      }

      const nextFiles = {};
      for (const [key, item] of desired.entries()) {
        const previous = previousFiles[key];
        let originalBackup = previous?.originalBackup || null;
        if (!previous && fs.existsSync(item.destination)) {
          fs.mkdirSync(originalsRoot, { recursive: true });
          const backup = path.join(originalsRoot, `${key}-${crypto.randomBytes(6).toString("hex")}.bak`);
          fs.copyFileSync(item.destination, backup);
          originalBackup = backup;
          createdOriginals.push(backup);
        }
        const unchanged = previous
          && previous.modId === item.modId
          && previous.sourceHash === item.sourceHash
          && path.resolve(previous.destination) === path.resolve(item.destination)
          && fs.existsSync(item.destination);
        if (!unchanged) {
          if (previous && fs.existsSync(item.destination)) {
            fs.mkdirSync(historyRoot, { recursive: true });
            const history = path.join(historyRoot, `${key}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}.bak`);
            fs.copyFileSync(item.destination, history);
            createdHistory.push(history);
          }
          atomicCopyFile(item.source, item.destination);
        }
        nextFiles[key] = { destination: item.destination, originalBackup, modId: item.modId, sourceHash: item.sourceHash };
      }

      for (const [key, previous] of Object.entries(previousFiles)) {
        if (desired.has(key)) continue;
        const destination = safeDestination(previous.destination);
        if (fs.existsSync(destination)) {
          fs.mkdirSync(historyRoot, { recursive: true });
          const history = path.join(historyRoot, `${key}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}.bak`);
          fs.copyFileSync(destination, history);
          createdHistory.push(history);
        }
        if (previous.originalBackup && fs.existsSync(previous.originalBackup)) atomicCopyFile(previous.originalBackup, destination);
        else if (fs.existsSync(destination)) fs.unlinkSync(destination);
      }

      fs.mkdirSync(bucket, { recursive: true });
      atomicWriteText(statePath, `${JSON.stringify({ schemaVersion: 1, files: nextFiles }, null, 2)}\n`);
    } catch (error) {
      for (const [key, snapshot] of snapshots.entries()) {
        const destination = safeDestination(desired.get(key)?.destination || previousFiles[key]?.destination);
        if (snapshot) atomicCopyFile(snapshot, destination);
        else if (fs.existsSync(destination)) fs.unlinkSync(destination);
      }
      if (previousText) atomicWriteText(statePath, previousText);
      else if (fs.existsSync(statePath)) fs.unlinkSync(statePath);
      for (const file of createdOriginals) if (fs.existsSync(file)) fs.unlinkSync(file);
      for (const file of createdHistory) if (fs.existsSync(file)) fs.unlinkSync(file);
      fs.rmSync(rollbackRoot, { recursive: true, force: true });
      throw error;
    }

    return {
      commit: () => fs.rmSync(rollbackRoot, { recursive: true, force: true }),
      rollback: () => {
        for (const [key, snapshot] of snapshots.entries()) {
          const destination = safeDestination(desired.get(key)?.destination || previousFiles[key]?.destination);
          if (snapshot) atomicCopyFile(snapshot, destination);
          else if (fs.existsSync(destination)) fs.unlinkSync(destination);
        }
        if (previousText) atomicWriteText(statePath, previousText);
        else if (fs.existsSync(statePath)) fs.unlinkSync(statePath);
        for (const file of createdOriginals) if (fs.existsSync(file)) fs.unlinkSync(file);
        for (const file of createdHistory) if (fs.existsSync(file)) fs.unlinkSync(file);
        fs.rmSync(rollbackRoot, { recursive: true, force: true });
      },
    };
  }

  deploy(state, profile) {
    const siderPath = state.settings.siderPath;
    if (!siderPath || !fs.existsSync(siderPath)) throw new Error("sider.ini est introuvable : déploiement annulé.");

    const backupPath = this.createBackup(siderPath, `deploy-${profile.id}`);
    const original = fs.readFileSync(siderPath, "utf-8");
    const overlayTransaction = this.prepareOverlaySettings(state, profile, siderPath, original);
    const prepared = overlayTransaction.content;
    const newline = prepared.includes("\r\n") ? "\r\n" : "\n";
    const lines = prepared.split(/\r?\n/);
    const startIndex = lines.findIndex((line) => line.trim() === MANAGED_START);
    const endIndex = lines.findIndex((line, index) => index >= startIndex && line.trim() === MANAGED_END);
    const managedLines = this.buildManagedLines(state, profile);

    let unmanagedLines;
    if (startIndex !== -1 && endIndex !== -1) {
      unmanagedLines = [...lines.slice(0, startIndex), ...lines.slice(endIndex + 1)];
    } else if (startIndex !== -1 || endIndex !== -1) {
      throw new Error("Le bloc STRYKER de sider.ini est incomplet. Restaurez une sauvegarde avant de redéployer.");
    } else {
      unmanagedLines = [...lines];
    }

    // Sider checks LiveCPK roots from top to bottom and stops at the first
    // matching file. Keep the managed block above the installation's base
    // root so enabled STRYKER mods can actually override Football Life files.
    const firstActiveRoot = unmanagedLines.findIndex((line) => /^\s*cpk\.root\s*=/i.test(line));
    const insertionIndex = firstActiveRoot >= 0 ? firstActiveRoot : unmanagedLines.length;
    const separatorBefore = insertionIndex > 0 && unmanagedLines[insertionIndex - 1].trim() ? [""] : [];
    const separatorAfter = insertionIndex < unmanagedLines.length && unmanagedLines[insertionIndex]?.trim() ? [""] : [];
    const nextLines = [
      ...unmanagedLines.slice(0, insertionIndex),
      ...separatorBefore,
      ...managedLines,
      ...separatorAfter,
      ...unmanagedLines.slice(insertionIndex),
    ];

    let luaTransaction = null;
    let liveCpkRootTransaction = null;
    let siderDataTransaction = null;
    let saveTransaction = null;
    try {
      luaTransaction = this.deployLuaComponents(state, profile, siderPath);
      liveCpkRootTransaction = this.deployLiveCpkRootComponents(state, profile, siderPath);
      siderDataTransaction = this.deploySiderDataComponents(state, profile, siderPath);
      saveTransaction = this.deploySaveComponents(state, profile);
      atomicWriteText(siderPath, nextLines.join(newline));
      luaTransaction.commit();
      liveCpkRootTransaction.commit();
      siderDataTransaction.commit();
      saveTransaction.commit();
      overlayTransaction.commit();
    } catch (error) {
      saveTransaction?.rollback();
      siderDataTransaction?.rollback();
      liveCpkRootTransaction?.rollback();
      luaTransaction?.rollback();
      overlayTransaction.rollback();
      atomicWriteText(siderPath, fs.readFileSync(backupPath, "utf-8"));
      throw error;
    }

    return {
      backupPath,
      hash: fileHash(siderPath),
      managedLines: managedLines.length,
    };
  }

  toggleManualLine(siderPath, lineIndex, enable) {
    if (!fs.existsSync(siderPath)) throw new Error("sider.ini introuvable.");
    const parsed = this.parse(siderPath);
    const target = parsed.mods.find((mod) => mod.lineIndex === lineIndex && !mod.managed);
    if (!target) throw new Error("Cette ligne n’est pas une entrée Sider manuelle valide.");

    const backupPath = this.createBackup(siderPath, "manual-toggle");
    const original = fs.readFileSync(siderPath, "utf-8");
    const newline = original.includes("\r\n") ? "\r\n" : "\n";
    const lines = original.split(/\r?\n/);
    const current = lines[lineIndex];
    lines[lineIndex] = enable
      ? current.replace(/^(\s*);\s?/, "$1")
      : current.replace(/^(\s*)/, "$1; ");
    atomicWriteText(siderPath, lines.join(newline));
    return { backupPath, updatedLine: lines[lineIndex], hash: fileHash(siderPath) };
  }
}

export { MANAGED_START, MANAGED_END, fileHash, inferCategory };
