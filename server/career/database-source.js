// Read configured local database sources; never write or extract game files.
// Sider priority: https://mapote.com/doc/sider/sider7/readme.html (cpk.root).
// Native list order: the patch author's priority/extra-slot documentation,
// https://www.pessmokepatch.com/2018/11/dpfilelist.html, cross-checked against
// the original format research: https://implyingrigged.info/wiki/Pro_Evolution_Soccer_2019/CPK.
// Only the observed FL26 48-byte list layout is supported, not arbitrary DLC lists.
import fs from 'node:fs';
import path from 'node:path';
import { readCpkFile } from './cpk-reader.js';
import { unpackDatabase } from './database-codec.js';
import { readCoachTable } from './coach-table.js';
import { sha256 } from './bal-adapter.js';

const ENTRY = 'common/etc/pesdb/Coach.bin';
const MAX_DATABASE = 32 * 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true });
const same = (a, b) => a === null ? b === null : b !== null
  && ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].every(key => a[key] === b[key]);

function stat(file) {
  try { return fs.lstatSync(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function localPath(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 32760
    || /[\u0000-\u001f<>"|?*]/.test(value) || /^[\\/]{2}/.test(value)
    || /:/.test(value.replace(/^[A-Za-z]:[\\/]/, ''))) throw new Error('Chemin local de base incompatible.');
  return value.replaceAll('\\', path.sep);
}
function absolute(value) {
  const checked = localPath(value);
  if (!path.isAbsolute(checked)) throw new Error('Un chemin local absolu est obligatoire.');
  return path.resolve(checked);
}
function directory(value) {
  const file = absolute(value), info = stat(file);
  if (!info?.isDirectory() || info.isSymbolicLink()) throw new Error('Dossier de jeu ou de contenu incompatible.');
  return fs.realpathSync(file);
}
function contained(root, file) {
  const relative = path.relative(root, fs.realpathSync(file));
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Un fichier de base sort de son dossier déclaré.');
}

function siderRoots(bytes, base) {
  const lines = decoder.decode(bytes).replace(/^\uFEFF/, '').split(/\r?\n/);
  let section = '', sections = 0, enabled;
  const roots = [];
  for (const raw of lines) {
    // Semicolons inside quoted Windows paths are ordinary filename characters.
    let quoted = false, line = '';
    for (const char of raw) {
      if (char === '"') quoted = !quoted;
      if (!quoted && (char === ';' || char === '#')) break;
      line += char;
    }
    line = line.trim();
    if (!line) continue;
    const heading = /^\[([^\]]+)\]$/.exec(line);
    if (heading) { section = heading[1].toLowerCase(); if (section === 'sider') sections++; continue; }
    if (section !== 'sider') continue;
    const field = /^([^=]+)=(.*)$/.exec(line);
    if (!field) continue;
    const key = field[1].trim().toLowerCase(), value = field[2].trim();
    if (key === 'livecpk.enabled') {
      if (enabled !== undefined || !/^[01]$/.test(value)) throw new Error('Activation LiveCPK ambiguë dans sider.ini.');
      enabled = value === '1';
    }
    if (key === 'cpk.root') roots.push(value);
  }
  if (sections !== 1 || enabled === undefined) throw new Error('Configuration LiveCPK non reconnue : aucune priorité n’est supposée.');
  if (!enabled) return [];
  return roots.map(value => {
    const match = /^"([^"]+)"$/.exec(value);
    if (!match) throw new Error('Racine LiveCPK non reconnue.');
    const relative = localPath(match[1]);
    return path.resolve(base, relative);
  });
}

export function parseNativeFileList(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 64 || bytes.length > 65536 || bytes.readUInt32LE(0) !== 100) {
    throw new Error('Format spFileList.bin non pris en charge.');
  }
  const count = bytes.readUInt32LE(4);
  if (!count || count > 256 || 16 + count * 48 > bytes.length) throw new Error('Liste native CPK tronquée ou hors limites.');
  const names = [], seen = new Set();
  for (let index = 0; index < count; index++) {
    // FL26's linked count decreases on each 48-byte record, ending at zero.
    if (bytes.readUInt32LE(4 + index * 48) !== count - index) throw new Error('Chaînage de priorité CPK inconnu.');
    const raw = bytes.subarray(16 + index * 48, 48 + index * 48), end = raw.indexOf(0);
    if (end < 1 || raw.subarray(end).some(byte => byte !== 0)) throw new Error('Nom de CPK natif incompatible.');
    const name = decoder.decode(raw.subarray(0, end));
    if (!/^[A-Za-z0-9][A-Za-z0-9 _.()-]*\.cpk$/i.test(name) || seen.has(name.toLowerCase())) throw new Error('Nom de CPK absent, dupliqué ou non local.');
    names.push(name); seen.add(name.toLowerCase());
  }
  if (bytes.subarray(count * 48).some(byte => byte !== 0)) throw new Error('Fin de liste native CPK non reconnue.');
  return names;
}

/** Resolves configured disk priority only; runtime Lua rewrites are not executed. */
export function resolveCoachDatabase({ gamePath, siderPath } = {}, { readEntry = readCpkFile } = {}) {
  const game = directory(gamePath), guards = new Map();
  const remember = file => {
    const info = stat(file);
    if (info?.isSymbolicLink()) throw new Error('Les liens de fichiers de base ne sont pas pris en charge.');
    guards.set(file, info); return info;
  };
  const read = (file, maximum) => {
    const before = remember(file);
    if (!before?.isFile() || before.size < 1 || before.size > maximum) throw new Error('Fichier de base absent ou trop volumineux.');
    const fd = fs.openSync(file, 'r');
    try {
      if (!same(before, fs.fstatSync(fd))) throw new Error('La source de base a changé pendant sa lecture.');
      const bytes = Buffer.alloc(before.size);
      let offset = 0;
      while (offset < bytes.length) { const size = fs.readSync(fd, bytes, offset, bytes.length - offset, offset); if (!size) throw new Error('Source de base tronquée.'); offset += size; }
      if (!same(before, fs.fstatSync(fd))) throw new Error('La source de base a changé pendant sa lecture.');
      return bytes;
    } finally { fs.closeSync(fd); }
  };
  const finish = (packed, source) => {
    if (!Buffer.isBuffer(packed) || packed.length > MAX_DATABASE) throw new Error('Table locale des coachs incompatible.');
    const data = unpackDatabase(packed), catalog = readCoachTable(data);
    for (const [file, before] of guards) if (!same(before, stat(file))) throw new Error('Une source prioritaire a changé pendant l’analyse. Actualisez.');
    return { data, catalog, source, hash: sha256(data), nativeHeader: Buffer.from(packed.subarray(0, 8)) };
  };

  // An explicit siderPath is the app's sider.ini path, not its executable.
  const ini = siderPath ? absolute(siderPath) : path.join(game, 'SiderAddons', 'sider.ini');
  if (remember(ini)) {
    if (path.basename(ini).toLowerCase() !== 'sider.ini') throw new Error('Le chemin Sider doit désigner sider.ini.');
    for (const declaredRoot of siderRoots(read(ini, 1024 * 1024), path.dirname(ini))) {
      const rootStat = remember(declaredRoot);
      if (!rootStat) continue;
      const root = directory(declaredRoot), candidate = path.join(root, ...ENTRY.split('/'));
      if (!remember(candidate)) continue;
      contained(root, candidate);
      return finish(read(candidate, MAX_DATABASE), { kind: 'livecpk', path: candidate });
    }
  } else if (siderPath) throw new Error('Le fichier sider.ini configuré est absent.');

  const download = directory(path.join(game, 'download')), list = path.join(download, 'spFileList.bin');
  const archives = parseNativeFileList(read(list, 65536)).map(name => path.join(download, name));
  // Validate every listed archive first. A missing earlier entry can stop the
  // game's native DLC chain, so skipping it could select a table never loaded.
  for (const archive of archives) {
    const info = remember(archive);
    if (!info?.isFile() || info.size < 16 || !Number.isSafeInteger(info.size)) throw new Error('Une archive de la liste native CPK est absente ou invalide.');
    contained(download, archive);
  }
  for (const archive of archives.reverse()) {
    const packed = readEntry(archive, ENTRY);
    if (packed !== null) return finish(packed, { kind: 'cpk', path: archive, entry: ENTRY });
  }
  throw new Error('Coach.bin est absent des sources locales prises en charge.');
}
