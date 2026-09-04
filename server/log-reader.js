import fs from "fs";
import path from "path";
import { assertPathInside } from "./paths.js";

/**
 * Journaux du jeu exposés à l'application.
 *
 * Les fichiers connus sont déclarés ici ; tout autre `.log` trouvé dans
 * SiderAddons est ajouté comme journal de module. Les identifiants sont
 * assainis et chaque chemin est revérifié comme étant sous le dossier du jeu :
 * l'identifiant vient du client, il ne doit jamais pouvoir sortir de là.
 */
const KNOWN_LOGS = [
  { id: "sider", label: "Sider", relativePath: path.join("SiderAddons", "sider.log") },
  { id: "sider-app", label: "Sider · lanceur", relativePath: path.join("SiderAddons", "sider-app.log") },
  { id: "reshade", label: "ReShade · RenoDX", relativePath: "ReShade.log" },
];

/** sider.log dépasse couramment plusieurs mégaoctets : on ne lit que la fin. */
const TAIL_BYTES = 512 * 1024;
const MAX_LINES = 2_000;
const DEFAULT_LINES = 400;

function moduleLogId(fileName) {
  return `module-${fileName.replace(/\.log$/i, "").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}`;
}

function describe(gamePath, id, label, absolutePath) {
  let size = 0;
  let updatedAt = null;
  try {
    const stats = fs.statSync(absolutePath);
    if (!stats.isFile()) return null;
    size = stats.size;
    updatedAt = stats.mtime.toISOString();
  } catch {
    return null;
  }
  return { id, label, size, updatedAt, path: path.relative(gamePath, absolutePath) };
}

/** Liste les journaux réellement présents dans l'installation liée. */
export function listLogs(settings) {
  const gamePath = settings?.gamePath;
  if (!settings?.isLinked || !gamePath || !fs.existsSync(gamePath)) return [];

  const sources = [];
  for (const known of KNOWN_LOGS) {
    const absolutePath = path.join(gamePath, known.relativePath);
    const entry = describe(gamePath, known.id, known.label, absolutePath);
    if (entry) sources.push(entry);
  }

  const addonsDir = path.join(gamePath, "SiderAddons");
  let moduleFiles = [];
  try {
    moduleFiles = fs.readdirSync(addonsDir).filter((name) => /\.log$/i.test(name));
  } catch {
    moduleFiles = [];
  }
  const knownFiles = new Set(KNOWN_LOGS.map((item) => path.basename(item.relativePath).toLowerCase()));
  for (const fileName of moduleFiles) {
    if (knownFiles.has(fileName.toLowerCase())) continue;
    const entry = describe(gamePath, moduleLogId(fileName), fileName, path.join(addonsDir, fileName));
    if (entry) sources.push(entry);
  }

  return sources;
}

function resolveLogPath(settings, id) {
  const gamePath = settings?.gamePath;
  if (!settings?.isLinked || !gamePath) throw new Error("Liez Football Life pour consulter ses journaux.");

  const known = KNOWN_LOGS.find((item) => item.id === id);
  let absolutePath;
  if (known) {
    absolutePath = path.join(gamePath, known.relativePath);
  } else {
    const addonsDir = path.join(gamePath, "SiderAddons");
    let fileName = null;
    try {
      fileName = fs.readdirSync(addonsDir).find((name) => /\.log$/i.test(name) && moduleLogId(name) === id) || null;
    } catch {
      fileName = null;
    }
    if (!fileName) throw new Error("Journal introuvable.");
    absolutePath = path.join(addonsDir, fileName);
  }

  // Double barrière : même si l'identifiant a été forgé, le chemin doit rester
  // dans le dossier du jeu.
  assertPathInside(gamePath, absolutePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) throw new Error("Journal introuvable.");
  return absolutePath;
}

/** Renvoie les dernières lignes d'un journal, sans jamais charger tout le fichier. */
export function readLog(settings, id, { lines = DEFAULT_LINES } = {}) {
  const wanted = Math.min(Math.max(Number(lines) || DEFAULT_LINES, 1), MAX_LINES);
  const absolutePath = resolveLogPath(settings, id);
  const { size } = fs.statSync(absolutePath);
  const start = Math.max(0, size - TAIL_BYTES);

  const handle = fs.openSync(absolutePath, "r");
  let text;
  try {
    const buffer = Buffer.alloc(Math.min(TAIL_BYTES, size));
    const read = fs.readSync(handle, buffer, 0, buffer.length, start);
    text = buffer.subarray(0, read).toString("utf-8");
  } finally {
    fs.closeSync(handle);
  }

  // La lecture partielle peut couper une ligne en deux : on jette la première.
  const allLines = text.split(/\r?\n/);
  if (start > 0 && allLines.length > 1) allLines.shift();
  while (allLines.length > 0 && allLines[allLines.length - 1] === "") allLines.pop();

  return {
    id,
    size,
    truncated: start > 0,
    updatedAt: fs.statSync(absolutePath).mtime.toISOString(),
    lines: allLines.slice(-wanted),
  };
}

export { KNOWN_LOGS, MAX_LINES };
