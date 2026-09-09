// Read-only PES CPK/UTF parser. Format cross-check: pes-file-tools cpk.py.
// Reads one requested table, never extracts paths from the archive to disk.
import fs from 'node:fs';

const LIMIT = 32 * 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true });
function bounded(buffer, offset, length) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > buffer.length) throw new Error('Champ CPK hors limites.');
  return buffer.subarray(offset, offset + length);
}
function text(buffer, offset, end = buffer.length) {
  const bytes = bounded(buffer, offset, end - offset), zero = bytes.indexOf(0);
  if (zero < 0) throw new Error('Texte CPK incomplet.');
  return decoder.decode(bytes.subarray(0, zero));
}

function table(input) {
  const b = Buffer.from(input);
  if (b.subarray(0, 4).toString('ascii') !== '@UTF') {
    let mask = 0x5f;
    for (let i = 0; i < b.length; i++) { b[i] ^= mask; mask = (mask * 0x15) & 255; }
  }
  if (b.length < 32 || b.subarray(0, 4).toString('ascii') !== '@UTF' || b.readUInt32BE(4) + 8 !== b.length) throw new Error('Table CPK UTF incompatible.');
  const rowsAt = b.readUInt32BE(8) + 8, stringsAt = b.readUInt32BE(12) + 8, dataAt = b.readUInt32BE(16) + 8;
  const count = b.readUInt16BE(24), rowLength = b.readUInt16BE(26), rowCount = b.readUInt32BE(28);
  if (count > 256 || rowCount > 500000 || rowsAt < 32 || stringsAt < rowsAt || dataAt < stringsAt || dataAt > b.length || rowsAt + rowLength * rowCount > stringsAt) throw new Error('Dimensions CPK UTF incohérentes.');
  const widths = [1, 1, 2, 2, 4, 4, 8, 8, 4, 8, 4, 8];
  function value(at, type) {
    const width = widths[type];
    if (!width) throw new Error('Type CPK inconnu.');
    bounded(b, at, width);
    if (type === 10) return text(b, stringsAt + b.readUInt32BE(at), dataAt);
    if (type === 11) return bounded(b, dataAt + b.readUInt32BE(at), b.readUInt32BE(at + 4));
    if (type === 8) return b.readFloatBE(at);
    if (type === 9) return b.readDoubleBE(at);
    if (type < 6) return type % 2 ? b.readIntBE(at, width) : b.readUIntBE(at, width);
    const result = Number(type % 2 ? b.readBigInt64BE(at) : b.readBigUInt64BE(at));
    if (!Number.isSafeInteger(result)) throw new Error('Valeur CPK trop grande.');
    return result;
  }
  const columns = [], names = new Set();
  let cursor = 32;
  for (let i = 0; i < count; i++) {
    bounded(b, cursor, 5);
    const flags = b[cursor], type = flags & 15, storage = flags >>> 4;
    const name = text(b, stringsAt + b.readUInt32BE(cursor + 1), dataAt); cursor += 5;
    if (names.has(name) || ![1, 3, 5].includes(storage) || !widths[type]) throw new Error('Colonne CPK incompatible.');
    names.add(name);
    const constant = storage === 3 ? value(cursor, type) : null;
    if (storage === 3) cursor += widths[type];
    columns.push({ name, type, storage, constant });
  }
  if (cursor > rowsAt) throw new Error('Colonnes CPK hors limites.');
  const rows = [];
  for (let i = 0; i < rowCount; i++) {
    cursor = rowsAt + i * rowLength;
    const row = Object.create(null);
    for (const column of columns) {
      row[column.name] = column.storage === 5 ? value(cursor, column.type) : column.constant;
      if (column.storage === 5) cursor += widths[column.type];
    }
    if (cursor !== rowsAt + (i + 1) * rowLength) throw new Error('Longueur de ligne CPK incohérente.');
    rows.push(row);
  }
  return rows;
}

export function readCpkFile(file, entryName) {
  if (typeof entryName !== 'string' || !/^common\/etc\/pesdb\/[A-Za-z]+\.bin$/.test(entryName)) throw new Error('Seules les tables de jeu connues sont accessibles.');
  const fd = fs.openSync(file, 'r');
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error('Archive CPK invalide.');
    function read(offset, size) {
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || size > LIMIT || offset + size > stat.size) throw new Error('Lecture CPK hors limites.');
      const bytes = Buffer.alloc(size);
      let done = 0;
      while (done < size) { const count = fs.readSync(fd, bytes, done, size - done, offset + done); if (!count) throw new Error('Archive CPK tronquée.'); done += count; }
      return bytes;
    }
    function section(offset, expected) {
      const header = read(offset, 16);
      if (header.subarray(0, 4).toString('ascii') !== expected) throw new Error('Section CPK inattendue.');
      return table(read(offset + 16, Number(header.readBigUInt64LE(8))));
    }
    const headers = section(0, 'CPK ');
    if (headers.length !== 1 || !Number.isSafeInteger(headers[0].TocOffset)) throw new Error('Index CPK manquant.');
    // PES's CPK reader uses the 0x800 base, independently of ContentOffset.
    const rows = section(headers[0].TocOffset, 'TOC ');
    const matches = rows.filter(row => `${row.DirName}/${row.FileName}`.replaceAll('\\', '/').replace(/^\/+/, '') === entryName);
    if (!matches.length) return null;
    if (matches.length !== 1) throw new Error('Table dupliquée dans le CPK.');
    const entry = matches[0];
    if (entry.FileSize !== entry.ExtractSize) throw new Error('Compression CPK supplémentaire non prise en charge pour cette table.');
    const result = read(entry.FileOffset + 0x800, entry.FileSize), after = fs.fstatSync(fd);
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw new Error('La base de jeu a changé pendant la lecture.');
    return result;
  } finally { fs.closeSync(fd); }
}
