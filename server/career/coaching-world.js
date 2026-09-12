// Build simulation data from the selected career, not from a contemporary roster.
// Contracts/expectations are authored gameplay rules, never claimed real contracts.
import { readCareer, sha256 } from './bal-adapter.js';
import { leagueProgress } from './schedule.js';
import { FORMATIONS, CLUB_PROFILES } from './tactical-data.js';
import { ENGINE, seedFictionalReserve, validateState, ageOn } from './coaching.js';

export const WORLD_POLICY = 'stryker-native-world-v1';
const BIOGRAPHIES = {
  102080: { name: 'Hansi Flick', birth_date: '1965-02-24', biography_source: 'https://www.fcbarcelona.com/en/football/first-team/staff/4030694/hansi-flick' },
  52: { name: 'Diego Simeone', birth_date: '1970-04-28', biography_source: 'https://www.atleticodemadrid.com/noticias/un-heroe-del-doblete-para-el-banquillo-rojiblanco' },
  18: { name: 'Laurent Blanc', birth_date: '1965-11-19', biography_source: 'https://www.fff.fr/equipe-nationale/selectionneur/114-laurent-blanc/fiche.html' },
};
// Balance targets, not claims about current standings or financial valuations.
const ELITE = new Set(['FC Barcelona', 'Real Madrid CF', 'Manchester City', 'Liverpool FC', 'Arsenal FC', 'Paris Saint-Germain', 'Bayern München', 'Inter Milan']);
const CONTENDERS = new Set(['Atlético Madrid', 'Chelsea FC', 'Manchester United', 'Tottenham Hotspur', 'Newcastle United', 'Juventus FC', 'AC Milan', 'SSC Napoli', 'AS Roma', 'Atalanta BC', 'Borussia Dortmund', 'Bayer 04 Leverkusen', 'RB Leipzig', 'AS Monaco', 'Olympique Marseille', 'Olympique Lyonnais', 'LOSC Lille', 'SL Benfica', 'FC Porto', 'Sporting CP', 'PSV Eindhoven', 'Ajax Amsterdam', 'Feyenoord Rotterdam', 'Galatasaray SK', 'Fenerbahçe SK']);
const SECOND_TIER = new Set([79, 80, 81, 82]);
const stableNumber = value => parseInt(sha256(value).slice(0, 8), 16);
function yearsAfter(date, years) {
  const [year, month, day] = date.split('-').map(Number), last = new Date(Date.UTC(year + years, month, 0)).getUTCDate();
  return `${year + years}-${String(month).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

export function styleFromNative(s) {
  return { short_build_up: s.build_up ? .85 : .25, tempo: .5, width: s.attacking_area ? .3 : .8,
    support: (10 - s.support_range) / 9, pressing: s.defensive_style ? (s.pressuring ? .25 : .45) : (s.pressuring ? .55 : .85),
    line_height: (s.defensive_line - 1) / 9, compactness: (s.compactness - 1) / 9, transition: s.attacking_style ? .25 : .8 };
}

export function preferredFormations(plan) {
  // Compare role counts; native player positions remain untouched at initialization.
  // A nearest supported formation is a simulation preference, not an exact decode.
  const count = roles => Array.from({ length: 13 }, (_, i) => roles.filter(r => r === i).length);
  const actual = count([...plan.subarray(1, 11)]);
  return Object.entries(FORMATIONS).map(([name, geometry]) => {
    const proposed = count(geometry.map(([role]) => role));
    const error = actual.reduce((sum, n, i) => sum + Math.abs(n - proposed[i]) * (i <= 3 ? 3 : 1), 0);
    return { name, error };
  }).sort((a, b) => a.error - b.error || a.name.localeCompare(b.name, 'en')).slice(0, 3).map(f => f.name);
}

export function careerFingerprint(blocks, career = readCareer(blocks)) {
  const player = blocks.description.subarray(128).toString('utf8').split('\0')[0].split(/\r?\n/)[0].trim();
  return sha256(JSON.stringify([player, career.layout, career.teams.map(t => [t.slot, t.name])]));
}

export function playerClub(blocks, career = readCareer(blocks)) {
  const line = blocks.description.subarray(128).toString('utf8').split('\0')[0].split(/\r?\n/)[1]?.trim();
  const matches = career.teams.filter(team => line?.startsWith(`${team.name} / `));
  if (matches.length !== 1) throw new Error('Le club du joueur n’est pas identifiable dans cette carrière.');
  return matches[0];
}

export function initializeWorld(blocks, { careerId, reserveCount = 24, catalog } = {}) {
  if (typeof careerId !== 'string' || !/^[a-f0-9]{64}$/.test(careerId)) throw new Error('Identité de carrière obligatoire.');
  const career = readCareer(blocks), userTeam = playerClub(blocks, career);
  const leagues = leagueProgress(blocks, career).filter(l => l.supported !== false);
  const state = { version: 1, engine: ENGINE, career_id: careerId, mode: 'BAL', date: career.date,
    seed: stableNumber(careerId), next_generated: 0, user_club: '', clubs: {}, coaches: {} };
  const bindings = {}, nativeIds = {}, used = new Set();
  for (const league of leagues) for (const member of league.teams) {
    const team = career.teams.find(t => t.slot === member.slot), id = `club:${member.databaseId}`, coachId = `native:${team.coachId}`;
    if (Object.hasOwn(bindings, id) || team.coachId === 0xffffffff || used.has(team.coachId)) throw new Error('Identités de clubs ou d’entraîneurs absentes ou partagées : suivi non initialisé.');
    if (catalog && catalog.get(team.coachId)?.name !== team.coachName) throw new Error('Le coach enregistré et la base locale ne concordent pas.');
    used.add(team.coachId);
    const authored = CLUB_PROFILES[team.name], coachProfile = authored?.expected_coach === team.coachId ? authored : null;
    const native = team.plans[1], corrected = { ...native };
    if (corrected.attacking_style && !corrected.build_up) { corrected.build_up = 1; corrected.support_range = Math.min(6, corrected.support_range); }
    const reputation = ELITE.has(team.name) ? .93 : CONTENDERS.has(team.name) ? .78 : SECOND_TIER.has(league.competitionId) ? .4 : .55;
    const expected = ELITE.has(team.name) ? 2.15 : CONTENDERS.has(team.name) ? 1.8 : 1.3;
    const biography = BIOGRAPHIES[team.coachId]?.name === team.coachName ? BIOGRAPHIES[team.coachId] : null;
    // Old careers can still contain a known coach past the retirement limit.
    // Preserve their native assignment for review rather than inventing a new age.
    if (biography && ageOn(biography.birth_date, career.date) >= 72) throw new Error(`La carrière contient ${team.coachName} au-delà de l’âge de retraite : une succession doit être préparée avant l’initialisation.`);
    state.coaches[coachId] = { name: team.coachName, kind: biography ? 'real' : 'native', retired: false,
      ...(biography ? { birth_date: biography.birth_date, biography_source: biography.biography_source } : {
        birth_date: null, retirement_date: yearsAfter(career.date, 8 + stableNumber(coachId) % 7),
        retirement_policy_source: `${WORLD_POLICY}: authored 8–14 career-year horizon for unknown native biographies; no inferred age.` }),
      reputation, adaptability: .5, style: styleFromNative(coachProfile?.settings || corrected),
      formations: coachProfile ? [...new Set(coachProfile.formations)] : preferredFormations(blocks.data.subarray(team.offsets[1], team.offsets[1] + 160)),
      profile_source: coachProfile ? 'Authored STRYKER profile' : 'Imported native tactics; tempo neutral; formations ranked by roles' };
    state.clubs[id] = { kind: 'club', coach: coachId, reputation, expected_ppg: expected,
      identity: styleFromNative(authored?.settings || corrected), appointed: career.date,
      contract_end: yearsAfter(career.date, 1 + stableNumber(`${careerId}:${id}:contract`) % 3),
      contract_source: `${WORLD_POLICY}: simulated contract starts when tracking is initialized`,
      expectations_source: `${WORLD_POLICY}: authored club balance target` };
    bindings[id] = { teamSlot: team.slot, team: team.name, competitionId: league.competitionId, expectedCoach: team.coachId };
    nativeIds[coachId] = team.coachId;
    if (team.slot === userTeam.slot) state.user_club = id;
  }
  if (!state.user_club) throw new Error('Le championnat du joueur ne possède pas encore de calendrier compatible avec le suivi des coachs.');
  validateState(state);
  return { version: 1, policy: WORLD_POLICY, state: seedFictionalReserve(state, reserveCount), bindings, nativeIds,
    source: { fingerprint: careerFingerprint(blocks, career), dataHash: sha256(blocks.data), date: career.date },
    coverage: { clubs: Object.keys(bindings).length, otherTeams: career.teams.length - Object.keys(bindings).length,
      leagues: leagues.map(l => ({ id: l.competitionId, name: l.name, teams: l.teams.length })) } };
}
