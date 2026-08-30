import crypto from "crypto";
import fs from "fs";
import path from "path";
import { assertPathInside, sanitizeSegment, toWindowsPath } from "./paths.js";

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

function inlineComment(value) {
  return String(value || "").replace(/[\r\n\u0000-\u001f\u007f]+/g, " ").slice(0, 240);
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
  constructor({ dataDirectories }) {
    this.dataDirectories = dataDirectories;
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
      if (!mod) continue;

      lines.push(`; Mod: ${inlineComment(mod.name)} | ${inlineComment(mod.version || "1.0.0")} | ${inlineComment(mod.id)}`);
      for (const component of mod.components || []) {
        if (component.type === "livecpk") {
          const root = path.resolve(mod.stagingPath, component.root);
          assertPathInside(this.dataDirectories.mods, mod.stagingPath, "Staging du mod");
          assertPathInside(mod.stagingPath, root, "Racine LiveCPK");
          lines.push(`cpk.root = "${toWindowsPath(root)}"`);
        }
        if (component.type === "lua") {
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

  deploy(state, profile) {
    const siderPath = state.settings.siderPath;
    if (!siderPath || !fs.existsSync(siderPath)) throw new Error("sider.ini est introuvable : déploiement annulé.");

    const backupPath = this.createBackup(siderPath, `deploy-${profile.id}`);
    const original = fs.readFileSync(siderPath, "utf-8");
    const newline = original.includes("\r\n") ? "\r\n" : "\n";
    const lines = original.split(/\r?\n/);
    const startIndex = lines.findIndex((line) => line.trim() === MANAGED_START);
    const endIndex = lines.findIndex((line, index) => index >= startIndex && line.trim() === MANAGED_END);
    const managedLines = this.buildManagedLines(state, profile);

    let nextLines;
    if (startIndex !== -1 && endIndex !== -1) {
      nextLines = [...lines.slice(0, startIndex), ...managedLines, ...lines.slice(endIndex + 1)];
    } else if (startIndex !== -1 || endIndex !== -1) {
      throw new Error("Le bloc STRYKER de sider.ini est incomplet. Restaurez une sauvegarde avant de redéployer.");
    } else {
      nextLines = [...lines, "", ...managedLines, ""];
    }

    let luaTransaction = null;
    try {
      luaTransaction = this.deployLuaComponents(state, profile, siderPath);
      atomicWriteText(siderPath, nextLines.join(newline));
      luaTransaction.commit();
    } catch (error) {
      luaTransaction?.rollback();
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
