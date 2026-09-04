import fs from "fs";
import path from "path";
import { createExtractorFromFile } from "node-unrar-js";
import { assertPathInside } from "./paths.js";

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

/**
 * Mêmes règles que l'extracteur ZIP : pas de chemin absolu, pas de remontée,
 * pas de nom impossible sous Windows.
 */
function validateEntryName(value) {
  const name = String(value || "").replace(/\\/g, "/");
  const parts = name.split("/").filter(Boolean);
  if (!name || name.includes("\0") || name.startsWith("/") || name.startsWith("//") || /^[a-zA-Z]:\//.test(name) || parts.includes("..")) {
    throw new Error(`Chemin dangereux détecté dans l’archive : ${name || "(vide)"}`);
  }
  if (process.platform === "win32" && parts.some((part) => /[:*?"<>|]/.test(part) || /[. ]$/.test(part) || WINDOWS_RESERVED.test(part))) {
    throw new Error(`Nom de fichier Windows invalide dans l’archive : ${name}`);
  }
  return { name, parts };
}

/**
 * Extrait une archive RAR dans `destination`.
 *
 * Contrairement à l'extracteur ZIP qui écrit chaque entrée lui-même, la
 * bibliothèque RAR n'expose le contenu qu'en écrivant sur disque ou en
 * chargeant l'archive entière en mémoire — ingérable pour les archives de
 * plusieurs gigaoctets. On procède donc en trois temps : valider tous les noms
 * *avant* d'écrire quoi que ce soit, extraire, puis vérifier qu'aucun fichier
 * n'a atterri hors du dossier cible.
 *
 * Le refus des exécutables reste en aval, dans le moteur de mods : il porte sur
 * le contenu extrait et vaut donc pour tous les formats.
 */
export async function extractRarSafely(archivePath, destination, { onEntry = () => {} } = {}) {
  fs.mkdirSync(destination, { recursive: true });

  const extractor = await createExtractorFromFile({ filepath: archivePath, targetPath: destination });

  const headers = [...extractor.getFileList().fileHeaders];
  if (headers.length === 0) throw new Error("Archive RAR vide.");

  const seen = new Set();
  for (const header of headers) {
    if (header.flags.encrypted) {
      throw new Error("Archive RAR protégée par mot de passe : extrayez-la vous-même puis réessayez.");
    }
    const { name, parts } = validateEntryName(header.name);
    const target = path.resolve(destination, ...parts);
    assertPathInside(destination, target, "Fichier extrait");

    if (header.flags.directory) continue;

    const key = target.toLowerCase();
    if (seen.has(key)) throw new Error(`Fichier dupliqué dans l’archive : ${name}`);
    seen.add(key);

    // Même forme que les entrées yauzl, pour que le moteur de mods applique ses
    // limites de taille et de nombre sans distinguer les formats.
    onEntry({ uncompressedSize: Number(header.unpSize || 0) }, name);
  }

  // Tous les noms sont sûrs : l'extraction ne peut plus écrire hors de la cible.
  const extraction = extractor.extract();
  const written = [...extraction.files];

  for (const file of written) {
    const { parts } = validateEntryName(file.fileHeader.name);
    if (file.fileHeader.flags.directory) continue;
    assertPathInside(destination, path.resolve(destination, ...parts), "Fichier extrait");
  }

  return { entries: written.length };
}
