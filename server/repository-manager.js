import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import { extractZipSafely } from "./zip-extractor.js";
import { hashFile, walkFiles } from "./mod-engine.js";
import { assertPathInside, sanitizeSegment } from "./paths.js";
import { atomicWriteJson } from "./storage.js";

const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024 * 1024;
const MAX_FILES = 200_000;
const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".dll", ".bat", ".cmd", ".com", ".msi", ".ps1", ".vbs",
  ".py", ".pyw", ".js", ".jse", ".wsf", ".wsh", ".hta", ".scr", ".jar", ".lnk", ".reg", ".sh", ".cpl", ".pif",
]);
const CATEGORIES = new Set(["gameplay", "turf", "menu", "audio", "kit", "face", "scoreboard", "other"]);

function cleanText(value, fallback = "", maxLength = 500) {
  const text = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "";
  return (text || fallback).slice(0, maxLength);
}

function cleanArray(value, maxItems = 20, maxLength = 100) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => cleanText(item, "", maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function cleanWebUrl(value, fallback = "", { httpsOnly = false } = {}) {
  const candidate = cleanText(value, "", 1_000);
  if (!candidate) return fallback;
  try {
    const url = new URL(candidate);
    if (url.username || url.password) return fallback;
    if (url.protocol !== "https:" && (httpsOnly || url.protocol !== "http:")) return fallback;
    return url.href;
  } catch {
    return fallback;
  }
}

function publicRecord(record) {
  const { archivePath, archiveFile, bundled, submitterEmail, reviewNote, ...safe } = record;
  return {
    ...safe,
    downloadUrl: `/api/catalog/${encodeURIComponent(record.id)}/download`,
  };
}

function normalizeState(value) {
  return {
    schemaVersion: 1,
    packages: value?.packages && typeof value.packages === "object" ? value.packages : {},
  };
}

export class RepositoryManager {
  constructor({ dataDirectories, bundledDirectory = "" }) {
    this.dataDirectories = dataDirectories;
    this.bundledDirectory = bundledDirectory;
    this.statePath = path.join(dataDirectories.hub, "repository.json");
    this.state = this.load();
    this.bundledPackages = this.loadBundledPackages();
  }

  loadBundledPackages() {
    const packages = {};
    if (!this.bundledDirectory) return packages;
    const catalogPath = path.join(this.bundledDirectory, "catalog.json");
    if (!fs.existsSync(catalogPath)) return packages;
    let catalog;
    try {
      catalog = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));
    } catch {
      throw new Error("Le catalogue de mods intégré est illisible.");
    }
    if (!Array.isArray(catalog)) throw new Error("Le catalogue de mods intégré doit être une liste.");
    for (const item of catalog) {
      const id = sanitizeSegment(item?.id, "").toLowerCase();
      const archiveFile = path.basename(cleanText(item?.archiveFile, "", 200));
      if (!id || id !== item?.id || !archiveFile.toLowerCase().endsWith(".zip")) throw new Error("Entrée invalide dans le catalogue intégré.");
      const archivePath = path.join(this.bundledDirectory, archiveFile);
      assertPathInside(this.bundledDirectory, archivePath, "Archive intégrée");
      // Third-party archives can remain outside the public source repository.
      // Authorized release maintainers add them locally before packaging.
      if (!fs.existsSync(archivePath) || !fs.statSync(archivePath).isFile()) continue;
      const actualHash = hashFile(archivePath);
      if (actualHash !== String(item.archiveHash || "").toLowerCase()) throw new Error(`Empreinte invalide pour l’archive intégrée ${archiveFile}.`);
      packages[id] = {
        ...item,
        id,
        archiveFile,
        archivePath,
        archiveName: cleanText(item.archiveName, archiveFile, 200),
        archiveSize: fs.statSync(archivePath).size,
        status: "published",
        installationType: "automatic",
        legalStatus: "verified_package",
        bundled: true,
      };
    }
    return packages;
  }

  load() {
    let state = null;
    if (fs.existsSync(this.statePath)) {
      try {
        state = JSON.parse(fs.readFileSync(this.statePath, "utf-8"));
      } catch {
        fs.copyFileSync(this.statePath, `${this.statePath}.corrupt-${Date.now()}`);
      }
    }
    const normalized = normalizeState(state);
    atomicWriteJson(this.statePath, normalized);
    return normalized;
  }

  save() {
    atomicWriteJson(this.statePath, this.state);
  }

  createSubmission(metadata = {}) {
    const title = cleanText(metadata.title, "", 120);
    const author = cleanText(metadata.author, "", 120);
    const version = cleanText(metadata.version, "", 40);
    const shortDesc = cleanText(metadata.shortDesc, "", 240);
    if (!title || !author || !version || !shortDesc) {
      throw new Error("Le nom, l’auteur, la version et la description courte sont obligatoires.");
    }
    if (metadata.distributionPermission !== true) {
      throw new Error("La publication nécessite de confirmer que vous avez le droit de distribuer cette archive.");
    }

    const id = `${sanitizeSegment(title, "mod").toLowerCase()}-${crypto.randomBytes(5).toString("hex")}`;
    const now = new Date().toISOString();
    const record = {
      id,
      title,
      author,
      version,
      shortDesc,
      fullDesc: cleanText(metadata.fullDesc, shortDesc, 5_000),
      category: CATEGORIES.has(metadata.category) ? metadata.category : "other",
      compatibility: cleanArray(metadata.compatibility),
      tags: cleanArray(metadata.tags, 30, 50),
      thumbnail: cleanWebUrl(metadata.thumbnail, "/stryker-logo.png", { httpsOnly: true }),
      screenshots: cleanArray(metadata.screenshots, 10, 1_000).map((value) => cleanWebUrl(value, "", { httpsOnly: true })).filter(Boolean),
      sourceUrl: cleanWebUrl(metadata.sourceUrl),
      license: cleanText(metadata.license, "Permission de redistribution déclarée par l’auteur", 200),
      submitterEmail: cleanText(metadata.submitterEmail, "", 254),
      installationType: "automatic",
      legalStatus: "author_submission",
      status: "awaiting_archive",
      archiveName: "",
      archivePath: "",
      archiveHash: "",
      archiveSize: 0,
      size: "Archive en attente",
      fileCount: 0,
      downloadsCount: 0,
      rating: 0,
      submittedAt: now,
      reviewedAt: null,
      publishedAt: null,
      reviewNote: "",
    };
    this.state.packages[id] = record;
    this.save();
    return publicRecord(record);
  }

  async receiveArchive(id, readable, originalName, contentLength = 0) {
    const record = this.state.packages[id];
    if (!record || record.status !== "awaiting_archive") throw new Error("Soumission introuvable ou archive déjà reçue.");
    const safeName = sanitizeSegment(path.basename(cleanText(originalName, "mod.zip", 200)), "mod.zip");
    if (path.extname(safeName).toLowerCase() !== ".zip") throw new Error("Le fichier envoyé doit être une archive ZIP.");
    if (Number(contentLength) > MAX_ARCHIVE_BYTES) throw new Error("Archive supérieure à la limite de 20 Go.");

    const incomingPath = path.join(this.dataDirectories.hubIncoming, `${id}-${crypto.randomBytes(4).toString("hex")}.zip`);
    assertPathInside(this.dataDirectories.hubIncoming, incomingPath, "Archive entrante");
    let receivedBytes = 0;
    const limiter = new Transform({
      transform(chunk, encoding, callback) {
        receivedBytes += chunk.length;
        if (receivedBytes > MAX_ARCHIVE_BYTES) callback(new Error("Archive supérieure à la limite de 20 Go."));
        else callback(null, chunk);
      },
    });

    try {
      await pipeline(readable, limiter, fs.createWriteStream(incomingPath, { flags: "wx" }));
      const inspection = await this.inspectArchive(incomingPath, id);
      const archiveHash = hashFile(incomingPath);
      const finalName = `${sanitizeSegment(id)}-${archiveHash.slice(0, 12)}.zip`;
      const finalPath = path.join(this.dataDirectories.hubPackages, finalName);
      assertPathInside(this.dataDirectories.hubPackages, finalPath, "Archive publiée");
      fs.renameSync(incomingPath, finalPath);

      Object.assign(record, {
        status: "pending_review",
        archiveName: safeName,
        archivePath: finalPath,
        archiveHash,
        archiveSize: receivedBytes,
        size: receivedBytes >= 1024 * 1024 * 1024
          ? `${(receivedBytes / 1024 / 1024 / 1024).toFixed(2)} Go`
          : `${(receivedBytes / 1024 / 1024).toFixed(1)} Mo`,
        fileCount: inspection.fileCount,
      });
      this.save();
      return publicRecord(record);
    } catch (error) {
      if (fs.existsSync(incomingPath)) fs.rmSync(incomingPath, { force: true });
      throw error;
    }
  }

  async inspectArchive(archivePath, id) {
    const extractRoot = path.join(this.dataDirectories.temp, `review-${sanitizeSegment(id)}-${crypto.randomBytes(4).toString("hex")}`);
    assertPathInside(this.dataDirectories.temp, extractRoot, "Inspection du mod");
    fs.mkdirSync(extractRoot, { recursive: true });
    let fileCount = 0;
    let totalBytes = 0;
    try {
      await extractZipSafely(archivePath, extractRoot, {
        onEntry: (entry) => {
          fileCount += 1;
          totalBytes += Number(entry.uncompressedSize || 0);
          if (fileCount > MAX_FILES || totalBytes > MAX_UNCOMPRESSED_BYTES) {
            throw new Error("Archive refusée : limite de fichiers ou de taille décompressée dépassée.");
          }
        },
      });
      const files = walkFiles(extractRoot);
      const blocked = files.filter((file) => BLOCKED_EXTENSIONS.has(path.extname(file).toLowerCase()));
      if (blocked.length > 0) throw new Error("Archive refusée : elle contient du code exécutable.");
      const normalized = files.map((file) => path.relative(extractRoot, file).replace(/\\/g, "/").toLowerCase());
      const recognizable = normalized.some((file) => /(^|\/)livecpk\//.test(file) || /(^|\/)common\//.test(file) || /(^|\/)modules\/.+\.lua$/.test(file) || /(^|\/)stryker\.mod\.json$/.test(file));
      if (!recognizable) throw new Error("Archive non reconnue : ajoutez une structure LiveCPK, un module Lua ou un manifeste stryker.mod.json.");
      return { fileCount: files.length, totalBytes };
    } finally {
      if (fs.existsSync(extractRoot)) fs.rmSync(extractRoot, { recursive: true, force: true });
    }
  }

  listPublished() {
    return [...Object.values(this.bundledPackages), ...Object.values(this.state.packages)]
      .filter((record) => record.status === "published")
      .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
      .map(publicRecord);
  }

  listSubmissions() {
    return Object.values(this.state.packages)
      .filter((record) => record.status !== "published")
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .map((record) => ({ ...publicRecord(record), submitterEmail: record.submitterEmail, reviewNote: record.reviewNote }));
  }

  getPublished(id) {
    const record = this.bundledPackages[id] || this.state.packages[id];
    return record?.status === "published" ? publicRecord(record) : null;
  }

  getArchive(id, { allowPending = false } = {}) {
    const record = this.bundledPackages[id] || this.state.packages[id];
    if (!record || (!allowPending && record.status !== "published")) throw new Error("Mod publié introuvable.");
    if (!record.archivePath || !fs.existsSync(record.archivePath)) throw new Error("Archive du mod introuvable sur le dépôt.");
    assertPathInside(record.bundled ? this.bundledDirectory : this.dataDirectories.hubPackages, record.archivePath, "Archive du dépôt");
    return { record, archivePath: record.archivePath };
  }

  publish(id) {
    const record = this.state.packages[id];
    if (!record || record.status !== "pending_review" || !record.archiveHash) throw new Error("Cette soumission n’est pas prête à être publiée.");
    record.status = "published";
    record.reviewedAt = new Date().toISOString();
    record.publishedAt = record.reviewedAt;
    record.verificationDate = record.reviewedAt.slice(0, 10);
    record.legalStatus = "verified_package";
    this.save();
    return publicRecord(record);
  }

  reject(id, note = "") {
    const record = this.state.packages[id];
    if (!record || record.status === "published") throw new Error("Soumission introuvable ou déjà publiée.");
    record.status = "rejected";
    record.reviewedAt = new Date().toISOString();
    record.reviewNote = cleanText(note, "Soumission refusée par la modération.", 1_000);
    this.save();
    return publicRecord(record);
  }

  incrementDownloads(id) {
    if (this.bundledPackages[id]) {
      this.bundledPackages[id].downloadsCount = Number(this.bundledPackages[id].downloadsCount || 0) + 1;
      return;
    }
    const record = this.state.packages[id];
    if (!record || record.status !== "published") return;
    record.downloadsCount = Number(record.downloadsCount || 0) + 1;
    this.save();
  }

  installMetadata(record) {
    return {
      id: record.id,
      name: record.title,
      author: record.author,
      version: record.version,
      category: record.category,
      compatibility: record.compatibility,
      sourceUrl: record.sourceUrl,
      sourceType: "stryker-hub",
    };
  }
}
