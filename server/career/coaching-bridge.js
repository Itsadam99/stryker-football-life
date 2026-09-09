// Connect observed native results/schedules to the pure policy and byte adapter.
// The caller still owns career lineage and the explicit annual event calendar.
import { advanceSeason, tacticalIntent, validateState } from './coaching.js';
import { readCareer, sha256, applyOperations } from './bal-adapter.js';
import { readLeagueSchedule } from './schedule.js';

export function advanceFromNativeSave(state, blocks, bindings, { seasonStart, eventId, leagueIds }) {
  validateState(state);
  if (state.mode !== 'BAL' || !bindings || Object.keys(bindings).length !== Object.keys(state.clubs).length
    || Object.keys(state.clubs).some(id => !Object.hasOwn(bindings, id))) throw new Error('Correspondance complète des clubs BAL obligatoire.');
  if (!Array.isArray(leagueIds) || !leagueIds.length || new Set(leagueIds).size !== leagueIds.length) throw new Error('Championnats annuels explicitement sélectionnés obligatoires.');
  const career = readCareer(blocks), schedules = leagueIds.map(id => readLeagueSchedule(blocks, id, career));
  if (schedules.some(s => !s.complete)) throw new Error('Le championnat n’est pas terminé : aucun changement annuel de coach.');
  const slots = new Set(), results = {}, leagues = [];
  for (const [id, binding] of Object.entries(bindings)) {
    const team = career.teams.find(t => t.slot === binding.teamSlot);
    if (!team || team.name !== binding.team || slots.has(team.slot)) throw new Error('Correspondance d’équipe absente ou ambiguë.');
    slots.add(team.slot);
    const row = team.results.find(r => r.competitionId === binding.competitionId);
    if (leagueIds.includes(binding.competitionId)) {
      if (!row) throw new Error('Résultats manquants dans le championnat sélectionné.');
      results[id] = { competition_id: row.competitionId, matches: row.matches, points: row.points };
    } else {
      results[id] = { status: 'unavailable', reason: row ? 'incomplete_league_schedule' : 'no_native_results' };
    }
  }
  for (const schedule of schedules) {
    const clubs = Object.keys(bindings).filter(id => bindings[id].competitionId === schedule.competitionId);
    const members = clubs.map(id => bindings[id].teamSlot).sort((a, b) => a - b);
    if (JSON.stringify(members) !== JSON.stringify(schedule.teamSlots)) throw new Error('Tous les membres du championnat doivent être liés au moteur.');
    leagues.push({ competition_id: schedule.competitionId, clubs, matches_per_club: schedule.matchesPerTeam });
  }
  const source = schedules.map(s => `${s.competitionId}:${s.scheduleHash}`).sort().join(';');
  const event = { type: 'season_completed', id: eventId, date: career.date, season_start: seasonStart,
    source: `FL26 native fixture schedules ${source}`, leagues };
  const next = advanceSeason(state, career.date, results, { event });
  return { state: next, event, audit: { dataHash: sha256(blocks.data), date: career.date,
    schedules: schedules.map(({ competitionId, scheduleHash, matchesPerTeam }) => ({ competitionId, scheduleHash, matchesPerTeam })),
    appliedToGame: false } };
}

export function operationsFromCoaching(state, blocks, bindings, nativeIds, nativeCatalog) {
  validateState(state);
  if (state.mode !== 'BAL') throw new Error('Seul le format Vers une légende est pris en charge.');
  const career = readCareer(blocks), operations = [];
  for (const id of Object.keys(state.clubs)) {
    const intent = tacticalIntent(state, id), binding = bindings[id];
    if (!binding) throw new Error('Équipe sans correspondance native.');
    const team = career.teams.find(t => t.slot === binding.teamSlot && t.name === binding.team);
    if (!team || team.coachId !== binding.expectedCoach) throw new Error('L’entraîneur natif a changé depuis la préparation.');
    const nativeId = nativeIds[intent.coach], coach = state.coaches[intent.coach];
    if (!Number.isInteger(nativeId) || !Object.hasOwn(nativeCatalog, nativeId) || nativeCatalog[nativeId] !== coach.name) throw new Error('Le coach n’a pas encore d’identité native correspondante.');
    const s = intent.style, slider = n => Math.max(1, Math.min(10, Math.round(1 + n * 9)));
    const settings = { attacking_style: Number(s.transition < .5), build_up: Number(s.short_build_up >= .5),
      attacking_area: Number(s.width < .5), defensive_style: Number(s.pressing < .6), pressuring: Number(s.pressing < .5),
      support_range: slider(1 - s.support), defensive_line: slider(s.line_height), compactness: slider(s.compactness) };
    const alternate = intent.formations[1] || intent.formations[0], third = intent.formations[2] || alternate;
    operations.push({ slot: team.slot, name: team.name, expectedCoach: team.coachId,
      ...(nativeId !== team.coachId ? { newCoach: nativeId } : {}), plans: [
        { settings, formation: intent.formations[0] }, { settings, formation: intent.formations[0] },
        { settings: { ...settings, defensive_line: Math.max(2, settings.defensive_line - 2), compactness: Math.min(10, settings.compactness + 1) }, formation: alternate },
        { settings: { ...settings, defensive_style: 0, pressuring: 0, defensive_line: Math.min(9, settings.defensive_line + 1) }, formation: third },
      ] });
  }
  // Validate all native identities and simultaneous coach departures together.
  applyOperations(blocks, operations, nativeCatalog);
  return operations;
}
