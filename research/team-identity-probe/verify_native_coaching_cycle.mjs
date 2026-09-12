// Offline integration proof. Final league results below are SYNTHETIC, not played.
// Never installs a save or changes a live game. Only writes a compact JSON report.
import fs from 'node:fs';
import path from 'node:path';
import { decodeSave, encodeSave } from '../../server/career/save-codec.js';
import { readCareer, sha256, applyOperations } from '../../server/career/bal-adapter.js';
import { initializeWorld } from '../../server/career/coaching-world.js';
import { observeNativeSeasons } from '../../server/career/season-observer.js';
import { prepareObservedSeason } from '../../server/career/coaching-season-plan.js';
import { operationsFromCoaching } from '../../server/career/coaching-bridge.js';
import { readCoachTable, addFictionalCoaches } from '../../server/career/coach-table.js';

const [saveFile, rawCoachFile, outputFile] = process.argv.slice(2);
if (!saveFile || !rawCoachFile || !outputFile) throw new Error('Usage: node verify_native_coaching_cycle.mjs SAVE RAW_COACH_TABLE REPORT_JSON');
const encrypted = fs.readFileSync(saveFile), table = fs.readFileSync(rawCoachFile), original = decodeSave(encrypted);
const originalCareer = readCareer(original), careerId = sha256('STRYKER offline synthetic-season proof'), world = initializeWorld(original, { careerId });
let ledger = observeNativeSeasons(null, original, { careerId });
const blocks = Object.fromEntries(Object.entries(original).map(([key, value]) => [key, Buffer.from(value)]));
const [year, month] = originalCareer.date.split('-').map(Number), targetYear = month >= 6 ? year + 1 : year;
const target = `${targetYear}-05-25`;
for (const at of [11322908, 11516880]) { blocks.data.writeUInt16LE(targetYear, at); blocks.data[at + 2] = 5; blocks.data[at + 3] = 25; }
const description = blocks.description.subarray(128).toString('utf8').split('\0')[0].split(/\r?\n/);
description[description.length - 1] = `25/5/${targetYear}`;
blocks.description.fill(0, 128); blocks.description.write(description.join('\n'), 128);
for (const league of Object.values(ledger.leagues)) for (const member of league.members) {
  const team = originalCareer.teams.find(t => t.slot === member.slot);
  for (let i = 0; i < 15; i++) {
    const at = team.at + 744 + i * 20;
    if (blocks.data.readUInt16LE(at) !== league.competitionId) continue;
    // Retain already-recorded wins/losses and fill every remaining game as a draw.
    const wins = blocks.data[at + 4], losses = blocks.data[at + 6], draws = league.matchesPerTeam - wins - losses;
    blocks.data[at + 2] = 3 * wins + draws; blocks.data[at + 3] = league.matchesPerTeam; blocks.data[at + 5] = draws;
  }
}
ledger = observeNativeSeasons(ledger, blocks, { careerId });
const proposal = prepareObservedSeason(world, ledger);
if (!proposal.ready) throw new Error('Synthetic complete league evidence did not prepare an interseason.');
const catalog = readCoachTable(table), profiles = [], nativeIds = { ...world.nativeIds };
let candidate = 2_000_000;
for (const [identity, coach] of Object.entries(proposal.state.coaches)) if (coach.kind === 'fictional') {
  while (catalog.has(candidate)) candidate++;
  nativeIds[identity] = candidate;
  profiles.push({ identity, kind: 'fictional', id: candidate++, name: coach.name });
}
const expanded = addFictionalCoaches(table, profiles, { templateId: 18, expectedHash: sha256(table) });
const operations = operationsFromCoaching(proposal.state, blocks, proposal.bindings, nativeIds, expanded.catalog);
const applied = applyOperations(blocks, operations, expanded.catalog), rebuilt = encodeSave(applied.blocks), decoded = decodeSave(rebuilt);
for (const key of Object.keys(decoded)) if (!decoded[key].equals(applied.blocks[key])) throw new Error('Rebuilt save did not preserve all six sections.');
const reread = readCareer(decoded);
for (const [clubId, binding] of Object.entries(proposal.bindings)) {
  const team = reread.teams.find(t => t.slot === binding.teamSlot), coach = proposal.state.coaches[proposal.state.clubs[clubId].coach];
  if (team.coachName !== coach.name || team.coachId !== nativeIds[proposal.state.clubs[clubId].coach]) throw new Error('Native appointment mismatch.');
}
if (sha256(fs.readFileSync(saveFile)) !== sha256(encrypted) || sha256(fs.readFileSync(rawCoachFile)) !== sha256(table)) throw new Error('An input file changed during verification.');
const report = { type: 'OFFLINE SYNTHETIC RESULTS — NOT A PLAYED SEASON', appliedToGame: false,
  from: originalCareer.date, to: target, clubs: operations.length, leagues: ledger.completed.length,
  appointments: proposal.state.last_event.events.filter(e => e.type === 'appointed').length,
  fictionalIdentities: profiles.length, nativeOriginalRowsPreserved: expanded.data.subarray(0, table.length).equals(table),
  changedBytes: applied.changes.length, codecAllSixBlocksVerified: true,
  inputSaveSha256: sha256(encrypted), inputTableSha256: sha256(table), outputSaveSha256: sha256(rebuilt) };
fs.mkdirSync(path.dirname(path.resolve(outputFile)), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
