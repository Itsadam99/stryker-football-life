import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { decodeSave, encodeSave } from './save-codec.js';
import { readCareer, identityOperations, applyOperations, family, sha256, FIELDS } from './bal-adapter.js';
import { leagueProgress } from './schedule.js';
import { CoachingStore } from './coaching-store.js';

const exec = promisify(execFile);
const SAVE_NAME = /^BL000000(?:0[0-9]|1[0-9])$/;
const HASH = /^[a-f0-9]{64}$/;
const MAX_SAVE = 64 * 1024 * 1024;

export function assertNoGameProcesses(stdout) {
  if (!stdout.trim()) throw new Error('Impossible de vérifier si Football Life est fermé.');
  const names = stdout.trim().split(/\r?\n/).map(line => /^"([^"]+)"\s*,/.exec(line)?.[1]);
  if (names.some(name => !name)) throw new Error('La liste des processus Windows est illisible.');
  if (names.some(name => /^(?:FL[ _-]?20\d\d.*|PES[ _-]?2021.*|sider(?:[ _-].*)?)\.exe$/i.test(name))) throw new Error('Fermez Football Life et Sider avant de modifier une carrière, puis rechargez-la après application.');
}

export async function assertGameClosed() {
  if (process.platform !== 'win32') throw new Error('La modification des carrières est disponible sous Windows.');
  const tasklist = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tasklist.exe');
  const { stdout } = await exec(tasklist, ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
  assertNoGameProcesses(stdout);
}

export function defaultSaveDirectories() {
  const roots = [path.join(os.homedir(), 'Documents'), ...[process.env.OneDrive, process.env.OneDriveConsumer, process.env.OneDriveCommercial].filter(Boolean).map(p => path.join(p, 'Documents'))];
  return [...new Set(roots.map(root => path.join(root, 'KONAMI', 'eFootball PES 2021 SEASON UPDATE', '2026', 'save')))];
}

function stageAtomic(file, bytes) {
  const temp = `${file}.${randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temp, 'wx');
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    return { commit: () => fs.renameSync(temp, file), publish: () => fs.linkSync(temp, file), discard: () => { if (fs.existsSync(temp)) fs.unlinkSync(temp); } };
  } catch (error) {
    if (fd !== undefined) { fs.closeSync(fd); fd = undefined; }
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
    throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function writeAtomic(file, bytes) {
  const staged = stageAtomic(file, bytes);
  try { staged.commit(); } finally { staged.discard(); }
}

function writeBackup(file, bytes) {
  const staged = stageAtomic(file, bytes);
  try {
    // Publish only a completely flushed backup and never replace an existing
    // content-addressed copy. A crash cannot leave a partial .save behind.
    staged.publish();
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  } finally { staged.discard(); }
}

function readBounded(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 528 || stat.size > MAX_SAVE) throw new Error('Fichier de carrière invalide.');
  const fd = fs.openSync(file, 'r');
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino || opened.size !== stat.size) throw new Error('La sauvegarde a changé pendant sa lecture.');
    const bytes = fs.readFileSync(fd), after = fs.fstatSync(fd);
    if (bytes.length !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw new Error('La sauvegarde a changé pendant sa lecture.');
    return bytes;
  } finally { fs.closeSync(fd); }
}

function identity(career, blocks) {
  const player = blocks.description.subarray(128).toString('utf8').split('\0')[0].split(/\r?\n/)[0].trim();
  return sha256(JSON.stringify([player, career.teams.map(t => [t.slot, t.name])]));
}

function pendingState(journal, inputHash) {
  if (!journal?.pending) return journal;
  const pending = journal.pending;
  if (!HASH.test(pending.beforeHash || '') || !HASH.test(pending.afterHash || '') || pending.next?.id !== journal.id || (pending.previous && pending.previous.id !== journal.id)) throw new Error('Le journal de carrière est endommagé. La sauvegarde reste intacte.');
  if (pending.afterHash === inputHash) return pending.next;
  if (pending.beforeHash === inputHash) return pending.previous;
  throw new Error('Une opération interrompue demande une vérification. Les copies de sécurité sont conservées.');
}

function tacticalOffsets(career) {
  const allowed = new Set(), formations = new Map();
  for (const team of career.teams) for (const at of team.offsets) {
    for (const relative of Object.values(FIELDS)) allowed.add(at + relative);
    for (let relative = 0; relative < 99; relative++) if (![0, 11, 12].includes(relative % 33)) {
      allowed.add(at + relative); formations.set(at + relative, at);
    }
  }
  return { allowed, formations };
}

function validateState(state, career, blocks) {
  if (state && typeof state.installed !== 'boolean') throw new Error('Le journal de carrière est endommagé. La sauvegarde reste intacte.');
  if (!state?.installed) return;
  if (state.version !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(state.date || '') || !HASH.test(state.identity || '') || !HASH.test(state.lastHash || '')) throw new Error('Le journal de carrière est endommagé. La sauvegarde reste intacte.');
  if (state.identity !== identity(career, blocks) || career.date < state.date) throw new Error('Cette carrière a été remplacée ou rembobinée. Le journal existant est conservé pour éviter de mélanger les parties.');
  const { allowed } = tacticalOffsets(career), seen = new Set();
  if (!Array.isArray(state.originals) || state.originals.some(entry => {
    if (!Array.isArray(entry) || entry.length !== 2) return true;
    const [at, values] = entry;
    if (!allowed.has(at) || seen.has(at) || !Array.isArray(values) || values.length !== 2 || values.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    seen.add(at); return false;
  })) throw new Error('Le journal contient des champs étrangers aux consignes tactiques. La sauvegarde reste intacte.');
  const planOffsets = new Set(career.teams.flatMap(t => t.offsets)), seenPlans = new Set();
  if (state.formations !== undefined && (!Array.isArray(state.formations) || state.formations.some(entry => {
    if (!Array.isArray(entry) || entry.length !== 3) return true;
    const [at, before, after] = entry;
    if (!planOffsets.has(at) || seenPlans.has(at) || typeof before !== 'string' || typeof after !== 'string') return true;
    const a = Buffer.from(before, 'base64'), b = Buffer.from(after, 'base64');
    if (a.length !== 99 || b.length !== 99 || a.toString('base64') !== before || b.toString('base64') !== after) return true;
    for (let phase = 0; phase < 3; phase++) for (const relative of [0, 11, 12]) if (a[phase * 33 + relative] !== b[phase * 33 + relative]) return true;
    seenPlans.add(at); return false;
  }))) throw new Error('Le journal des formations est endommagé. La sauvegarde reste intacte.');
  // A reset can be a genuine new season. Without any native date advance to
  // explain it, conservatively require review rather than assume continuity.
  if (state.date === career.date && Array.isArray(state.results)) {
    const current = new Map(career.teams.flatMap(t => t.results.map(r => [`${t.slot}:${r.competitionId}`, r])));
    for (const [slot, competitionId, matches, wins, draws, losses] of state.results) {
      const now = current.get(`${slot}:${competitionId}`);
      if ((!now && matches > 0) || (now && [matches, wins, draws, losses].some((n, i) => now[['matches', 'wins', 'draws', 'losses'][i]] < n))) throw new Error('Les résultats de cette carrière ont reculé. Le journal existant est conservé pour éviter de mélanger les parties.');
    }
  }
}

export class CareerManager {
  constructor({ dataRoot, directories = defaultSaveDirectories(), gameClosed = assertGameClosed }) {
    this.root = path.join(dataRoot, 'careers');
    this.directories = directories;
    this.gameClosed = gameClosed;
    this.busy = false;
    fs.mkdirSync(this.root, { recursive: true });
    this.coaching = new CoachingStore(path.join(this.root, 'coaching'));
    this.coachingErrors = new Map();
  }

  files() {
    const files = [];
    for (const directory of this.directories) {
      if (!fs.existsSync(directory)) continue;
      const real = fs.realpathSync(directory);
      for (const name of fs.readdirSync(real).filter(n => SAVE_NAME.test(n))) {
        const file = path.join(real, name), stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_SAVE) continue;
        const id = sha256(file.toLowerCase());
        if (!files.some(f => f.id === id)) files.push({ id, file, slot: Number(name.slice(-2)) + 1, modifiedAt: stat.mtime.toISOString() });
      }
    }
    return files;
  }

  resolve(id) {
    if (typeof id !== 'string' || !HASH.test(id)) throw new Error('Identifiant de sauvegarde invalide.');
    const item = this.files().find(f => f.id === id);
    if (!item) throw new Error('Sauvegarde introuvable dans les dossiers Football Life 2026.');
    return item;
  }

  journal(id) {
    const file = path.join(this.root, `${id}.json`);
    if (!fs.existsSync(file)) return null;
    const envelope = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (sha256(JSON.stringify(envelope.value)) !== envelope.hash || envelope.value.id !== id || envelope.value.version !== 1) throw new Error('Le journal de carrière est endommagé. La sauvegarde reste intacte.');
    return envelope.value;
  }

  saveJournal(value) {
    writeAtomic(path.join(this.root, `${value.id}.json`), JSON.stringify({ value, hash: sha256(JSON.stringify(value)) }));
  }

  list() {
    return { version: '0.2.0', stage: 'preview', automaticCoaches: false, saves: this.files().map(({ file, ...item }) => {
      try {
        const journal = this.journal(item.id), state = journal?.pending ? pendingState(journal, sha256(readBounded(file))) : journal;
        return { ...item, installed: Boolean(state?.installed), recoveryPending: Boolean(journal?.pending) };
      }
      catch (error) { return { ...item, installed: false, error: error.message }; }
    }) };
  }

  inspect(id) {
    const item = this.resolve(id), input = readBounded(item.file), blocks = decodeSave(input), career = readCareer(blocks);
    const state = pendingState(this.journal(id), sha256(input));
    validateState(state, career, blocks);
    const operations = identityOperations(career);
    const preview = applyOperations(blocks, operations);
    let coaching;
    try { coaching = this.coaching.inspect(id, blocks); }
    catch (error) { coaching = { tracked: true, error: error.message }; }
    if (this.coachingErrors.has(id)) coaching.error = this.coachingErrors.get(id);
    return { id, hash: sha256(input), date: career.date, title: career.title, slot: item.slot, installed: Boolean(state?.installed),
      teamCount: career.teams.length, changedBytes: preview.changes.length, automaticCoaches: false,
      coaching,
      leagues: leagueProgress(blocks, career),
      teams: career.teams.map((t, i) => ({ name: t.name, coach: t.coachName || 'Non renseigné', style: family(operations[i].plans[0].settings),
        results: t.results.map(({ competitionId, matches, points, wins, draws, losses }) => ({ competitionId, matches, points, wins, draws, losses })) })) };
  }

  trackCoaches(id, expectedHash) {
    if (this.busy) throw new Error('Une modification de carrière est déjà en cours.');
    if (!HASH.test(expectedHash || '')) throw new Error('Analyse récente de la sauvegarde obligatoire.');
    this.busy = true;
    try {
      const item = this.resolve(id), input = readBounded(item.file);
      if (sha256(input) !== expectedHash) throw new Error('La sauvegarde a changé depuis l’analyse. Actualisez.');
      const result = this.coaching.track(id, decodeSave(input), expectedHash, () => {
        if (this.resolve(id).file !== item.file || sha256(readBounded(item.file)) !== expectedHash) throw new Error('La sauvegarde a changé pendant la préparation du suivi.');
      });
      this.coachingErrors.delete(id);
      return { success: true, coaching: result, message: 'Suivi des coachs enregistré. Il s’actualise tant que Striker reste ouvert. La sauvegarde du jeu reste intacte.' };
    } finally { this.busy = false; }
  }

  refreshTracked(onError = () => {}) {
    if (this.busy) return;
    const ids = new Set(this.coaching.ids());
    for (const item of this.files().filter(f => ids.has(f.id))) {
      try {
        const current = this.coaching.read(item.id), input = readBounded(item.file), hash = sha256(input);
        if (current.checkpoint.saveHash !== hash) this.trackCoaches(item.id, hash);
        else this.coachingErrors.delete(item.id);
      } catch (error) {
        if (this.coachingErrors.get(item.id) !== error.message) onError(item.id, error.message);
        this.coachingErrors.set(item.id, error.message);
      }
    }
  }

  async mutate(id, expectedHash, action) {
    if (this.busy) throw new Error('Une modification de carrière est déjà en cours.');
    if (typeof expectedHash !== 'string' || !HASH.test(expectedHash) || !['apply', 'remove'].includes(action)) throw new Error('Analyse récente de la sauvegarde obligatoire.');
    this.busy = true;
    try {
      await this.gameClosed();
      const item = this.resolve(id), input = readBounded(item.file), inputHash = sha256(input);
      if (inputHash !== expectedHash) throw new Error('La sauvegarde a changé depuis l’analyse. Actualisez avant de continuer.');
      const blocks = decodeSave(input), career = readCareer(blocks), binding = identity(career, blocks);
      const journal = this.journal(id), previous = pendingState(journal, inputHash);
      if (journal?.pending && sha256(readBounded(path.join(this.root, `${journal.pending.beforeHash}.save`))) !== journal.pending.beforeHash) throw new Error('La copie de sécurité de l’opération interrompue est endommagée.');
      validateState(previous, career, blocks);
      let modified, changes, installed, preserved = 0;
      const originals = new Map(previous?.installed ? previous.originals : []);
      const { formations: geometry } = tacticalOffsets(career);
      let formations = previous?.installed ? previous.formations || [] : [];
      if (action === 'apply') {
        const result = applyOperations(blocks, identityOperations(career));
        modified = result.blocks;
        changes = result.changes;
        installed = true;
        for (const [at, before, after] of changes) {
          const old = originals.get(at);
          // A later game's tactical edit becomes the new value to restore.
          originals.set(at, [old && old[1] === before ? old[0] : before, after]);
        }
        const priorFormations = new Map(formations.map(([at, before, after]) => [at, [Buffer.from(before, 'base64'), Buffer.from(after, 'base64')]]));
        const changedFormations = new Set([...originals.keys()].filter(at => geometry.has(at)).map(at => geometry.get(at)));
        formations = [];
        for (const at of changedFormations) {
          const current = blocks.data.subarray(at, at + 99), after = modified.data.subarray(at, at + 99), old = priorFormations.get(at);
          const before = old && current.equals(old[1]) ? old[0] : current;
          // Treat a formation as one unit: restoring selected coordinates can
          // silently combine two independently valid but different systems.
          for (let relative = 0; relative < 99; relative++) if (geometry.has(at + relative)) {
            originals.delete(at + relative);
            if (before[relative] !== after[relative]) originals.set(at + relative, [before[relative], after[relative]]);
          }
          if (!before.equals(after)) formations.push([at, before.toString('base64'), after.toString('base64')]);
        }
      } else {
        if (!previous?.installed) throw new Error('Ce mod n’est pas appliqué à cette carrière.');
        const data = Buffer.from(blocks.data);
        changes = [];
        const formationGuards = new Map(formations.map(([at, , after]) => [at, Buffer.from(after, 'base64')]));
        const unchangedFormations = new Set([...formationGuards].filter(([at, after]) => data.subarray(at, at + 99).equals(after)).map(([at]) => at));
        for (const [at, [before, after]] of originals) {
          // A legacy journal with no full formation snapshot cannot prove
          // that later, previously untouched coordinates were left intact.
          if (geometry.has(at) && !unchangedFormations.has(geometry.get(at))) { preserved++; continue; }
          if (data[at] === after) { data[at] = before; if (before !== after) changes.push([at, after, before]); }
          else preserved++;
        }
        modified = { ...blocks, data };
        readCareer(modified);
        installed = false;
      }
      const output = changes.length ? encodeSave(modified) : input;
      const roundtrip = decodeSave(output);
      for (const key of Object.keys(modified)) if (!roundtrip[key].equals(modified[key])) throw new Error('Échec de vérification de la sauvegarde reconstruite.');
      const outputHash = sha256(output), backup = path.join(this.root, `${inputHash}.save`);
      writeBackup(backup, input);
      if (sha256(readBounded(backup)) !== inputHash) throw new Error('La copie de sécurité n’a pas pu être vérifiée.');
      const next = { version: 1, id, identity: binding, date: career.date, installed,
        originals: installed ? [...originals] : [], formations: installed ? formations : [],
        results: career.teams.flatMap(t => t.results.filter(r => r.standard).map(r => [t.slot, r.competitionId, r.matches, r.wins, r.draws, r.losses])),
        lastHash: outputHash, backupHash: inputHash };
      const transaction = { ...(previous || next), pending: { beforeHash: inputHash, afterHash: outputHash, previous, next } };
      this.saveJournal(transaction);
      const staged = changes.length ? stageAtomic(item.file, output) : null;
      try {
        // Flush the complete replacement before the final process and source
        // checks. After these checks, rename is the only live-file operation.
        await this.gameClosed();
        if (this.resolve(id).file !== item.file || sha256(readBounded(item.file)) !== inputHash) throw new Error('La sauvegarde a changé pendant la préparation. Aucune écriture effectuée.');
        staged?.commit();
      } finally { staged?.discard(); }
      if (sha256(readBounded(item.file)) !== outputHash) throw new Error('La sauvegarde a changé pendant la vérification finale. Copie de sécurité conservée.');
      this.saveJournal(next);
      return { success: true, installed, changedBytes: changes.length, preservedFields: preserved, backupPath: backup,
        message: installed ? 'Styles appliqués. Rechargez cette carrière dans Football Life.' : 'Consignes du mod retirées. Votre progression est conservée.' };
    } finally { this.busy = false; }
  }
}
