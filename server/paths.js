import fs from "fs";
import os from "os";
import path from "path";

export function resolveDataRoot(rootDir) {
  if (process.env.STRYKER_DATA_DIR) {
    return path.resolve(process.env.STRYKER_DATA_DIR);
  }

  if (process.env.STRYKER_PORTABLE_DATA === "1") {
    return path.join(rootDir, ".stryker-data");
  }

  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    return path.join(localAppData, "STRYKER");
  }

  return path.join(os.homedir(), ".stryker");
}

export function ensureDataDirectories(dataRoot) {
  const directories = {
    root: dataRoot,
    mods: path.join(dataRoot, "mods"),
    downloads: path.join(dataRoot, "downloads"),
    temp: path.join(dataRoot, "temp"),
    backups: path.join(dataRoot, "backups"),
    trash: path.join(dataRoot, "trash"),
    logs: path.join(dataRoot, "logs"),
  };

  for (const directory of Object.values(directories)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  return directories;
}

export function sanitizeSegment(value, fallback = "item") {
  const normalized = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return normalized || fallback;
}

export function isPathInside(parentPath, candidatePath) {
  const parent = path.resolve(parentPath);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function assertPathInside(parentPath, candidatePath, label = "Chemin") {
  if (!isPathInside(parentPath, candidatePath)) {
    throw new Error(`${label} en dehors de la zone autorisée.`);
  }
}

export function toWindowsPath(value) {
  return path.resolve(value).replace(/\//g, "\\");
}

