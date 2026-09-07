#!/usr/bin/env node
/**
 * Construit un paquet LiveCPK à partir d’un mod livré sous forme de CPK de
 * remplacement.
 *
 * Certains mods de gameplay remplacent un CPK entier du jeu. STRYKER ne peut ni
 * installer ni annuler cela. Mais un CPK de remplacement ne modifie en général
 * qu’une poignée de fichiers : on extrait l’original du jeu et la version
 * modifiée, on compare les contenus, et on ne garde que ce qui diffère. Sider
 * sert ensuite ces fichiers par `cpk.root`, ce qui donne exactement le même
 * résultat en jeu, sans écraser un fichier du jeu et sans empêcher le retour en
 * arrière.
 *
 *   node scripts/build-livecpk-from-cpk-diff.mjs <config.json>
 *
 * La configuration décrit l’identité du paquet et les paires de CPK à comparer :
 *
 *   {
 *     "id": "mon-mod", "name": "Mon mod", "version": "1.0",
 *     "author": "Auteur", "category": "gameplay", "folder": "MonMod",
 *     "compatibility": ["Football Life 2026"],
 *     "pairs": [{ "original": "D:/FL 26/Data/dt18_all.cpk", "modded": "…/dt18_all.cpk" }]
 *   }
 *
 * Seuls les fichiers situés sous « common/ » sont retenus : une entrée de CPK
 * sans dossier n’a pas de chemin exploitable par Sider.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extractCpk } from "./cpk-extract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT, "artifacts", "new-mod-packages-v4", "output");
const STAGING_DIR = path.join(ROOT, "artifacts", "new-mod-packages-v4", "staging");

const BLOCKED = new Set([
  ".exe", ".dll", ".bat", ".cmd", ".com", ".msi", ".ps1", ".vbs", ".py", ".js",
  ".wsf", ".hta", ".scr", ".jar", ".lnk", ".reg", ".sh", ".cpl", ".pif",
]);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const relative = (root, file) => path.relative(root, file).split(path.sep).join("/");

export function buildLiveCpkFromDiff(config) {
  const stage = path.join(STAGING_DIR, config.id);
  const livecpkRoot = path.join(stage, "livecpk", config.folder);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(livecpkRoot, { recursive: true });

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-cpk-diff-"));
  const kept = [];
  try {
    for (const [index, pair] of config.pairs.entries()) {
      const originalRoot = path.join(scratch, `original-${index}`);
      const moddedRoot = path.join(scratch, `modded-${index}`);
      extractCpk(pair.original, originalRoot);
      extractCpk(pair.modded, moddedRoot);

      const originals = new Map(walk(originalRoot).map((file) => [relative(originalRoot, file), file]));
      for (const file of walk(moddedRoot)) {
        const key = relative(moddedRoot, file);
        // Une entrée sans dossier ne correspond à aucun chemin servi par Sider.
        if (!key.toLowerCase().startsWith("common/")) continue;
        const original = originals.get(key);
        if (original && fs.statSync(original).size === fs.statSync(file).size && digest(original) === digest(file)) continue;
        if (BLOCKED.has(path.extname(key).toLowerCase())) throw new Error("Fichier exécutable dans le CPK : " + key);
        const target = path.join(livecpkRoot, ...key.split("/"));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(file, target);
        kept.push({ file: key, size: fs.statSync(file).size, kind: original ? "modifié" : "ajouté" });
      }
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  if (!kept.length) throw new Error("Aucune différence entre les CPK d’origine et ceux du mod.");

  const manifest = {
    $schema: "../../docs/stryker.mod.schema.json",
    id: config.id,
    name: config.name,
    version: config.version,
    author: config.author,
    category: config.category,
    compatibility: config.compatibility,
    ...(config.sourceUrl ? { sourceUrl: config.sourceUrl } : {}),
    components: [{ type: "livecpk", root: `livecpk/${config.folder}` }],
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestDirectory = path.join(ROOT, "mod-packages", config.id);
  fs.mkdirSync(manifestDirectory, { recursive: true });
  fs.writeFileSync(path.join(manifestDirectory, "stryker.mod.json"), manifestText);
  fs.writeFileSync(path.join(stage, "stryker.mod.json"), manifestText);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const archive = path.join(OUTPUT_DIR, `${config.id}.zip`);
  fs.rmSync(archive, { force: true });
  const systemRoot = process.env.SystemRoot || "C:/Windows";
  const tar = process.platform === "win32" ? path.join(systemRoot, "System32", "tar.exe") : "tar";
  execFileSync(tar, ["-a", "-c", "-f", archive, "-C", stage, "livecpk", "stryker.mod.json"], { stdio: "inherit" });

  const size = fs.statSync(archive).size;
  const hash = crypto.createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
  return { id: config.id, archive, size, hash, fileCount: kept.length + 1, kept };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [configPath] = process.argv.slice(2);
  if (!configPath) {
    console.error("Usage : node scripts/build-livecpk-from-cpk-diff.mjs <config.json>");
    process.exit(1);
  }
  const result = buildLiveCpkFromDiff(JSON.parse(fs.readFileSync(configPath, "utf8")));
  console.log(JSON.stringify(result, null, 2));
}
