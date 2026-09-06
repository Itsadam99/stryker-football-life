#!/usr/bin/env node
/**
 * Convertit un Facepack livré en CPK vers un paquet LiveCPK installable.
 *
 * Le CPK est extrait en mémoire du projet, son arborescence Asset est replacée
 * sous « livecpk/<dossier> », un manifeste est écrit, puis l’archive ZIP est
 * produite avec son empreinte. Le moteur STRYKER reconnaît alors une racine
 * LiveCPK ordinaire, qu’il peut désactiver et retirer.
 *
 *   node scripts/build-facepack-from-cpk.mjs <archive.cpk> <volume>
 *
 * L’archive de sortie reste dans artifacts/ ; elle n’entre pas dans le dépôt.
 */
import crypto from "node:crypto";
import fs from "node:fs";
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

export function buildFacepack(cpkPath, volume) {
  const id = `facepack-update-vol-${volume}`;
  const folder = `Facepack_Update_${volume}`;
  const stage = path.join(STAGING_DIR, id);
  const livecpkRoot = path.join(stage, "livecpk", folder);

  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(livecpkRoot, { recursive: true });
  const extracted = extractCpk(cpkPath, livecpkRoot);

  const blocked = walk(livecpkRoot).filter((file) => BLOCKED.has(path.extname(file).toLowerCase()));
  if (blocked.length) throw new Error("Le CPK contient du code exécutable : " + blocked.join(", "));

  const faces = path.join(livecpkRoot, "Asset", "model", "character", "face", "real");
  if (!fs.existsSync(faces)) throw new Error("Le CPK ne contient pas Asset/model/character/face/real.");
  const players = fs.readdirSync(faces).sort();

  const manifest = {
    $schema: "../../docs/stryker.mod.schema.json",
    id,
    name: `Facepack Update Vol. ${volume}`,
    version: String(volume),
    author: "Communauté FaceMaker",
    category: "face",
    compatibility: ["Football Life 2026", "PES 2021", "Sider 7", "LiveCPK"],
    components: [{ type: "livecpk", root: `livecpk/${folder}`, target: "football-life-livecpk-root" }],
  };
  const manifestDirectory = path.join(ROOT, "mod-packages", id);
  fs.mkdirSync(manifestDirectory, { recursive: true });
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.writeFileSync(path.join(manifestDirectory, "stryker.mod.json"), manifestText);
  fs.writeFileSync(path.join(stage, "stryker.mod.json"), manifestText);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const archive = path.join(OUTPUT_DIR, `${id}.zip`);
  fs.rmSync(archive, { force: true });
  // bsdtar de Windows produit un ZIP d'après l'extension. Le chemin est explicite
  // car un shell POSIX installé à côté place son propre tar en tête du PATH, et
  // celui-là lit « C:\... » comme un hôte distant.
  const systemRoot = process.env.SystemRoot || "C:/Windows";
  const tar = process.platform === "win32" ? path.join(systemRoot, "System32", "tar.exe") : "tar";
  execFileSync(tar, ["-a", "-c", "-f", archive, "-C", stage, "livecpk", "stryker.mod.json"], { stdio: "inherit" });

  const size = fs.statSync(archive).size;
  const hash = crypto.createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
  return { id, archive, size, hash, players, fileCount: walk(stage).length, sourceFiles: extracted.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cpkPath, volume] = process.argv.slice(2);
  if (!cpkPath || !volume) {
    console.error("Usage : node scripts/build-facepack-from-cpk.mjs <archive.cpk> <volume>");
    process.exit(1);
  }
  console.log(JSON.stringify(buildFacepack(cpkPath, volume), null, 2));
}
