import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import { assertPathInside } from "./paths.js";

const MAGIC = Buffer.from("STRYKR1\0", "ascii");
const HEADER_BYTES = MAGIC.length + 4;
const MAX_INDEX_BYTES = 32 * 1024 * 1024;
const MAX_FILES = 200_000;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024 * 1024;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".dll", ".bat", ".cmd", ".com", ".msi", ".ps1", ".vbs",
  ".py", ".pyw", ".js", ".jse", ".wsf", ".wsh", ".hta", ".scr", ".jar", ".lnk", ".reg", ".sh", ".cpl", ".pif",
]);

function normalizedRelativePath(value) {
  const name = String(value || "").replace(/\\/g, "/");
  const parts = name.split("/").filter(Boolean);
  if (!name || name.includes("\0") || name.startsWith("/") || name.startsWith("//") || /^[a-zA-Z]:\//.test(name) || parts.includes("..")) {
    throw new Error(`Chemin dangereux détecté dans le paquet STRYKER : ${name || "(vide)"}`);
  }
  if (process.platform === "win32" && parts.some((part) => /[:*?"<>|]/.test(part) || /[. ]$/.test(part) || WINDOWS_RESERVED.test(part))) {
    throw new Error(`Nom de fichier Windows invalide dans le paquet STRYKER : ${name}`);
  }
  if (BLOCKED_EXTENSIONS.has(path.extname(name).toLowerCase())) {
    throw new Error(`Paquet STRYKER refusé : code exécutable détecté (${name}).`);
  }
  return { name: parts.join("/"), parts };
}

function listPayloadFiles(root, includeRoots = ["."]) {
  const files = [];
  const stack = includeRoots.map((included) => {
    const absolute = path.resolve(root, included);
    assertPathInside(root, absolute, "Racine du payload STRYKER");
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) throw new Error(`Racine du payload introuvable : ${included}`);
    return absolute;
  });
  while (stack.length > 0) {
    const directory = stack.pop();
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => b.name.localeCompare(a.name, "en"));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Les liens symboliques ne sont pas acceptés dans un paquet STRYKER.");
      if (entry.isDirectory()) stack.push(absolute);
      if (!entry.isFile()) continue;
      const relative = path.relative(root, absolute).replace(/\\/g, "/");
      if (["stryker.mod.json", "stryker.payload.br"].includes(relative.toLowerCase())) continue;
      const { name } = normalizedRelativePath(relative);
      files.push({ path: name, absolute, size: fs.statSync(absolute).size });
      if (files.length > MAX_FILES) throw new Error("Paquet STRYKER refusé : trop de fichiers.");
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path, "en"));
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_TOTAL_BYTES) throw new Error("Paquet STRYKER refusé : taille décompressée supérieure à 100 Go.");
  return { files, totalBytes };
}

export async function createPackedPayload(sourceRoot, outputPath, { includeRoots = ["."] } = {}) {
  const root = path.resolve(sourceRoot);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error("Dossier source du paquet STRYKER introuvable.");
  const destination = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.partial`;
  if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });

  const { files, totalBytes } = listPayloadFiles(root, includeRoots);
  if (files.length === 0) throw new Error("Le paquet STRYKER ne contient aucun fichier utile.");
  const index = Buffer.from(JSON.stringify({ version: 1, files: files.map(({ path: filePath, size }) => ({ path: filePath, size })) }), "utf-8");
  if (index.length > MAX_INDEX_BYTES) throw new Error("Index du paquet STRYKER trop volumineux.");
  const header = Buffer.allocUnsafe(HEADER_BYTES);
  MAGIC.copy(header, 0);
  header.writeUInt32BE(index.length, MAGIC.length);

  async function* source() {
    yield header;
    yield index;
    for (const file of files) {
      for await (const chunk of fs.createReadStream(file.absolute)) yield chunk;
    }
  }

  try {
    await pipeline(
      Readable.from(source()),
      zlib.createBrotliCompress({
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 8,
          [zlib.constants.BROTLI_PARAM_LGWIN]: 24,
          [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_GENERIC,
        },
      }),
      fs.createWriteStream(temporary, { flags: "wx", mode: 0o600 }),
    );
    fs.renameSync(temporary, destination);
    return { fileCount: files.length, totalBytes, packedBytes: fs.statSync(destination).size };
  } catch (error) {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
    throw error;
  }
}

export async function expandPackedPayload(extractRoot, { removeSource = true } = {}) {
  const root = path.resolve(extractRoot);
  const payloadPath = path.join(root, "stryker.payload.br");
  if (!fs.existsSync(payloadPath)) return null;
  if (!fs.statSync(payloadPath).isFile()) throw new Error("Payload STRYKER invalide.");

  const stream = fs.createReadStream(payloadPath).pipe(zlib.createBrotliDecompress());
  let pending = Buffer.alloc(0);
  let indexLength = null;
  let index = null;
  let fileIndex = 0;
  let descriptor = null;
  let currentWritten = 0;
  let expandedBytes = 0;

  const openCurrentFile = () => {
    while (index && fileIndex < index.files.length && index.files[fileIndex].size === 0) {
      const entry = index.files[fileIndex];
      fs.mkdirSync(path.dirname(entry.target), { recursive: true });
      const empty = fs.openSync(entry.target, "wx", 0o600);
      fs.closeSync(empty);
      fileIndex += 1;
    }
    if (index && fileIndex < index.files.length && descriptor === null) {
      const entry = index.files[fileIndex];
      fs.mkdirSync(path.dirname(entry.target), { recursive: true });
      descriptor = fs.openSync(entry.target, "wx", 0o600);
      currentWritten = 0;
    }
  };

  try {
    for await (const chunk of stream) {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      if (indexLength === null && pending.length >= HEADER_BYTES) {
        if (!pending.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Signature du paquet STRYKER invalide.");
        indexLength = pending.readUInt32BE(MAGIC.length);
        if (indexLength < 2 || indexLength > MAX_INDEX_BYTES) throw new Error("Index du paquet STRYKER invalide.");
        pending = pending.subarray(HEADER_BYTES);
      }
      if (!index && indexLength !== null && pending.length >= indexLength) {
        let parsed;
        try { parsed = JSON.parse(pending.subarray(0, indexLength).toString("utf-8")); }
        catch { throw new Error("Index du paquet STRYKER illisible."); }
        if (parsed?.version !== 1 || !Array.isArray(parsed.files) || parsed.files.length === 0 || parsed.files.length > MAX_FILES) {
          throw new Error("Structure du paquet STRYKER invalide.");
        }
        let totalBytes = 0;
        const seen = new Set();
        const files = parsed.files.map((entry) => {
          const { name, parts } = normalizedRelativePath(entry?.path);
          const size = Number(entry?.size);
          if (!Number.isSafeInteger(size) || size < 0) throw new Error(`Taille invalide dans le paquet STRYKER : ${name}`);
          const key = name.toLowerCase();
          if (seen.has(key)) throw new Error(`Fichier dupliqué dans le paquet STRYKER : ${name}`);
          seen.add(key);
          totalBytes += size;
          if (totalBytes > MAX_TOTAL_BYTES) throw new Error("Paquet STRYKER refusé : taille décompressée supérieure à 100 Go.");
          const target = path.resolve(root, ...parts);
          assertPathInside(root, target, "Fichier du payload STRYKER");
          if (fs.existsSync(target)) throw new Error(`Collision de chemin dans le paquet STRYKER : ${name}`);
          return { path: name, size, target };
        });
        index = { files, totalBytes };
        pending = pending.subarray(indexLength);
        openCurrentFile();
      }

      while (index && pending.length > 0 && fileIndex < index.files.length) {
        openCurrentFile();
        const current = index.files[fileIndex];
        const remaining = current.size - currentWritten;
        const consumed = Math.min(remaining, pending.length);
        if (consumed > 0) {
          fs.writeSync(descriptor, pending, 0, consumed);
          currentWritten += consumed;
          expandedBytes += consumed;
          pending = pending.subarray(consumed);
        }
        if (currentWritten === current.size) {
          fs.closeSync(descriptor);
          descriptor = null;
          fileIndex += 1;
          openCurrentFile();
        }
      }
    }
    if (!index || fileIndex !== index.files.length || descriptor !== null || pending.length !== 0 || expandedBytes !== index.totalBytes) {
      throw new Error("Payload STRYKER tronqué ou contenant des données inattendues.");
    }
    if (removeSource) fs.rmSync(payloadPath, { force: true });
    return { fileCount: index.files.length, totalBytes: index.totalBytes };
  } catch (error) {
    if (descriptor !== null) fs.closeSync(descriptor);
    throw error;
  }
}
