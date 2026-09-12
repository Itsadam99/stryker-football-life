// Pure preparation of a multi-file installation. Publishing/rollback belongs to
// the game-closed transaction controller; this module never writes a file.
import { decodeSave, encodeSave } from './save-codec.js';
import { readCareer, applyOperations, sha256 } from './bal-adapter.js';
import { operationsFromCoaching } from './coaching-bridge.js';
import { registerCoachIdentities } from './coach-identities.js';
import { packDatabase } from './database-codec.js';
import { careerFingerprint } from './coaching-world.js';
import { validateState } from './coaching.js';

export function prepareCoachingInstallation({ input, expectedHash, record, database, registry = null, templateId = 18, useSeasonPlan = false }) {
  if (!Buffer.isBuffer(input) || sha256(input) !== expectedHash || record?.checkpoint?.saveHash !== expectedHash) throw new Error('La sauvegarde a changé depuis la préparation du suivi.');
  const blocks = decodeSave(input), career = readCareer(blocks), before = record.world;
  if (careerFingerprint(blocks, career) !== before.source.fingerprint || career.date !== record.observation.date) throw new Error('L’historique et la sauvegarde ne correspondent plus.');
  if (!Buffer.isBuffer(database?.data) || sha256(database.data) !== database.hash) throw new Error('La base locale des entraîneurs n’a pas pu être vérifiée.');
  if (useSeasonPlan && !record.proposal?.ready) throw new Error('L’intersaison n’a pas encore de bilan complet.');
  const state = useSeasonPlan ? record.proposal.state : before.state;
  validateState(state);
  if (state.date > career.date) throw new Error('Le bilan des entraîneurs provient d’une date future.');
  const bindings = structuredClone(useSeasonPlan ? record.proposal.bindings : before.bindings);
  const profiles = Object.entries(state.coaches).filter(([, c]) => c.kind === 'fictional').map(([identity, c]) => ({ identity, kind: 'fictional', name: c.name }));
  const native = registerCoachIdentities(database.data, registry, { careerId: state.career_id, profiles, templateId });
  const nativeIds = { ...before.nativeIds, ...native.mapping };
  for (const [clubId, binding] of Object.entries(bindings)) {
    const team = career.teams.find(t => t.slot === binding.teamSlot && t.name === binding.team);
    const previous = before.state.coaches[before.state.clubs[clubId].coach];
    if (!team || team.coachId !== binding.expectedCoach || team.coachName !== previous.name) throw new Error('Un entraîneur a changé depuis la préparation.');
  }
  const operations = operationsFromCoaching(state, blocks, bindings, nativeIds, native.catalog);
  const result = applyOperations(blocks, operations, native.catalog), save = encodeSave(result.blocks), roundtrip = decodeSave(save);
  for (const key of Object.keys(roundtrip)) if (!roundtrip[key].equals(result.blocks[key])) throw new Error('La reconstruction complète de la carrière a échoué.');
  const afterCareer = readCareer(roundtrip);
  for (const [clubId, binding] of Object.entries(bindings)) {
    const team = afterCareer.teams.find(t => t.slot === binding.teamSlot), coach = state.coaches[state.clubs[clubId].coach];
    if (team.coachId !== nativeIds[state.clubs[clubId].coach] || team.coachName !== coach.name) throw new Error('Une nomination n’a pas été reconstruite correctement.');
    binding.expectedCoach = team.coachId;
  }
  const nextWorld = { ...structuredClone(before), state: structuredClone(state), bindings, nativeIds,
    ...(useSeasonPlan ? { processedCycles: record.proposal.processedCycles } : {}) };
  return { save, coachDatabase: packDatabase(native.data, database.nativeHeader), registry: native.registry, world: nextWorld,
    undo: result.changes.map(([at, previous, next]) => [at, previous, next]),
    report: { appliedToGame: false, sourceSaveHash: expectedHash, outputSaveHash: sha256(save), sourceDatabaseHash: database.hash,
      outputDatabaseHash: native.hash, clubs: operations.length, changedBytes: result.changes.length,
      addedNativeCoaches: native.added, seasonTransition: useSeasonPlan } };
}
