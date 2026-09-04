#!/usr/bin/env node
/**
 * Publie une version de STRYKER sur GitHub Releases.
 *
 * Le manifeste latest.yml est ce qui permet à electron-updater de voir la
 * nouvelle version : publier l'installateur sans lui coupe silencieusement les
 * mises à jour de tout le parc. Ce script refuse donc de publier un lot
 * incomplet ou incohérent, plutôt que de laisser l'oubli passer.
 *
 *   npm run release            publie la version de package.json
 *   npm run release -- --dry   contrôle le lot sans rien envoyer
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_DIR = path.join(ROOT, "release");
const dryRun = process.argv.includes("--dry");

function fail(message) {
  console.error(`[STRYKER] ${message}`);
  process.exit(1);
}

function gh(args, { capture = false } = {}) {
  try {
    return execFileSync("gh", args, {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
  } catch (error) {
    if (capture) return null;
    throw error;
  }
}

const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
const tag = `v${version}`;

const installer = path.join(RELEASE_DIR, "STRYKER-Setup-x64.exe");
const blockmap = `${installer}.blockmap`;
const manifest = path.join(RELEASE_DIR, "latest.yml");

for (const [label, file] of [["installateur", installer], ["blockmap", blockmap], ["manifeste latest.yml", manifest]]) {
  if (!fs.existsSync(file)) fail(`${label} introuvable : ${file}\nLancez d'abord « npm run package:win ».`);
}

// Le manifeste doit décrire exactement la version que l'on publie, sinon les
// clients téléchargeraient un installateur qui ne correspond pas.
const manifestText = fs.readFileSync(manifest, "utf-8");
const manifestVersion = manifestText.match(/^version:\s*(.+)$/m)?.[1]?.trim();
if (manifestVersion !== version) {
  fail(`latest.yml annonce la version ${manifestVersion || "?"} alors que package.json est en ${version}.\nRelancez « npm run package:win » après avoir changé la version.`);
}

const installerSize = fs.statSync(installer).size;
const manifestSize = Number(manifestText.match(/^\s+size:\s*(\d+)$/m)?.[1]);
if (Number.isFinite(manifestSize) && manifestSize !== installerSize) {
  fail(`latest.yml décrit un installateur de ${manifestSize} octets, mais le fichier en fait ${installerSize}.\nLe lot est incohérent : relancez « npm run package:win ».`);
}

console.log(`[STRYKER] Version    : ${version}`);
console.log(`[STRYKER] Tag        : ${tag}`);
console.log(`[STRYKER] Installateur : ${(installerSize / 1024 / 1024).toFixed(1)} Mo`);

if (dryRun) {
  console.log("[STRYKER] --dry : lot cohérent, rien n'a été envoyé.");
  process.exit(0);
}

const exists = gh(["release", "view", tag, "--json", "tagName"], { capture: true });
if (exists) {
  console.log(`[STRYKER] La release ${tag} existe déjà, mise à jour de ses fichiers.`);
} else {
  console.log(`[STRYKER] Création de la release ${tag}.`);
  gh(["release", "create", tag, "--title", `STRYKER ${version}`, "--notes", `Version ${version} de STRYKER.`]);
}

// --clobber : republier une version corrige les fichiers au lieu d'échouer.
gh(["release", "upload", tag, installer, blockmap, manifest, "--clobber"]);

console.log(`[STRYKER] Publié. Les clients verront la mise à jour au prochain démarrage.`);
