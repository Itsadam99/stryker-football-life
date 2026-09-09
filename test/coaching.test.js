import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceSeason, ageOn, DIMENSIONS, ENGINE, POLICY, tacticalIntent, validateState } from '../server/career/coaching.js';

const profile = value => Object.fromEntries(DIMENSIONS.map(key => [key, value]));
function fixture({ mode = 'BAL', clubs = 3, coaches = 4, born = '1980-01-01' } = {}) {
  const state = { version: 1, career_id: 'fictional-test-career', mode, user_club: 'club:0',
    date: '2025-07-01', seed: 7319, next_generated: 0, clubs: {}, coaches: {} };
  for (let i = 0; i < coaches; i++) state.coaches[`coach:${i}`] = {
    name: `Test coach ${i}`, kind: 'fictional', birth_date: born, retired: false,
    reputation: (i % 11) / 10, adaptability: 0.5, style: profile((i % 9 + 1) / 10), formations: ['4-3-3', '4-2-3-1'],
  };
  for (let i = 0; i < clubs; i++) state.clubs[`club:${i}`] = {
    kind: 'club', coach: `coach:${i}`, reputation: (i % 11) / 10, expected_ppg: 1.6,
    identity: profile((i % 8 + 1) / 10), appointed: state.date, contract_end: '2027-07-01',
  };
  return state;
}

function completed(state, boundary, { matches = 38, points = 61, seasonStart = state.date } = {}) {
  return { results: Object.fromEntries(Object.keys(state.clubs).map(id => [id, { competition_id: 20, matches, points }])),
    event: { type: 'season_completed', id: `fixture-season:${boundary}`, date: boundary, season_start: seasonStart,
      source: 'Synthetic verified complete fixture schedule; not real game evidence.',
      leagues: [{ competition_id: 20, clubs: Object.keys(state.clubs), matches_per_club: matches }] } };
}

function advance(state, boundary = '2026-07-01', options) {
  const { results, event } = completed(state, boundary, options);
  return advanceSeason(state, boundary, results, { event });
}

test('age follows career birthdays, including leap-year boundaries', () => {
  assert.equal(ageOn('1965-02-24', '2025-02-23'), 59);
  assert.equal(ageOn('1965-02-24', '2025-02-24'), 60);
  assert.equal(ageOn('1980-02-29', '2025-02-28'), 44);
  assert.equal(ageOn('1980-02-29', '2025-03-01'), 45);
  for (const bad of ['2025-02-29', '2025-13-01', '2025-6-01', null, '2025-01-01T00:00:00Z']) {
    assert.throws(() => ageOn('1980-01-01', bad), /date/i);
  }
});

test('complete schedules and an explicit verified event are mandatory', () => {
  const state = fixture(), { results, event } = completed(state, '2026-07-01');
  assert.throws(() => advanceSeason(state, '2026-07-01', results), /event/i);
  for (const mutate of [
    event => { event.type = 'calendar_changed'; },
    event => { event.source = ' '; },
    event => { event.leagues = []; },
    event => { event.date = '2026-07-02'; },
    event => { event.leagues[0].clubs.pop(); },
    event => { event.leagues[0].clubs.push('club:0'); },
    event => { event.leagues[0].clubs.push('missing'); },
    event => { event.leagues.push(structuredClone(event.leagues[0])); },
    event => { event.leagues[0].matches_per_club = 37; },
    event => { event.leagues[0].competition_id = 21; },
  ]) {
    const bad = structuredClone(event); mutate(bad);
    assert.throws(() => advanceSeason(state, '2026-07-01', results, { event: bad }));
  }
  assert.equal(advanceSeason(state, '2026-07-01', results, { event }).date, '2026-07-01');
});

test('a partial table cannot masquerade as complete and cups cannot replace league results', () => {
  const state = fixture(), { results, event } = completed(state, '2026-07-01');
  results['club:0'].matches = 37;
  assert.throws(() => advanceSeason(state, '2026-07-01', results, { event }), /not complete/i);
  results['club:0'].matches = 38;
  results['club:0'].competition_id = 1044;
  assert.throws(() => advanceSeason(state, '2026-07-01', results, { event }), /not complete/i);
});

test('one explicit first partial season works but dates alone, backwards and skipped years do not', () => {
  const state = fixture(); state.date = '2025-10-24';
  const first = advance(state, '2026-07-01', { seasonStart: '2025-07-01' });
  assert.equal(first.date, '2026-07-01');
  assert.throws(() => advance(state), /calendar/i);
  for (const date of ['2024-07-01', '2025-11-01', '2028-07-01']) assert.throws(() => advance(state, date));
  assert.throws(() => advance(first, '2027-07-01', { seasonStart: '2026-06-01' }), /one verified/i);
});

test('replay and restored snapshots are deterministic and never mutate the supplied snapshot', () => {
  const state = fixture(), before = structuredClone(state);
  const evidence = completed(state, '2026-07-01', { points: 15 });
  const first = advanceSeason(state, evidence.event.date, evidence.results, evidence);
  assert.deepEqual(state, before);
  assert.deepEqual(first, advanceSeason(before, evidence.event.date, evidence.results, evidence));
  assert.deepEqual(first, advanceSeason(first, evidence.event.date, evidence.results, evidence));
  assert.equal(first.last_event.engine, ENGINE);
  const conflict = structuredClone(evidence); conflict.results['club:0'].points = 16;
  assert.throws(() => advanceSeason(first, evidence.event.date, conflict.results, conflict), /replay/i);
  const otherEvent = structuredClone(evidence); otherEvent.event.source = 'Another schedule';
  assert.throws(() => advanceSeason(first, evidence.event.date, otherEvent.results, otherEvent), /replay/i);
  const continuation = advance(first, '2027-07-01');
  assert.deepEqual(continuation, advance(JSON.parse(JSON.stringify(first)), '2027-07-01'));
});

test('JSON key and league membership order do not change appointments or replay', () => {
  const state = fixture(), alternate = structuredClone(state);
  alternate.clubs = Object.fromEntries(Object.entries(alternate.clubs).reverse());
  alternate.coaches = Object.fromEntries(Object.entries(alternate.coaches).reverse());
  const first = advance(state, '2026-07-01', { points: 15 });
  assert.deepEqual(first, advance(alternate, '2026-07-01', { points: 15 }));
  const replay = completed(state, '2026-07-01', { points: 15 });
  replay.event.leagues[0].clubs.reverse();
  assert.deepEqual(first, advanceSeason(first, replay.event.date, replay.results, replay));
});

test('a complete small competition and recently appointed coaches are protected from premature sacking', () => {
  const state = fixture();
  const few = advance(state, '2026-07-01', { matches: 1, points: 0 });
  assert.equal(few.last_event.events.filter(e => e.type === 'departed').length, 0);
  state.date = '2026-06-01';
  for (const club of Object.values(state.clubs)) club.appointed = state.date;
  const recent = advance(state, '2026-07-01', { points: 0, seasonStart: '2025-07-01' });
  assert.equal(recent.last_event.events.filter(e => e.type === 'departed').length, 0);
});

test('a poor complete season can sack coaches and every vacancy gets one available replacement', () => {
  const state = fixture(), output = advance(state, '2026-07-01', { points: 15 });
  assert.equal(output.last_event.events.filter(e => e.reason === 'underperformance').length, 3);
  const assigned = Object.values(output.clubs).map(c => c.coach);
  assert.equal(new Set(assigned).size, 3);
  for (const id of Object.keys(state.clubs)) assert.notEqual(output.clubs[id].coach, state.clubs[id].coach);
});

test('unavailable results are never counted as defeats, and cannot include fabricated scores', () => {
  const state = fixture(), evidence = completed(state, '2026-07-01', { points: 0 });
  evidence.results['club:0'] = { status: 'unavailable', reason: 'no_native_results' };
  evidence.event.leagues[0].clubs = ['club:1', 'club:2'];
  const output = advanceSeason(state, evidence.event.date, evidence.results, evidence);
  assert.equal(output.clubs['club:0'].coach, state.clubs['club:0'].coach);
  assert.ok(output.last_event.events.some(e => e.type === 'performance_not_evaluated' && e.club === 'club:0'));
  for (const key of ['points', 'matches', 'wins', 'draws', 'losses', 'competition_id']) {
    const bad = structuredClone(evidence); bad.results['club:0'][key] = 0;
    assert.throws(() => advanceSeason(state, bad.event.date, bad.results, bad), /invented/i);
  }
  const missing = structuredClone(evidence); delete missing.results['club:0'];
  assert.throws(() => advanceSeason(state, missing.event.date, missing.results, missing), /every club/i);
});

test('missing competition results do not suppress age retirement or contract expiry', () => {
  const state = fixture(), evidence = completed(state, '2026-07-01');
  state.coaches['coach:0'].birth_date = '1954-01-01';
  state.clubs['club:0'].contract_end = '2040-07-01';
  evidence.results['club:0'] = { status: 'unavailable', reason: 'unsupported_competition_phase' };
  evidence.event.leagues[0].clubs = ['club:1', 'club:2'];
  const output = advanceSeason(state, evidence.event.date, evidence.results, evidence);
  assert.equal(output.coaches['coach:0'].retired, true);
  assert.notEqual(output.clubs['club:0'].coach, 'coach:0');
  assert.ok(output.last_event.events.some(e => e.reason === 'retirement' && e.club === 'club:0'));
});

test('expired contracts are renewed or replaced with future contracts', () => {
  const state = fixture({ clubs: 40, coaches: 50 });
  for (const club of Object.values(state.clubs)) club.contract_end = '2026-07-01';
  const output = advance(state);
  assert.ok(Object.values(output.clubs).every(club => club.contract_end === '2028-07-01'));
  assert.ok(output.last_event.events.some(e => e.type === 'renewed'));
  assert.ok(output.last_event.events.some(e => e.reason === 'contract_end'));
});

test('real coaches require real sourced dates, unknown ages are never fabricated', () => {
  const state = fixture();
  Object.assign(state.coaches['coach:0'], { kind: 'real', name: 'Hansi Flick', birth_date: '1965-02-24',
    biography_source: 'https://www.fcbarcelona.com/en/futbol/primer-equipo/staff/4030694/hansi-flick' });
  assert.equal(validateState(state), true);
  for (const patch of [{ birth_date: null }, { birth_date: undefined }, { biography_source: '' }, { biography_source: null }]) {
    const bad = structuredClone(state); Object.assign(bad.coaches['coach:0'], patch);
    assert.throws(() => advance(bad));
  }
});

test('explicit unknown real ages retire on an authored horizon without any invented age', () => {
  const state = fixture();
  Object.assign(state.coaches['coach:0'], { kind: 'real', name: 'Native coach with unknown biography', birth_date: null,
    retirement_date: '2027-07-01', retirement_policy_source: 'stryker:unknown-age-horizon-v1' });
  state.clubs['club:0'].contract_end = '2040-07-01';
  assert.equal(validateState(state), true);
  const first = advance(state);
  assert.equal(first.coaches['coach:0'].retired, false);
  assert.equal(first.coaches['coach:0'].birth_date, null);
  assert.equal(first.coaches['coach:0'].biography_source, undefined);
  const second = advance(first, '2027-07-01');
  assert.equal(second.coaches['coach:0'].retired, true);
  assert.notEqual(second.clubs['club:0'].coach, 'coach:0');
  assert.deepEqual(second.last_event.events.find(e => e.type === 'retired' && e.coach === 'coach:0'), {
    type: 'retired', coach: 'coach:0', age: null, reason: 'career_horizon', retirement_policy_source: 'stryker:unknown-age-horizon-v1',
  });
  for (const patch of [{ retirement_date: '2024-07-01' }, { retirement_date: null },
    { retirement_policy_source: '' }, { kind: 'fictional' }]) {
    const bad = structuredClone(state); Object.assign(bad.coaches['coach:0'], patch);
    assert.throws(() => advance(bad));
  }
});

test('tactics combine club identity and coach philosophy while ML user tactics stay free', () => {
  const state = fixture(), before = tacticalIntent(state, 'club:0');
  state.clubs['club:0'].coach = 'coach:3';
  const after = tacticalIntent(state, 'club:0');
  assert.notDeepEqual(before.style, after.style);
  assert.notDeepEqual(after.style, state.coaches['coach:3'].style);
  assert.notDeepEqual(after.style, state.clubs['club:0'].identity);
  assert.equal(after.applied_to_game, false);
  state.mode = 'ML';
  assert.equal(tacticalIntent(state, 'club:0'), null);
  assert.ok(tacticalIntent(state, 'club:1'));
  assert.throws(() => tacticalIntent(state, 'absent'), /Unknown club/i);
});

test('invalid identity, coach assignments, styles, dates and results fail before simulation', () => {
  for (const mutate of [
    s => { s.seed = 0.1; }, s => { s.next_generated = -1; }, s => { s.mode = 'EXHIBITION'; },
    s => { s.engine = 'future-incompatible-engine'; }, s => { s.clubs['club:0'].kind = 'national'; },
    s => { s.clubs['club:1'].coach = 'coach:0'; }, s => { s.coaches['coach:0'].retired = true; },
    s => { s.coaches['coach:0'].birth_date = '1953-01-01'; }, s => { s.coaches['coach:0'].birth_date = '2020-01-01'; },
    s => { s.clubs['club:0'].appointed = '2026-01-01'; }, s => { s.clubs['club:0'].contract_end = '2024-01-01'; },
    s => { s.coaches['coach:0'].style.width = NaN; }, s => { s.coaches['coach:0'].style.width = true; },
    s => { delete s.coaches['coach:0'].style.tempo; }, s => { s.coaches['coach:0'].formations = ['9-9-9']; },
  ]) { const bad = fixture(); mutate(bad); assert.throws(() => advance(bad)); }
  for (const patch of [{ points: -1 }, { points: 115 }, { matches: 1.5 }, { matches: true }, { status: 'lost' }, { competition_id: 65535 }]) {
    const state = fixture(), evidence = completed(state, '2026-07-01');
    Object.assign(evidence.results['club:0'], patch);
    assert.throws(() => advanceSeason(state, evidence.event.date, evidence.results, evidence));
  }
});

test('a full 749-club, 980-coach population remains coherent for 25 career seasons', { timeout: 60000 }, () => {
  let state = fixture({ clubs: 749, coaches: 980 });
  for (let i = 0; i < 980; i++) {
    if (i % 2) Object.assign(state.coaches[`coach:${i}`], { kind: 'real', birth_date: null,
      retirement_date: `${2033 + i % 7}-07-01`, retirement_policy_source: 'stryker:unknown-age-horizon-v1' });
    else state.coaches[`coach:${i}`].birth_date = `${1954 + i % 37}-01-01`;
  }
  const allEvents = [];
  for (let year = 2026; year <= 2050; year++) {
    const evidence = completed(state, `${year}-07-01`), clubs = Object.keys(state.clubs);
    evidence.event.leagues = [];
    // Synthetic leagues with complete double round-robin schedules, including a 9-club final league.
    for (let offset = 0; offset < clubs.length; offset += 20) {
      const members = clubs.slice(offset, offset + 20), competition = 20 + offset / 20, matches = 2 * (members.length - 1);
      evidence.event.leagues.push({ competition_id: competition, clubs: members, matches_per_club: matches });
      for (const id of members) evidence.results[id] = { competition_id: competition, matches,
        points: Math.round(matches * (year % 3 === 0 ? 0.9 : 1.6)) };
    }
    state = advanceSeason(state, evidence.event.date, evidence.results, evidence);
    assert.equal(Object.keys(state.clubs).length, 749);
    const assigned = Object.values(state.clubs).map(c => c.coach);
    assert.equal(new Set(assigned).size, 749);
    assert.ok(assigned.every(id => !state.coaches[id].retired && (state.coaches[id].birth_date === null
      ? state.coaches[id].retirement_date > state.date : ageOn(state.coaches[id].birth_date, state.date) < POLICY.retirement_limit)));
    for (const event of state.last_event.events.filter(e => e.type === 'generated')) {
      const coach = state.coaches[event.coach], age = ageOn(coach.birth_date, state.date);
      assert.ok(age >= 32 && age <= 46);
      assert.equal(coach.kind, 'fictional');
      assert.doesNotMatch(coach.name, /\d/);
      assert.ok(Buffer.byteLength(coach.name) < 46);
      assert.equal(new Set(coach.formations).size, 3);
    }
    allEvents.push(...state.last_event.events);
    // Public snapshots survive JSON persistence without process-local RNG state.
    state = JSON.parse(JSON.stringify(state));
  }
  assert.equal(state.date, '2050-07-01');
  assert.ok(state.next_generated > 0);
  assert.ok(allEvents.some(e => e.type === 'generated'));
  assert.ok(allEvents.some(e => e.type === 'retired'));
  assert.ok(allEvents.some(e => e.reason === 'career_horizon' && e.age === null));
  for (let i = 1; i < 980; i += 2) assert.equal(state.coaches[`coach:${i}`].retired, true);
  const generated = Object.entries(state.coaches).filter(([id]) => id.startsWith('fictional:'));
  assert.equal(new Set(generated.map(([, c]) => c.name)).size, generated.length);
  assert.equal(validateState(state), true);
});
