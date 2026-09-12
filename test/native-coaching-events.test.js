import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceSeason, ageOn, DIMENSIONS, POLICY, validateState } from '../server/career/coaching.js';

const profile = value => Object.fromEntries(DIMENSIONS.map(key => [key, value]));
function fixture({ clubs = 4, coaches = 6 } = {}) {
  const state = { version: 1, career_id: 'synthetic-native-season-career', mode: 'BAL', user_club: 'club:0',
    date: '2026-05-18', seed: 7319, next_generated: 0, clubs: {}, coaches: {} };
  for (let i = 0; i < coaches; i++) state.coaches[`coach:${i}`] = {
    name: `Synthetic coach ${i}`, kind: 'fictional', birth_date: '1980-01-01', retired: false,
    reputation: (i % 8 + 1) / 10, adaptability: 0.5, style: profile((i % 8 + 1) / 10), formations: ['4-3-3', '4-2-3-1'],
  };
  for (let i = 0; i < clubs; i++) state.clubs[`club:${i}`] = {
    kind: 'club', coach: `coach:${i}`, reputation: (i % 8 + 1) / 10, expected_ppg: 1.6,
    identity: profile((i % 8 + 1) / 10), appointed: '2025-07-01', contract_end: '2027-05-25',
  };
  return state;
}

function completed(state, { date = '2026-05-25', cycle = 0, points = 61 } = {}) {
  const clubs = Object.keys(state.clubs), split = Math.floor(clubs.length / 2);
  const leagues = [clubs.slice(0, split), clubs.slice(split)].map((members, index) => ({
    competition_id: 20 + index, clubs: members, matches_per_club: 38,
  }));
  return { results: Object.fromEntries(leagues.flatMap(league => league.clubs.map(id => [id,
    { competition_id: league.competition_id, matches: 38, points }]))),
  event: { type: 'native_season_completed', id: `native-observation:${cycle}:${date}`, date, cycle,
    anchor_competition_id: 20, observed_since: state.date,
    source: 'Synthetic schedule observer evidence; not a real-game season proof.', leagues } };
}

const advance = (state, options) => {
  const evidence = completed(state, options);
  return advanceSeason(state, evidence.event.date, evidence.results, evidence);
};
const afterDays = (date, days) => new Date(Date.parse(`${date}T00:00:00.000Z`) + days * 86400000).toISOString().slice(0, 10);

test('a native completion after midseason initialization needs no invented season start', () => {
  const state = fixture(), before = structuredClone(state), evidence = completed(state, { points: 15 });
  assert.equal(evidence.event.season_start, undefined);
  const output = advanceSeason(state, evidence.event.date, evidence.results, evidence);
  assert.deepEqual(state, before);
  assert.equal(output.date, '2026-05-25');
  assert.equal(output.last_event.type, 'native_season_completed');
  assert.equal(output.last_event.cycle, 0);
  assert.equal(output.last_event.anchor_competition_id, 20);
  assert.equal(output.last_event.observed_since, '2026-05-18');
  assert.equal(output.last_event.events.filter(e => e.reason === 'underperformance').length, 4);
  const recent = fixture();
  for (const club of Object.values(recent.clubs)) club.appointed = recent.date;
  assert.equal(advance(recent, { points: 15 }).last_event.events.filter(e => e.reason === 'underperformance').length, 0);
});

test('native events still require complete schedules, native metadata, and a completed annual anchor', () => {
  const state = fixture();
  for (const mutate of [
    e => { e.event.cycle = -1; }, e => { e.event.cycle = 0.5; }, e => { e.event.cycle = true; },
    e => { delete e.event.cycle; }, e => { e.event.observed_since = '2026-05-26'; },
    e => { e.event.observed_since = '2026-02-30'; }, e => { delete e.event.observed_since; },
    e => { e.event.anchor_competition_id = 22; }, e => { e.event.anchor_competition_id = '20'; },
    e => { e.event.source = ''; }, e => { e.event.leagues.pop(); },
    e => { e.event.leagues[0].clubs.push('club:2'); }, e => { e.event.leagues[0].clubs.pop(); },
    e => { e.results['club:0'].matches = 37; }, e => { e.results['club:0'].competition_id = 1044; },
    e => { e.results['club:0'] = { status: 'unavailable', reason: 'incomplete_league_schedule' }; },
  ]) {
    const evidence = completed(state); mutate(evidence);
    assert.throws(() => advanceSeason(state, evidence.event.date, evidence.results, evidence));
  }
  for (const date of [state.date, '2026-05-17', afterDays(state.date, 551)]) assert.throws(() => advance(state, { date }));
  assert.equal(advance(state, { cycle: 7 }).last_event.cycle, 7);
});

test('native replay is exact and survives JSON persistence and reordered league membership', () => {
  const state = fixture(), evidence = completed(state, { points: 15 });
  const output = advanceSeason(state, evidence.event.date, evidence.results, evidence);
  const restored = JSON.parse(JSON.stringify(output));
  evidence.event.leagues.reverse();
  for (const league of evidence.event.leagues) league.clubs.reverse();
  assert.deepEqual(output, advanceSeason(restored, evidence.event.date, evidence.results, evidence));
  for (const mutate of [
    e => { e.event.id = 'another-id'; }, e => { e.event.source = 'different evidence'; },
    e => { e.event.observed_since = '2026-05-17'; }, e => { e.event.cycle = 1; },
    e => { e.results['club:0'].points++; }, e => { e.event.anchor_competition_id = 21; },
  ]) {
    const conflict = structuredClone(evidence); mutate(conflict);
    assert.throws(() => advanceSeason(restored, conflict.event.date, conflict.results, conflict), /replay/i);
  }
});

test('the fixed anchor advances the world once per consecutive cycle, not once per finished league', () => {
  const first = advance(fixture());
  const second = advance(first, { date: '2027-05-25', cycle: 1 });
  assert.equal(second.last_event.cycle, 1);
  for (const options of [
    { date: '2027-05-25', cycle: 0 }, { date: '2027-05-25', cycle: 2 },
    { date: afterDays(first.date, 179), cycle: 1 }, { date: afterDays(first.date, 551), cycle: 1 },
  ]) assert.throws(() => advance(first, options), /native.*season/i);
  for (const days of [180, 550]) assert.equal(advance(first, { date: afterDays(first.date, days), cycle: 1 }).last_event.cycle, 1);
  const differentAnchor = completed(first, { date: '2027-05-25', cycle: 1 });
  differentAnchor.event.anchor_competition_id = 21;
  assert.throws(() => advanceSeason(first, differentAnchor.event.date, differentAnchor.results, differentAnchor), /same annual anchor/i);
  const reusedId = completed(first, { date: '2027-05-25', cycle: 1 });
  reusedId.event.id = first.last_event.id;
  assert.throws(() => advanceSeason(first, reusedId.event.date, reusedId.results, reusedId));
  assert.throws(() => advance(second, { date: '2027-05-26', cycle: 2 }), /plausible native/i);
});

test('legacy and native event chains cannot be mixed to bypass cycle and retirement cadence', () => {
  const state = fixture(), native = advance(state), annual = completed(state, { date: '2027-05-18' });
  Object.assign(annual.event, { type: 'season_completed', season_start: state.date });
  delete annual.event.cycle; delete annual.event.anchor_competition_id; delete annual.event.observed_since;
  const legacy = advanceSeason(state, annual.event.date, annual.results, annual);
  assert.throws(() => advance(legacy, { date: '2028-05-18', cycle: 1 }), /native season cycle/i);
  Object.assign(annual.event, { date: '2027-05-25', season_start: native.date });
  assert.throws(() => advanceSeason(native, annual.event.date, annual.results, annual), /verified career season/i);
});

test('native cycle metadata is checked when loading persistent coaching state', () => {
  const output = advance(fixture());
  for (const mutate of [
    e => { e.type = 'unsupported'; }, e => { e.cycle = -1; }, e => { e.anchor_competition_id = 65535; },
    e => { e.observed_since = '2026-05-26'; }, e => { delete e.cycle; }, e => { delete e.type; },
  ]) {
    const bad = structuredClone(output); mutate(bad.last_event);
    assert.throws(() => validateState(bad));
  }
});

test('native cycles retain age retirement, contracts, unique appointments and new generations for 25 seasons', () => {
  let state = fixture({ clubs: 40, coaches: 55 });
  for (let i = 0; i < 55; i++) {
    if (i % 2) Object.assign(state.coaches[`coach:${i}`], { kind: 'native', birth_date: null,
      retirement_date: `${2032 + i % 7}-05-25`, retirement_policy_source: 'stryker:synthetic-native-horizon-test' });
    else state.coaches[`coach:${i}`].birth_date = `${1955 + i % 35}-01-01`;
  }
  const events = [];
  for (let cycle = 0; cycle < 25; cycle++) {
    state = advance(state, { date: `${2026 + cycle}-05-25`, cycle, points: cycle % 3 === 0 ? 15 : 61 });
    assert.equal(state.last_event.cycle, cycle);
    assert.equal(state.last_event.anchor_competition_id, 20);
    const employed = Object.values(state.clubs).map(club => club.coach);
    assert.equal(new Set(employed).size, 40);
    assert.ok(employed.every(id => !state.coaches[id].retired));
    assert.ok(Object.values(state.clubs).every(club => club.contract_end > state.date));
    assert.ok(Object.values(state.coaches).filter(coach => !coach.retired && coach.birth_date !== null)
      .every(coach => ageOn(coach.birth_date, state.date) < POLICY.retirement_limit));
    events.push(...state.last_event.events);
    state = JSON.parse(JSON.stringify(state));
  }
  for (let i = 1; i < 55; i += 2) assert.equal(state.coaches[`coach:${i}`].retired, true);
  assert.ok(state.next_generated > 0);
  for (const type of ['generated', 'retired', 'renewed', 'appointed']) assert.ok(events.some(e => e.type === type));
  assert.ok(events.some(e => e.reason === 'career_horizon' && e.age === null));
  assert.equal(validateState(state), true);
});
