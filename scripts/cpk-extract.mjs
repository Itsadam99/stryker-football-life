#!/usr/bin/env node
/**
 * Extrait une archive CRI CPK vers un dossier.
 *
 * STRYKER refuse volontairement d’installer un CPK : Sider ne le charge pas et
 * son contenu n’est pas inspectable avant écriture. Les packs distribués en CPK
 * sont donc convertis ici, au moment de l’empaquetage, vers l’arborescence
 * LiveCPK que le moteur sait déployer, désactiver et retirer.
 *
 *   node scripts/cpk-extract.mjs <archive.cpk> <dossier-de-sortie>
 *
 * Lecture seule sur l’archive ; rien de son contenu n’est exécuté.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Les tables @UTF d’un CPK sont masquées par un XOR à congruence linéaire.
function unmask(buffer) {
  const out = Buffer.from(buffer);
  let key = 0x655f;
  for (let i = 0; i < out.length; i += 1) {
    out[i] ^= key & 0xff;
    key = Math.imul(key, 0x4115) >>> 0;
  }
  return out;
}

function readString(buffer, start) {
  let end = start;
  while (end < buffer.length && buffer[end] !== 0) end += 1;
  return buffer.toString("utf8", start, end);
}

function parseUtf(raw) {
  let buffer = raw;
  if (buffer.toString("ascii", 0, 4) !== "@UTF") buffer = unmask(buffer);
  if (buffer.toString("ascii", 0, 4) !== "@UTF") throw new Error("Table @UTF illisible : archive CPK inattendue.");

  const base = 8;
  const rowsOffset = base + buffer.readUInt16BE(10);
  const stringsOffset = base + buffer.readUInt32BE(12);
  const dataOffset = base + buffer.readUInt32BE(16);
  const columnCount = buffer.readUInt16BE(24);
  const rowLength = buffer.readUInt16BE(26);
  const rowCount = buffer.readUInt32BE(28);

  const readValue = (type, at) => {
    switch (type) {
      case 0x00: return [buffer.readUInt8(at), 1];
      case 0x01: return [buffer.readInt8(at), 1];
      case 0x02: return [buffer.readUInt16BE(at), 2];
      case 0x03: return [buffer.readInt16BE(at), 2];
      case 0x04: return [buffer.readUInt32BE(at), 4];
      case 0x05: return [buffer.readInt32BE(at), 4];
      case 0x06: return [Number(buffer.readBigUInt64BE(at)), 8];
      case 0x07: return [Number(buffer.readBigInt64BE(at)), 8];
      case 0x08: return [buffer.readFloatBE(at), 4];
      case 0x09: return [buffer.readDoubleBE(at), 8];
      case 0x0a: return [readString(buffer, stringsOffset + buffer.readUInt32BE(at)), 4];
      case 0x0b: {
        const position = dataOffset + buffer.readUInt32BE(at);
        const size = buffer.readUInt32BE(at + 4);
        return [buffer.subarray(position, position + size), 8];
      }
      default: throw new Error("Type de colonne @UTF non pris en charge : " + type);
    }
  };

  const columns = [];
  let cursor = 32;
  for (let i = 0; i < columnCount; i += 1) {
    const flags = buffer.readUInt8(cursor);
    cursor += 1;
    const type = flags & 0x0f;
    let name = "";
    if (flags & 0x10) {
      name = readString(buffer, stringsOffset + buffer.readUInt32BE(cursor));
      cursor += 4;
    }
    let constant;
    if (flags & 0x20) {
      const [value, width] = readValue(type, cursor);
      constant = value;
      cursor += width;
    }
    columns.push({ name, type, perRow: Boolean(flags & 0x40), constant });
  }

  const rows = [];
  for (let index = 0; index < rowCount; index += 1) {
    let at = rowsOffset + index * rowLength;
    const row = {};
    for (const column of columns) {
      if (column.perRow) {
        const [value, width] = readValue(column.type, at);
        row[column.name] = value;
        at += width;
      } else {
        row[column.name] = column.constant === undefined ? 0 : column.constant;
      }
    }
    rows.push(row);
  }
  return rows;
}

function utfAt(file, offset) {
  const header = Buffer.alloc(16);
  fs.readSync(file, header, 0, 16, offset);
  const size = Number(header.readBigUInt64LE(8));
  const table = Buffer.alloc(size);
  fs.readSync(file, table, 0, size, offset + 16);
  return parseUtf(table);
}

/**
 * CRILAYLA écrit son flux de bits à l’envers : la fin du tampon est lue en
 * premier et la sortie se remplit de la fin vers le début. Les 0x100 premiers
 * octets du fichier d’origine voyagent en clair à la fin du bloc compressé.
 */
function decompressCrilayla(input) {
  const uncompressedSize = input.readUInt32LE(8);
  const headerOffset = input.readUInt32LE(12);
  const output = Buffer.alloc(uncompressedSize + 0x100);
  input.copy(output, 0, 0x10 + headerOffset, 0x10 + headerOffset + 0x100);

  let readAt = input.length - 0x100 - 1;
  let pool = 0;
  let poolBits = 0;
  const nextBits = (count) => {
    let value = 0;
    let produced = 0;
    while (produced < count) {
      if (poolBits === 0) {
        pool = input[readAt];
        poolBits = 8;
        readAt -= 1;
      }
      const take = Math.min(poolBits, count - produced);
      value = ((value << take) | ((pool >> (poolBits - take)) & ((1 << take) - 1))) >>> 0;
      poolBits -= take;
      produced += take;
    }
    return value;
  };

  const end = 0x100 + uncompressedSize - 1;
  const levels = [2, 3, 5, 8];
  let written = 0;
  while (written < uncompressedSize) {
    if (nextBits(1) > 0) {
      let source = end - written + nextBits(13) + 3;
      let length = 3;
      let level = 0;
      for (; level < levels.length; level += 1) {
        const step = nextBits(levels[level]);
        length += step;
        if (step !== (1 << levels[level]) - 1) break;
      }
      if (level === levels.length) {
        let step = 0;
        do {
          step = nextBits(8);
          length += step;
        } while (step === 255);
      }
      for (let i = 0; i < length; i += 1) {
        output[end - written] = output[source];
        source -= 1;
        written += 1;
      }
    } else {
      output[end - written] = nextBits(8);
      written += 1;
    }
  }
  return output;
}

const BACKSLASH = String.fromCharCode(92);

function safeSegments(value) {
  const parts = String(value || "")
    .split("/")
    .flatMap((part) => part.split(BACKSLASH))
    .filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) throw new Error("Chemin dangereux dans le CPK : " + value);
  return parts;
}

/** Table des matières seule : aucun octet de contenu n’est lu ni écrit. */
export function listCpk(archivePath) {
  const file = fs.openSync(archivePath, "r");
  try {
    const magic = Buffer.alloc(4);
    fs.readSync(file, magic, 0, 4, 0);
    if (magic.toString("ascii") !== "CPK ") throw new Error("Ce fichier n’est pas une archive CPK.");
    const header = utfAt(file, 0)[0];
    const tocOffset = Number(header.TocOffset || 0);
    if (!tocOffset) throw new Error("CPK sans table des matières : format non pris en charge.");
    return utfAt(file, tocOffset).map((entry) => ({
      path: [...safeSegments(entry.DirName), ...safeSegments(entry.FileName)].join("/"),
      size: Number(entry.ExtractSize || entry.FileSize),
    }));
  } finally {
    fs.closeSync(file);
  }
}

export function extractCpk(archivePath, destination) {
  const file = fs.openSync(archivePath, "r");
  try {
    const magic = Buffer.alloc(4);
    fs.readSync(file, magic, 0, 4, 0);
    if (magic.toString("ascii") !== "CPK ") throw new Error("Ce fichier n’est pas une archive CPK.");

    const header = utfAt(file, 0)[0];
    const tocOffset = Number(header.TocOffset || 0);
    const contentOffset = Number(header.ContentOffset || 0);
    if (!tocOffset) throw new Error("CPK sans table des matières : format non pris en charge.");
    const base = contentOffset && contentOffset < tocOffset ? contentOffset : tocOffset;

    const root = path.resolve(destination);
    const written = [];
    for (const entry of utfAt(file, tocOffset)) {
      const segments = [...safeSegments(entry.DirName), ...safeSegments(entry.FileName)];
      const target = path.resolve(root, ...segments);
      if (!target.startsWith(root + path.sep)) throw new Error("Sortie hors du dossier cible : " + entry.FileName);

      const stored = Buffer.alloc(Number(entry.FileSize));
      fs.readSync(file, stored, 0, stored.length, Number(entry.FileOffset) + base);
      const extractSize = Number(entry.ExtractSize || entry.FileSize);
      const payload = extractSize > stored.length && stored.toString("ascii", 0, 8) === "CRILAYLA"
        ? decompressCrilayla(stored)
        : stored;

      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, payload);
      written.push({ file: segments.join("/"), size: payload.length });
    }
    return written;
  } finally {
    fs.closeSync(file);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [archive, destination] = process.argv.slice(2);
  if (!archive || !destination) {
    console.error("Usage : node scripts/cpk-extract.mjs <archive.cpk> <dossier-de-sortie>");
    process.exit(1);
  }
  const files = extractCpk(archive, destination);
  const total = files.reduce((sum, item) => sum + item.size, 0);
  console.log(files.length + " fichiers extraits, " + (total / 1048576).toFixed(1) + " Mo");
}
