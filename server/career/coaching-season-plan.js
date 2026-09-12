import { advanceSeason } from './coaching.js';
import { sha256 } from './bal-adapter.js';

// Wait for recorded complete tables in every managed league. A league finishing
// early keeps its snapshot while the other leagues play their last fixtures.
// This prepares one global interseason; it does not apply appointments to a save.
export function prepareObservedSeason(world, observation) {
  const state = world.state, anchor = world.bindings[state.user_club].competitionId;
  const completed = observation.completed.filter(e => e.date > state.date);
  const anchorEvent = completed.find(e => e.competitionId === anchor && e.cycle > (state.last_event?.cycle ?? -1));
  const leagueIds = world.coverage.leagues.map(l => l.id), chosen = [];
  for (const id of leagueIds) {
    const report = completed.find(e => e.competitionId === id && e.cycle > (world.processedCycles?.[id] ?? -1));
    if (report) chosen.push(report);
  }
  if (!anchorEvent || chosen.length !== leagueIds.length) return { ready: false, completedLeagues: chosen.length, totalLeagues: leagueIds.length };
  const completionDates = chosen.map(e => e.date).sort();
  if ((Date.parse(completionDates.at(-1)) - Date.parse(completionDates[0])) / 86400000 > 120) throw new Error('Les bilans conservés couvrent des périodes trop éloignées pour former une seule intersaison.');
  const bindings = structuredClone(world.bindings), results = {}, leagues = [];
  for (const report of chosen) {
    const clubs = report.members.map(m => m.club);
    for (const member of report.members) {
      if (!Object.hasOwn(state.clubs, member.club) || results[member.club]) throw new Error('Les promotions ont changé le périmètre des clubs : une réconciliation du suivi est nécessaire.');
      const previous = bindings[member.club];
      if (previous.teamSlot !== member.slot || previous.team !== member.name) throw new Error('L’identité d’un club a changé depuis le démarrage du suivi.');
      bindings[member.club].competitionId = report.competitionId;
      results[member.club] = { competition_id: report.competitionId, matches: report.rows[member.club].matches, points: report.rows[member.club].points };
    }
    leagues.push({ competition_id: report.competitionId, clubs, matches_per_club: report.matchesPerTeam });
  }
  if (Object.keys(results).length !== Object.keys(state.clubs).length) throw new Error('Des clubs suivis n’ont pas de bilan complet.');
  const date = completionDates.at(-1), ids = chosen.map(e => e.id).sort();
  const event = { type: 'native_season_completed', id: sha256(JSON.stringify([state.career_id, ids])), date,
    source: `FL26 native completed fixture observations ${ids.join(':')}`, cycle: anchorEvent.cycle,
    anchor_competition_id: anchor, observed_since: chosen.map(e => e.observedSince).sort()[0], leagues };
  return { ready: true, completedLeagues: chosen.length, totalLeagues: leagueIds.length,
    state: advanceSeason(state, date, results, { event }), bindings, event,
    processedCycles: Object.fromEntries(chosen.map(e => [e.competitionId, e.cycle])), appliedToGame: false };
}
