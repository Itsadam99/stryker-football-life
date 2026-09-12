// Only STRYKER's own local tracking files are written here. Game saves stay read-only.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readCareer, sha256 } from './bal-adapter.js';
import { initializeWorld, careerFingerprint } from './coaching-world.js';
import { observeNativeSeasons } from './season-observer.js';
import { validateState, ageOn, tacticalIntent } from './coaching.js';
import { prepareObservedSeason } from './coaching-season-plan.js';

const HASH = /^[a-f0-9]{64}$/;
function validHash(hash) { if (!HASH.test(hash || '')) throw new Error('Identité de suivi invalide.'); return hash; }
function readJson(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) throw new Error('Fichier de suivi incompatible.');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function atomic(file, value, { exclusive = false, beforeCommit = () => {} } = {}) {
  const temp = `${file}.${randomUUID()}.tmp`, bytes = Buffer.from(JSON.stringify(value));
  let fd;
  try {
    fd = fs.openSync(temp, 'wx'); fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    beforeCommit();
    if (exclusive) {
      try { fs.linkSync(temp, file); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    } else fs.renameSync(temp, file);
  } finally { if (fd !== undefined) fs.closeSync(fd); if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}

export class CoachingStore {
  constructor(root) {
    this.root = root; this.objects = path.join(root, 'objects');
  }
  ids() { return fs.existsSync(this.root) ? fs.readdirSync(this.root).filter(n => /^[a-f0-9]{64}\.json$/.test(n)).map(n => n.slice(0, -5)) : []; }
  object(hash) {
    const value = readJson(path.join(this.objects, `${validHash(hash)}.json`));
    if (sha256(JSON.stringify(value)) !== hash) throw new Error('Un historique de coachs est endommagé. Les autres copies sont conservées.');
    return value;
  }
  put(value) {
    fs.mkdirSync(this.objects, { recursive: true });
    const hash = sha256(JSON.stringify(value)), file = path.join(this.objects, `${hash}.json`);
    atomic(file, value, { exclusive: true }); this.object(hash);
    return hash;
  }
  read(id) {
    const file = path.join(this.root, `${validHash(id)}.json`);
    if (!fs.existsSync(file)) return null;
    const pointer = readJson(file), checkpoint = this.object(pointer.checkpoint);
    if (checkpoint.version !== 1 || checkpoint.id !== id) throw new Error('Ce suivi ne correspond pas à la carrière sélectionnée.');
    const world = this.object(checkpoint.world), observation = this.object(checkpoint.observation);
    validateState(world.state);
    if (world.state.career_id !== id || observation.careerId !== id || world.source.fingerprint !== observation.fingerprint
      || checkpoint.date !== observation.date || !HASH.test(checkpoint.saveHash)) throw new Error('Les historiques de cette carrière ne concordent pas.');
    const proposal = checkpoint.proposal ? this.object(checkpoint.proposal) : null;
    if (proposal?.ready) validateState(proposal.state);
    return { checkpointHash: pointer.checkpoint, checkpoint, world, observation, proposal };
  }
  track(id, blocks, saveHash, verifySource = () => {}) {
    validHash(id); validHash(saveHash);
    const previous = this.read(id), world = previous?.world || initializeWorld(blocks, { careerId: id });
    const observation = observeNativeSeasons(previous?.observation, blocks, { careerId: id });
    const career = readCareer(blocks);
    // External appointments need reconciliation rather than silently assigning the
    // old coach's contract/style to a different person.
    for (const [clubId, binding] of Object.entries(world.bindings)) {
      const team = career.teams.find(t => t.slot === binding.teamSlot && t.name === binding.team);
      const coach = world.state.coaches[world.state.clubs[clubId].coach];
      if (!team || team.coachId !== binding.expectedCoach || team.coachName !== coach.name) throw new Error('Un entraîneur a changé hors du suivi. L’historique est conservé pour réconciliation.');
    }
    if (previous?.checkpoint.saveHash === saveHash) { verifySource(); return this.summary(previous, blocks); }
    let proposal;
    try { proposal = prepareObservedSeason(world, observation); }
    catch (error) {
      // Verified native evidence remains useful even when the next appointments
      // need reconciliation. Never discard a final table because planning fails.
      proposal = { ready: false, error: error.message, completedLeagues: Object.values(observation.leagues).filter(l => l.complete).length,
        totalLeagues: world.coverage.leagues.length };
    }
    const checkpoint = { version: 1, id, date: observation.date, saveHash,
      world: previous?.checkpoint.world || this.put(world), observation: this.put(observation),
      proposal: this.put(proposal),
      previous: previous?.checkpointHash || null };
    const checkpointHash = this.put(checkpoint);
    atomic(path.join(this.root, `${id}.json`), { checkpoint: checkpointHash }, { beforeCommit: () => {
      verifySource();
      const current = this.read(id);
      if ((current?.checkpointHash || null) !== (previous?.checkpointHash || null)) throw new Error('Le suivi a changé pendant sa préparation. Actualisez.');
    } });
    return this.summary({ checkpointHash, checkpoint, world, observation, proposal }, blocks);
  }
  inspect(id, blocks) {
    const record = this.read(id);
    if (!record) return { tracked: false };
    return this.summary(record, blocks);
  }
  summary(record, blocks) {
    const { world, observation, checkpointHash, proposal } = record, career = readCareer(blocks);
    if (careerFingerprint(blocks, career) !== world.source.fingerprint || career.date < observation.date) throw new Error('Une sauvegarde antérieure ou une autre carrière a été chargée. Le suivi actuel est conservé.');
    const coaches = Object.values(world.state.coaches), assigned = new Set(Object.values(world.state.clubs).map(c => c.coach));
    return { tracked: true, checkpoint: checkpointHash, initializedAt: world.source.date, observedAt: observation.date,
      needsRefresh: sha256(blocks.data) !== observation.dataHash, automaticCoaches: false,
      clubs: world.coverage.clubs, leagues: world.coverage.leagues.length,
      fictionalCoaches: coaches.filter(c => c.kind === 'fictional').length,
      seasonPlan: { ready: Boolean(proposal?.ready), completedLeagues: proposal?.completedLeagues || 0,
        totalLeagues: world.coverage.leagues.length, date: proposal?.event?.date, error: proposal?.error,
        changes: proposal?.ready ? proposal.state.last_event.events.filter(e => e.type === 'appointed').map(e => ({
          team: proposal.bindings[e.club].team, coach: proposal.state.coaches[e.coach].name,
          formations: proposal.state.coaches[e.coach].formations })) : [] },
      reserve: Object.entries(world.state.coaches).filter(([id, c]) => !assigned.has(id) && !c.retired).map(([id, c]) => ({
        id, name: c.name, kind: c.kind, age: c.birth_date ? ageOn(c.birth_date, observation.date) : null, formations: c.formations })),
      completed: observation.completed.map(e => ({ id: e.id, name: e.name, date: e.date, cycle: e.cycle + 1 })),
      teams: Object.entries(world.state.clubs).map(([id, club]) => {
        const coach = world.state.coaches[club.coach], intent = tacticalIntent(world.state, id);
        return { id, name: world.bindings[id].team, coach: coach.name, kind: coach.kind,
          contractEnd: club.contract_end, age: coach.birth_date ? ageOn(coach.birth_date, observation.date) : null,
          formations: intent.formations, expectedPointsPerGame: club.expected_ppg };
      }) };
  }
}
