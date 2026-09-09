// Pure coaching policy. Nothing in this module reads or writes a game or save.
// An adapter must supply a verified season event, full schedules, and career dates.
import { createHash } from 'node:crypto';

export const ENGINE = 'stryker-coaching-js-v1';
export const DIMENSIONS = Object.freeze(['short_build_up', 'tempo', 'width', 'support', 'pressing', 'line_height', 'compactness', 'transition']);
export const POLICY = Object.freeze({ retirement_start: 62, retirement_limit: 72, minimum_matches: 12,
  minimum_tenure_days: 120, sacking_deficit_ppg: 0.55 });
export const FORMATIONS = Object.freeze(['4-3-3', '4-2-3-1', '4-4-2', '3-4-2-1', '3-5-2', '4-1-4-1']);

const DAY = 86400000;
const owns = (value, key) => Object.hasOwn(value, key);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const number = (value, low, high) => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
const identifier = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 512
  && !['__proto__', 'constructor', 'prototype'].includes(value) && !/[\u0000-\u001f]/.test(value);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const clamp = value => Math.max(0, Math.min(1, value));

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Career dates must use YYYY-MM-DD.');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) throw new Error('Invalid career date.');
  return parsed;
}

export function ageOn(birthDate, careerDate) {
  const born = parseDate(birthDate), current = parseDate(careerDate);
  return current.getUTCFullYear() - born.getUTCFullYear() - (careerDate.slice(5) < birthDate.slice(5) ? 1 : 0);
}

function yearsAfter(value, years) {
  const source = parseDate(value), year = source.getUTCFullYear() + years;
  const end = new Date(Date.UTC(year, source.getUTCMonth() + 1, 0)).getUTCDate();
  return `${String(year).padStart(4, '0')}-${value.slice(5, 7)}-${String(Math.min(source.getUTCDate(), end)).padStart(2, '0')}`;
}

function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (plain(value)) return `{${Object.keys(value).sort(compare).map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  throw new Error('Coaching snapshots must contain only finite JSON data.');
}

const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const unknownAge = coach => coach.kind === 'real' && coach.birth_date === null;

function profile(value) {
  if (!plain(value) || Object.keys(value).length !== DIMENSIONS.length
    || DIMENSIONS.some(key => !owns(value, key) || !number(value[key], 0, 1))) throw new Error('A complete normalized tactical profile is required.');
}

export function validateState(state) {
  if (!plain(state) || state.version !== 1 || !identifier(state.career_id) || !['BAL', 'ML'].includes(state.mode)
    || (state.engine !== undefined && state.engine !== ENGINE)) throw new Error('Unknown career identity, mode, or coaching engine.');
  const current = parseDate(state.date);
  if (!Number.isSafeInteger(state.seed) || !Number.isSafeInteger(state.next_generated) || state.next_generated < 0) throw new Error('Persistent seed and generated identity counter are required.');
  if (!plain(state.clubs) || !plain(state.coaches) || !Object.keys(state.clubs).length
    || !identifier(state.user_club) || !owns(state.clubs, state.user_club)) throw new Error('Player club must be explicitly identified.');
  for (const [identity, coach] of Object.entries(state.coaches)) {
    if (!identifier(identity) || !plain(coach) || !['real', 'fictional'].includes(coach.kind)
      || typeof coach.name !== 'string' || !coach.name.trim() || /[\u0000-\u001f]/.test(coach.name)
      || typeof coach.retired !== 'boolean') throw new Error('Real and fictional coach identities must be explicit.');
    if (unknownAge(coach)) {
      // This is an explicit gameplay horizon, never a guessed birth date or age.
      const retirement = parseDate(coach.retirement_date);
      if (typeof coach.retirement_policy_source !== 'string' || !coach.retirement_policy_source.trim()
        || (!coach.retired && retirement < current)) throw new Error('Unknown real age requires an explicit future retirement horizon and policy source.');
    } else {
      const age = ageOn(coach.birth_date, state.date);
      if (age < 18 || (!coach.retired && age >= POLICY.retirement_limit)) throw new Error('Active coach age outside simulation policy.');
      if (coach.kind === 'real' && (typeof coach.biography_source !== 'string' || !coach.biography_source.trim())) throw new Error('Real birth dates require documented sources.');
    }
    profile(coach.style);
    if (!number(coach.reputation, 0, 1) || !number(coach.adaptability, 0, 1)) throw new Error('Invalid coach characteristics.');
    if (!Array.isArray(coach.formations) || !coach.formations.length || coach.formations.length > 3
      || new Set(coach.formations).size !== coach.formations.length || coach.formations.some(f => !FORMATIONS.includes(f))) throw new Error('Unsupported or duplicate preferred formations.');
  }
  const employed = new Set();
  for (const [identity, club] of Object.entries(state.clubs)) {
    if (!identifier(identity) || !plain(club) || club.kind !== 'club') throw new Error('National teams require a separate competition policy.');
    if (!identifier(club.coach) || !owns(state.coaches, club.coach) || employed.has(club.coach)
      || state.coaches[club.coach].retired) throw new Error('Unknown, retired, or multiply employed coach.');
    employed.add(club.coach);
    profile(club.identity);
    if (!number(club.reputation, 0, 1) || !number(club.expected_ppg, 0, 3)) throw new Error('Explicit club expectations are required.');
    const appointed = parseDate(club.appointed), end = parseDate(club.contract_end);
    if (appointed > current || end < appointed) throw new Error('Invalid appointment or contract dates.');
  }
  if (state.last_event !== undefined) {
    const last = state.last_event;
    if (!plain(last) || last.date !== state.date || last.engine !== ENGINE || !identifier(last.id)
      || !/^[a-f0-9]{64}$/.test(last.results_hash) || !/^[a-f0-9]{64}$/.test(last.event_hash)
      || !Array.isArray(last.events)) throw new Error('Invalid coaching checkpoint; restore a matching snapshot.');
  }
  canonical(state);
  return true;
}

// SHA-256 counter stream defines a stable algorithm, independent of Math.random.
function random(state, boundary, identity) {
  const prefix = canonical([ENGINE, state.career_id, state.seed, boundary, identity]);
  let counter = 0, pool = Buffer.alloc(0), index = 0;
  const next = () => {
    if (index + 4 > pool.length) {
      pool = createHash('sha256').update(`${prefix}:${counter++}`).digest();
      index = 0;
    }
    const value = pool.readUInt32BE(index) / 0x100000000;
    index += 4;
    return value;
  };
  return { next, integer: (low, high) => low + Math.floor(next() * (high - low + 1)),
    uniform: (low, high) => low + next() * (high - low), choose: values => values[Math.floor(next() * values.length)] };
}

export function tacticalIntent(state, clubId) {
  if (!['ML', 'BAL'].includes(state.mode) || !plain(state.clubs) || !owns(state.clubs, clubId)) throw new Error('Unknown club or career mode.');
  if (state.mode === 'ML' && clubId === state.user_club) return null;
  const club = state.clubs[clubId], coach = state.coaches[club.coach];
  if (!coach || !number(coach.adaptability, 0, 1)) throw new Error('Unknown or invalid coach.');
  profile(club.identity); profile(coach.style);
  const weight = 0.8 - 0.25 * coach.adaptability;
  return { coach: club.coach, formations: [...coach.formations],
    style: Object.fromEntries(DIMENSIONS.map(key => [key, Math.round((weight * coach.style[key]
      + (1 - weight) * club.identity[key]) * 1e6) / 1e6])), applied_to_game: false };
}

// Authored fictional name pools; no claim of real biography or ex-player identity.
const NAMES = [
  [['Alexis', 'Luc', 'Hugo', 'Remi', 'Theo', 'Marc', 'Leo', 'Yann'], ['Morel', 'Valmont', 'Aubert', 'Mercier', 'Delmas', 'Roux', 'Fabre', 'Vidal']],
  [['Diego', 'Ruben', 'Javier', 'Pablo', 'Raul', 'Sergio', 'Iker', 'Mateo'], ['Marin', 'Rivas', 'Soler', 'Moya', 'Vega', 'Soto', 'Luna', 'Varela']],
  [['Tiago', 'Rui', 'Nuno', 'Caio', 'Davi', 'Ivo', 'Bruno', 'Joao'], ['Silva', 'Costa', 'Melo', 'Lima', 'Duarte', 'Mota', 'Faria', 'Reis']],
  [['Marco', 'Luca', 'Elio', 'Dario', 'Nico', 'Paolo', 'Fabio', 'Carlo'], ['Rossi', 'Leone', 'Riva', 'Marini', 'Gallo', 'Serra', 'Costa', 'Belli']],
  [['Leon', 'Lukas', 'Felix', 'Jonas', 'Emil', 'Timo', 'Nils', 'Lars'], ['Keller', 'Voss', 'Weber', 'Koch', 'Falk', 'Berg', 'Kuhn', 'Brandt']],
  [['Owen', 'Noah', 'Evan', 'Liam', 'Rhys', 'Adam', 'Ellis', 'Sam'], ['Reed', 'Doyle', 'Hayes', 'Ward', 'Walsh', 'Frost', 'Shaw', 'Quinn']],
  [['Milan', 'Luka', 'Ivan', 'Tomas', 'Jan', 'Marek', 'Pavel', 'Emir'], ['Novak', 'Kovac', 'Horvat', 'Vidic', 'Kolar', 'Dvorak', 'Pavic', 'Babic']],
  [['Youssef', 'Amine', 'Sami', 'Rayan', 'Karim', 'Nadir', 'Malik', 'Idris'], ['Mansour', 'Haddad', 'Fares', 'Salem', 'Nouri', 'Hamdi', 'Bensaid', 'Rahmani']],
  [['Kofi', 'Kwame', 'Tariq', 'Sadio', 'Moussa', 'Amadou', 'Issa', 'Seydou'], ['Diallo', 'Sow', 'Traore', 'Toure', 'Mensah', 'Ba', 'Sane', 'Keita']],
  [['Haru', 'Ren', 'Riku', 'Kaito', 'Sota', 'Yuto', 'Akira', 'Naoki'], ['Mori', 'Arai', 'Kato', 'Sano', 'Ono', 'Kubo', 'Abe', 'Noda']],
];

function newCoach(state, boundary, clubId) {
  let identity;
  do {
    if (state.next_generated >= Number.MAX_SAFE_INTEGER) throw new Error('Generated identity counter exhausted.');
    identity = `fictional:${state.next_generated++}`;
  } while (owns(state.coaches, identity));
  const rng = random(state, boundary, identity), names = new Set(Object.values(state.coaches).map(c => c.name));
  let name;
  for (let attempt = 0; attempt < 10000; attempt++) {
    const [first, last] = rng.choose(NAMES);
    name = attempt < 32 ? `${rng.choose(first)} ${rng.choose(last)}` : `${rng.choose(first)} ${rng.choose(first)} ${rng.choose(last)}`;
    if (!names.has(name) && Buffer.byteLength(name, 'utf8') < 46) break;
    name = undefined;
  }
  if (!name) throw new Error('Fictional name pool exhausted.');
  let year = parseDate(boundary).getUTCFullYear() - rng.integer(32, 46);
  const birthday = `${String(rng.integer(1, 12)).padStart(2, '0')}-${String(rng.integer(1, 28)).padStart(2, '0')}`;
  if (birthday > boundary.slice(5)) year--;
  const birth = `${year}-${birthday}`;
  const club = state.clubs[clubId], options = [...FORMATIONS], formations = [];
  for (let i = 0; i < 3; i++) formations.push(options.splice(rng.integer(0, options.length - 1), 1)[0]);
  state.coaches[identity] = { name, kind: 'fictional', birth_date: birth, retired: false,
    reputation: clamp(club.reputation + rng.uniform(-0.2, 0.05)), adaptability: rng.uniform(0.25, 0.85),
    style: Object.fromEntries(DIMENSIONS.map(key => [key, Math.max(0.05, Math.min(0.95, club.identity[key] + rng.uniform(-0.3, 0.3)))])),
    formations, origin: 'Authored fictional coach; no real biography or former-player conversion.' };
  return identity;
}

function validateEvent(state, boundary, results, event) {
  if (!plain(event) || event.type !== 'season_completed' || !identifier(event.id)
    || event.date !== boundary || typeof event.source !== 'string' || !event.source.trim()
    || !Array.isArray(event.leagues) || !event.leagues.length) throw new Error('An explicit verified season event and schedule source are required.');
  const start = parseDate(event.season_start), target = parseDate(boundary);
  if ((target - start) / DAY < 270 || (target - start) / DAY > 400) throw new Error('Invalid explicit season calendar.');
  if (!plain(results) || Object.keys(results).length !== Object.keys(state.clubs).length
    || Object.keys(state.clubs).some(id => !owns(results, id))) throw new Error('Every club needs recorded or explicitly unavailable results.');
  for (const outcome of Object.values(results)) {
    if (!plain(outcome)) throw new Error('Invalid league results.');
    if (outcome.status === 'unavailable') {
      if (!['no_native_results', 'unsupported_competition_phase', 'incomplete_league_schedule'].includes(outcome.reason)
        || ['matches', 'points', 'wins', 'draws', 'losses', 'competition_id'].some(key => owns(outcome, key))) throw new Error('Unavailable results need an explicit reason and no invented totals.');
      continue;
    }
    if ((outcome.status !== undefined && outcome.status !== 'recorded') || !Number.isSafeInteger(outcome.matches)
      || !Number.isSafeInteger(outcome.points) || outcome.matches < 0 || outcome.points < 0
      || outcome.points > outcome.matches * 3 || !Number.isSafeInteger(outcome.competition_id)
      || outcome.competition_id < 0 || outcome.competition_id >= 65535) throw new Error('Invalid recorded league results.');
  }
  const covered = new Set(), competitions = new Set();
  for (const league of event.leagues) {
    if (!plain(league) || !Number.isSafeInteger(league.competition_id) || league.competition_id < 0 || league.competition_id >= 65535
      || competitions.has(league.competition_id) || !Array.isArray(league.clubs) || league.clubs.length < 2
      || !Number.isSafeInteger(league.matches_per_club) || league.matches_per_club < 1 || league.matches_per_club > 255) throw new Error('Invalid complete league schedule.');
    competitions.add(league.competition_id);
    for (const clubId of league.clubs) {
      if (!identifier(clubId) || !owns(state.clubs, clubId) || covered.has(clubId)) throw new Error('Schedule membership is unknown, overlapping, or duplicated.');
      const outcome = results[clubId];
      if (outcome.status === 'unavailable' || outcome.competition_id !== league.competition_id
        || outcome.matches !== league.matches_per_club) throw new Error('The verified league schedule is not complete in these results.');
      covered.add(clubId);
    }
  }
  for (const [clubId, outcome] of Object.entries(results)) {
    if (outcome.status !== 'unavailable' && !covered.has(clubId)) throw new Error('Recorded results lack a complete verified schedule.');
  }
  // Membership order is not evidence of a different event; normalize before hashing.
  return { ...event, leagues: event.leagues.map(l => ({ ...l, clubs: [...l.clubs].sort(compare) }))
    .sort((a, b) => a.competition_id - b.competition_id) };
}

/**
 * End-of-season computation only. event: {type:'season_completed', id, date,
 * season_start, source, leagues:[{competition_id, clubs, matches_per_club}]}.
 * Recorded results: {competition_id, matches, points}. The adapter must establish
 * actual season completion and all league members; the calendar alone proves neither.
 */
export function advanceSeason(state, boundary, results, { event } = {}) {
  validateState(state);
  const current = parseDate(state.date), target = parseDate(boundary);
  const verified = validateEvent(state, boundary, results, event);
  const resultsHash = hash(results), eventHash = hash(verified);
  if (boundary === state.date && state.last_event) {
    if (state.last_event.results_hash !== resultsHash || state.last_event.event_hash !== eventHash) throw new Error('Conflicting replay; restore the matching career snapshot first.');
    return structuredClone(state);
  }
  const start = parseDate(event.season_start);
  const fullSeason = start.valueOf() === current.valueOf();
  const partialFirst = !state.last_event && start < current && current < target;
  if (target <= current || (!fullSeason && !partialFirst)
    || (target - current) / DAY > 400 || event.id === state.last_event?.id) throw new Error('Advance one verified career season at a time.');
  const output = structuredClone(state), events = [];
  for (const identity of Object.keys(output.coaches).sort(compare)) {
    const coach = output.coaches[identity];
    if (coach.retired) continue;
    const age = unknownAge(coach) ? null : ageOn(coach.birth_date, boundary);
    const probability = age === null ? 0 : Math.max(0, (age - POLICY.retirement_start + 1) * 0.06);
    const horizon = age === null && parseDate(coach.retirement_date) <= target;
    if (horizon || (age !== null && (age >= POLICY.retirement_limit || random(state, boundary, identity).next() < probability))) {
      coach.retired = true;
      events.push({ type: 'retired', coach: identity, age, reason: horizon ? 'career_horizon' : 'age',
        ...(horizon ? { retirement_policy_source: coach.retirement_policy_source } : {}) });
    }
  }
  const vacancies = [];
  for (const clubId of Object.keys(output.clubs).sort(compare)) {
    const club = output.clubs[clubId], previous = club.coach;
    const retired = output.coaches[previous].retired, record = results[clubId];
    const unavailable = record.status === 'unavailable';
    if (unavailable) events.push({ type: 'performance_not_evaluated', club: clubId, reason: record.reason });
    const enough = !unavailable && record.matches >= POLICY.minimum_matches;
    const tenure = (target - parseDate(club.appointed)) / DAY;
    const deficit = unavailable ? 0 : club.expected_ppg - record.points / Math.max(1, record.matches);
    const poor = enough && tenure >= POLICY.minimum_tenure_days && deficit >= POLICY.sacking_deficit_ppg;
    const expired = parseDate(club.contract_end) <= target;
    let reason;
    if (retired || poor) reason = retired ? 'retirement' : 'underperformance';
    else if (expired && random(state, boundary, clubId).next() < 0.25) reason = 'contract_end';
    else {
      if (expired) {
        club.contract_end = yearsAfter(boundary, 2);
        events.push({ type: 'renewed', club: clubId, coach: previous, until: club.contract_end });
      }
      continue;
    }
    club.coach = null;
    vacancies.push([clubId, previous]);
    events.push({ type: 'departed', club: clubId, coach: previous, reason });
  }
  vacancies.sort((a, b) => output.clubs[b[0]].reputation - output.clubs[a[0]].reputation || compare(a[0], b[0]));
  const employed = new Set(Object.values(output.clubs).map(c => c.coach).filter(c => c !== null));
  for (const [clubId, previous] of vacancies) {
    const club = output.clubs[clubId];
    let chosen = null, best = Infinity;
    for (const identity of Object.keys(output.coaches).sort(compare)) {
      const coach = output.coaches[identity];
      if (identity === previous || employed.has(identity) || coach.retired || (!unknownAge(coach) && ageOn(coach.birth_date, boundary) < 30)) continue;
      const gap = DIMENSIONS.reduce((sum, key) => sum + Math.abs(coach.style[key] - club.identity[key]), 0) / DIMENSIONS.length;
      const score = 0.65 * Math.abs(coach.reputation - club.reputation) + 0.35 * gap;
      if (score < best || (score === best && compare(identity, chosen) > 0)) { chosen = identity; best = score; }
    }
    if (chosen === null) {
      chosen = newCoach(output, boundary, clubId);
      events.push({ type: 'generated', coach: chosen });
    }
    Object.assign(club, { coach: chosen, appointed: boundary, contract_end: yearsAfter(boundary, 2) });
    employed.add(chosen);
    events.push({ type: 'appointed', club: clubId, coach: chosen });
  }
  Object.assign(output, { date: boundary, engine: ENGINE,
    last_event: { id: event.id, date: boundary, engine: ENGINE, results_hash: resultsHash, event_hash: eventHash, events } });
  validateState(output);
  return output;
}
