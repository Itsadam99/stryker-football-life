// Native completed fixtures + forward result reset identify a league cycle.
// observedSince is the first saved observation, never an invented season start.
import { readCareer, sha256 } from './bal-adapter.js';
import { leagueProgress } from './schedule.js';
import { careerFingerprint } from './coaching-world.js';

const COUNTERS = ['matches', 'points', 'wins', 'draws', 'losses'];
const hashPattern = /^[a-f0-9]{64}$/;
const daySpan = (from, to) => (Date.parse(to) - Date.parse(from)) / 86400000;

export function observeNativeSeasons(previous, blocks, { careerId } = {}) {
  if (!hashPattern.test(careerId || '')) throw new Error('Identité de carrière obligatoire pour le calendrier.');
  const career = readCareer(blocks), fingerprint = careerFingerprint(blocks, career), dataHash = sha256(blocks.data);
  if (previous && (previous.version !== 1 || previous.careerId !== careerId || previous.fingerprint !== fingerprint
    || career.date < previous.date)) throw new Error('Cette sauvegarde appartient à une autre carrière ou à une date antérieure. Le suivi existant est conservé.');
  if (previous?.dataHash === dataHash) return structuredClone(previous);
  const output = previous ? structuredClone(previous) : { version: 1, careerId, fingerprint, leagues: {}, completed: [] };
  const schedules = leagueProgress(blocks, career).filter(l => l.supported !== false);
  if (!schedules.length || Object.keys(output.leagues).some(id => !schedules.some(l => l.competitionId === +id))) throw new Error('Un championnat suivi ne peut plus être lu : aucun bilan n’est inventé.');
  for (const schedule of schedules) {
    const id = schedule.competitionId, prior = output.leagues[id];
    const members = schedule.teams.map(t => ({ club: `club:${t.databaseId}`, slot: t.slot, name: t.name }));
    const rows = Object.fromEntries(members.map(member => {
      const row = career.competitions[id].records.find(r => r.slot === member.slot);
      return [member.club, Object.fromEntries(COUNTERS.map(key => [key, row[key]]))];
    }));
    let cycle = prior?.cycle || 0, observedSince = prior?.observedSince || career.date;
    if (prior) {
      const sameProgram = prior.scheduleHash === schedule.scheduleHash && JSON.stringify(prior.members) === JSON.stringify(members);
      const decreases = Object.entries(rows).some(([club, row]) => !prior.rows[club] || COUNTERS.some(key => row[key] < prior.rows[club][key]));
      if (!sameProgram || decreases) {
        // Permit missed opening saves, but only when the previous full table was
        // actually observed complete and every new team is still early in play.
        const finished = output.completed.find(e => e.competitionId === id && e.cycle === prior.cycle);
        const reset = prior.complete && finished && career.date > previous.date && daySpan(finished.date, career.date) <= 550
          && Object.values(rows).every(row => row.matches <= Math.min(6, Math.floor(schedule.matchesPerTeam / 3)));
        if (!reset) throw new Error(`Le calendrier ou les résultats de ${schedule.name} ont reculé sans fin de championnat suivie. Le suivi reste intact.`);
        cycle++; observedSince = career.date;
      }
    }
    output.leagues[id] = { competitionId: id, name: schedule.name, cycle, observedSince,
      scheduleHash: schedule.scheduleHash, members, matchesPerTeam: schedule.matchesPerTeam, rows, complete: schedule.complete };
    if (schedule.complete && !output.completed.some(e => e.competitionId === id && e.cycle === cycle)) {
      const completion = { ...structuredClone(output.leagues[id]), date: career.date, dataHash };
      completion.id = sha256(JSON.stringify([careerId, id, cycle, completion.scheduleHash, completion.rows]));
      output.completed.push(completion);
    }
  }
  return { ...output, date: career.date, dataHash };
}
