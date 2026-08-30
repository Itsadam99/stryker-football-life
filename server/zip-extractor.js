import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import yauzl from "yauzl";
import { assertPathInside } from "./paths.js";

const UNIX_FILE_TYPE = 0o170000;
const UNIX_REGULAR = 0o100000;
const UNIX_DIRECTORY = 0o040000;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

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

function rejectSpecialEntry(entry, name) {
  const platform = entry.versionMadeBy >>> 8;
  if (platform !== 3) return;
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
  const type = mode & UNIX_FILE_TYPE;
  if (type !== 0 && type !== UNIX_REGULAR && type !== UNIX_DIRECTORY) {
    throw new Error(`Lien ou fichier spécial refusé dans l’archive : ${name}`);
  }
}

export function extractZipSafely(archivePath, destination, { onEntry = () => {} } = {}) {
  fs.mkdirSync(destination, { recursive: true });
  return new Promise((resolve, reject) => {
    let archive = null;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      try { archive?.close(); } catch { /* already closed */ }
      reject(error);
    };

    yauzl.open(archivePath, {
      lazyEntries: true,
      autoClose: true,
      decodeStrings: true,
      strictFileNames: true,
      validateEntrySizes: true,
    }, (openError, zipfile) => {
      if (openError) return fail(openError);
      archive = zipfile;
      zipfile.on("error", fail);
      zipfile.on("end", () => {
        if (settled) return;
        settled = true;
        resolve();
      });
      zipfile.on("entry", (entry) => {
        try {
          const { name, parts } = validateEntryName(entry.fileName);
          rejectSpecialEntry(entry, name);
          onEntry(entry, name);
          const target = path.resolve(destination, ...parts);
          assertPathInside(destination, target, "Fichier extrait");
          const isDirectory = name.endsWith("/");
          if (isDirectory) {
            if (fs.existsSync(target) && !fs.statSync(target).isDirectory()) throw new Error(`Collision de chemin dans l’archive : ${name}`);
            fs.mkdirSync(target, { recursive: true });
            zipfile.readEntry();
            return;
          }
          if (fs.existsSync(target)) throw new Error(`Fichier dupliqué dans l’archive : ${name}`);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          zipfile.openReadStream(entry, (streamError, readStream) => {
            if (streamError) return fail(streamError);
            const writeStream = fs.createWriteStream(target, { flags: "wx", mode: 0o600 });
            pipeline(readStream, writeStream)
              .then(() => { if (!settled) zipfile.readEntry(); })
              .catch(fail);
          });
        } catch (error) {
          fail(error);
        }
      });
      zipfile.readEntry();
    });
  });
}
