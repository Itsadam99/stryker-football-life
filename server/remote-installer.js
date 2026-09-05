import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import { assertPathInside, sanitizeSegment } from "./paths.js";

const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024 * 1024;

function repositoryBase(value) {
  let url;
  try { url = new URL(value); }
  catch { throw new Error("Adresse du dépôt STRYKER invalide."); }
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) throw new Error("Le dépôt distant doit utiliser HTTPS.");
  if (url.username || url.password) throw new Error("Les identifiants intégrés à l’adresse du dépôt sont refusés.");
  url.hash = "";
  url.search = "";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url;
}

async function jsonResponse(response, label) {
  if (!response.ok) throw new Error(`${label} (${response.status}).`);
  const type = response.headers.get("content-type") || "";
  const responseHost = new URL(response.url).hostname.toLowerCase();
  const trustedRawGithub = responseHost === "raw.githubusercontent.com";
  if (!type.includes("application/json") && !(trustedRawGithub && type.includes("text/plain"))) {
    throw new Error(`${label} : réponse non JSON.`);
  }
  return response.json();
}

const STRYKER_GITHUB_RELEASE_PREFIX = "/Itsadam99/stryker-football-life/releases/download/";
const GITHUB_RELEASE_HOSTS = new Set(["github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"]);

function trustedDownloadRequest(url, repositoryBaseUrl) {
  if (url.origin === repositoryBaseUrl.origin) return true;
  return url.protocol === "https:"
    && url.hostname.toLowerCase() === "github.com"
    && url.pathname.startsWith(STRYKER_GITHUB_RELEASE_PREFIX);
}

function trustedDownloadResponse(url, requestedUrl, repositoryBaseUrl) {
  if (url.origin === repositoryBaseUrl.origin) return true;
  if (!trustedDownloadRequest(requestedUrl, repositoryBaseUrl)) return false;
  return url.protocol === "https:" && GITHUB_RELEASE_HOSTS.has(url.hostname.toLowerCase());
}

export class RemoteInstaller {
  constructor({ modEngine, dataDirectories }) {
    this.modEngine = modEngine;
    this.dataDirectories = dataDirectories;
  }

  async install(repositoryUrl, modId) {
    const base = repositoryBase(repositoryUrl);
    const safeModId = String(modId || "").trim();
    if (!safeModId || safeModId.length > 200) throw new Error("Identifiant du mod invalide.");
    const detailUrl = new URL(`api/catalog/${encodeURIComponent(safeModId)}`, base);
    const details = await jsonResponse(await fetch(detailUrl, { redirect: "error" }), "Impossible de lire la fiche du mod");
    const record = details.mod;
    if (!record || record.id !== safeModId || !/^[a-f0-9]{64}$/i.test(record.archiveHash || "") || !record.downloadUrl) throw new Error("Fiche de mod distante incomplète.");
    if (record.status !== "published") throw new Error("Ce mod n’est pas disponible à l’installation.");

    const downloadUrl = new URL(record.downloadUrl, base);
    if (!trustedDownloadRequest(downloadUrl, base)) throw new Error("Le téléchargement doit rester sur un stockage STRYKER approuvé.");
    const response = await fetch(downloadUrl, { redirect: "follow" });
    if (!trustedDownloadResponse(new URL(response.url), downloadUrl, base)) {
      throw new Error("Le stockage du mod a redirigé vers un domaine non approuvé.");
    }
    if (!response.ok || !response.body) throw new Error(`Téléchargement du mod impossible (${response.status}).`);
    const announcedSize = Number(response.headers.get("content-length") || 0);
    if (announcedSize > MAX_ARCHIVE_BYTES) throw new Error("Archive supérieure à la limite de 20 Go.");

    // Le moteur choisit son extracteur d'après l'extension : la forcer à .zip
    // rendait tout mod hébergé en .rar ininstallable à distance.
    const sourceExtension = path.extname(new URL(downloadUrl).pathname).toLowerCase();
    const archiveExtension = sourceExtension === ".rar" ? ".rar" : ".zip";
    const target = path.join(this.dataDirectories.downloads, `remote-${sanitizeSegment(safeModId)}-${crypto.randomBytes(5).toString("hex")}${archiveExtension}`);
    assertPathInside(this.dataDirectories.downloads, target, "Téléchargement distant");
    const hash = crypto.createHash("sha256");
    let received = 0;
    const verifier = new Transform({
      transform(chunk, encoding, callback) {
        received += chunk.length;
        if (received > MAX_ARCHIVE_BYTES) return callback(new Error("Archive supérieure à la limite de 20 Go."));
        hash.update(chunk);
        callback(null, chunk);
      },
    });

    try {
      await pipeline(Readable.fromWeb(response.body), verifier, fs.createWriteStream(target, { flags: "wx" }));
      const actualHash = hash.digest("hex");
      if (actualHash.toLowerCase() !== String(record.archiveHash).toLowerCase()) {
        throw new Error("L’empreinte du téléchargement ne correspond pas à la fiche publiée.");
      }
      return await this.modEngine.installArchive(target, {
        id: record.id,
        name: record.title,
        author: record.author,
        version: record.version,
        category: record.category,
        compatibility: record.compatibility,
        sourceUrl: detailUrl.href,
        sourceType: "stryker-hub-remote",
      });
    } finally {
      if (fs.existsSync(target)) fs.rmSync(target, { force: true });
    }
  }
}

export { repositoryBase, trustedDownloadRequest, trustedDownloadResponse };
