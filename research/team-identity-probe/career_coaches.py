"""Deterministic coaching simulation, deliberately not connected to game writes.

Inputs must come from a verified career adapter: career date, all club results,
and explicit coach biographies. No wall clock, inferred results or fake real people.
Every call returns a new JSON-serializable snapshot, allowing save-specific rollback.
"""
import calendar
from copy import deepcopy
from datetime import date
import hashlib
import json
import math
import random

DIMENSIONS = ('short_build_up', 'tempo', 'width', 'support', 'pressing', 'line_height', 'compactness', 'transition')
POLICY = {'retirement_start': 62, 'retirement_limit': 72, 'minimum_matches': 12,
          'minimum_tenure_days': 120, 'sacking_deficit_ppg': .55}


def _date(value):
    parsed = date.fromisoformat(value)
    if parsed.isoformat() != value:
        raise ValueError('Career dates must use YYYY-MM-DD.')
    return parsed


def age_on(birth_date, career_date):
    born, current = _date(birth_date), _date(career_date)
    return current.year - born.year - ((current.month, current.day) < (born.month, born.day))


def _years_after(value, years):
    current = _date(value)
    year = current.year + years
    return date(year, current.month, min(current.day, calendar.monthrange(year, current.month)[1])).isoformat()


def _number(value, low, high):
    return type(value) in (int, float) and math.isfinite(value) and low <= value <= high


def _profile(value):
    if not isinstance(value, dict) or set(value) != set(DIMENSIONS) or any(not _number(v, 0, 1) for v in value.values()):
        raise ValueError('A complete, normalized tactical profile is required.')


def validate(state):
    if state.get('version') != 1 or not state.get('career_id') or state.get('mode') not in ('ML', 'BAL'):
        raise ValueError('Unknown career identity, mode or simulation version.')
    current = _date(state['date'])
    if type(state.get('seed')) is not int or type(state.get('next_generated')) is not int or state['next_generated'] < 0:
        raise ValueError('Persistent seed and generated identity counter are required.')
    clubs, coaches = state['clubs'], state['coaches']
    if state['user_club'] not in clubs or not clubs:
        raise ValueError('Player club must be explicitly identified.')
    for coach in coaches.values():
        years = age_on(coach['birth_date'], state['date'])
        if years < 18 or (not coach['retired'] and years >= POLICY['retirement_limit']):
            raise ValueError('Active coach age outside simulation policy.')
        if coach['kind'] not in ('real', 'fictional') or not coach['name']:
            raise ValueError('Real and fictional identities must be distinguished.')
        if coach['kind'] == 'real' and not coach.get('biography_source'):
            raise ValueError('A real birth date must have a documented source.')
        _profile(coach['style'])
        if not _number(coach['reputation'], 0, 1) or not _number(coach['adaptability'], 0, 1):
            raise ValueError('Invalid coach characteristics.')
        if not coach['formations'] or any(not isinstance(f, str) or not f for f in coach['formations']):
            raise ValueError('Preferred formations must be explicit.')
    employed = set()
    for club in clubs.values():
        if club.get('kind') != 'club':
            raise ValueError('National teams need a separate competition policy.')
        coach_id = club['coach']
        if coach_id not in coaches or coach_id in employed or coaches[coach_id]['retired']:
            raise ValueError('Unknown, retired or multiply employed coach.')
        employed.add(coach_id)
        _profile(club['identity'])
        if not _number(club['reputation'], 0, 1) or not _number(club['expected_ppg'], 0, 3):
            raise ValueError('Club expectations are required.')
        if _date(club['appointed']) > current or _date(club['contract_end']) < _date(club['appointed']):
            raise ValueError('Invalid appointment or contract dates.')


def _rng(state, boundary, identity):
    seed = json.dumps([state['career_id'], state['seed'], boundary, identity], separators=(',', ':'))
    return random.Random(int.from_bytes(hashlib.sha256(seed.encode()).digest(), 'big'))


def tactical_intent(state, club_id):
    """Return preferences only; never mistake these for applied PES instructions."""
    if state['mode'] == 'ML' and club_id == state['user_club']:
        return None
    club = state['clubs'][club_id]
    coach = state['coaches'][club['coach']]
    # Adaptable coaches retain more of the club's identity.
    coach_weight = .8 - .25 * coach['adaptability']
    return {'coach': club['coach'], 'formations': list(coach['formations']),
            'style': {key: round(coach_weight * coach['style'][key] + (1 - coach_weight) * club['identity'][key], 6)
                      for key in DIMENSIONS}, 'applied_to_game': False}


def _new_coach(state, boundary, club_id):
    while True:
        serial = state['next_generated']
        state['next_generated'] += 1
        identity = f'fictional:{serial}'
        if identity not in state['coaches']:
            break
    rng = _rng(state, boundary, identity)
    # Fictional pool; there is no claim these are real people or retired game players.
    first = ('Alex', 'Robin', 'Noah', 'Milan', 'Sam', 'Leo', 'Nico', 'Elias')
    last = ('Valmont', 'Morel', 'Silva', 'Marin', 'Costa', 'Novak', 'Vidal', 'Rossi')
    born = date(_date(boundary).year - rng.randint(32, 46), rng.randint(1, 12), rng.randint(1, 28)).isoformat()
    club = state['clubs'][club_id]
    state['coaches'][identity] = {
        'name': f'{rng.choice(first)} {rng.choice(last)} {serial + 1}', 'kind': 'fictional',
        'birth_date': born, 'retired': False, 'reputation': max(0, min(1, club['reputation'] + rng.uniform(-.2, .05))),
        'adaptability': rng.uniform(.25, .85),
        'style': {key: max(.05, min(.95, club['identity'][key] + rng.uniform(-.3, .3))) for key in DIMENSIONS},
        'formations': rng.sample(('4-3-3', '4-2-3-1', '4-4-2', '3-4-2-1', '3-5-2', '4-1-4-1'), 2),
        'origin': 'generated coach; former-player conversion not implemented',
    }
    return identity


def advance_season(state, boundary, results, *, season_start=None):
    """One explicit end-of-season event; returns a new snapshot, never mutates input.

    Results keyed by every club: {matches: int, points: int}. Policy numbers are
    prototype tuning values, not claims about real club decisions. Nationals are
    excluded from this club simulation and need their own competition adapter.
    """
    validate(state)
    current, target = _date(state['date']), _date(boundary)
    fingerprint = hashlib.sha256(json.dumps(results, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    if boundary == state['date'] and state.get('last_event'):
        if state['last_event']['results_hash'] != fingerprint:
            raise ValueError('Conflicting replay; restore the matching career snapshot first.')
        return deepcopy(state)
    full_season = 270 <= (target - current).days <= 400
    partial_first_season = False
    if season_start is not None:
        start = _date(season_start)
        partial_first_season = (not state.get('last_event') and start < current < target
                                and 270 <= (target - start).days <= 400)
        if not partial_first_season:
            raise ValueError('Invalid explicit first-season calendar.')
    if target <= current or not (full_season or partial_first_season):
        raise ValueError('One career season at a time; no wall-clock or skipped-year advancement.')
    if set(results) != set(state['clubs']):
        raise ValueError('Complete club results required; player-match statistics are insufficient.')
    for outcome in results.values():
        if outcome.get('status') == 'unavailable':
            if (outcome.get('reason') not in ('no_native_results', 'unsupported_competition_phase')
                    or 'matches' in outcome or 'points' in outcome):
                raise ValueError('Unavailable results need an explicit reason and no invented totals.')
            continue
        if outcome.get('status', 'recorded') != 'recorded':
            raise ValueError('Unknown results availability status.')
        matches, points = outcome['matches'], outcome['points']
        if type(matches) is not int or type(points) is not int or matches < 0 or not 0 <= points <= 3 * matches:
            raise ValueError('Invalid league results.')
    output = deepcopy(state)
    events = []
    for identity, coach in sorted(output['coaches'].items()):
        if coach['retired']:
            continue
        age = age_on(coach['birth_date'], boundary)
        probability = max(0, (age - POLICY['retirement_start'] + 1) * .06)
        if age >= POLICY['retirement_limit'] or _rng(state, boundary, identity).random() < probability:
            coach['retired'] = True
            events.append({'type': 'retired', 'coach': identity, 'age': age})
    vacancies = []
    for club_id, club in sorted(output['clubs'].items()):
        coach_id = club['coach']
        retired = output['coaches'][coach_id]['retired']
        record = results[club_id]
        unavailable = record.get('status') == 'unavailable'
        if unavailable:
            events.append({'type': 'performance_not_evaluated', 'club': club_id, 'reason': record['reason']})
        enough = not unavailable and record['matches'] >= POLICY['minimum_matches']
        tenure = (target - _date(club['appointed'])).days
        deficit = 0 if unavailable else club['expected_ppg'] - record['points'] / max(1, record['matches'])
        underperformed = enough and tenure >= POLICY['minimum_tenure_days'] and deficit >= POLICY['sacking_deficit_ppg']
        expired = _date(club['contract_end']) <= target
        if retired or underperformed:
            reason = 'retirement' if retired else 'underperformance'
        elif expired and _rng(state, boundary, club_id).random() < .25:
            reason = 'contract_end'
        else:
            if expired:
                club['contract_end'] = _years_after(boundary, 2)
                events.append({'type': 'renewed', 'club': club_id, 'coach': coach_id, 'until': club['contract_end']})
            continue
        club['coach'] = None
        vacancies.append((club_id, coach_id))
        events.append({'type': 'departed', 'club': club_id, 'coach': coach_id, 'reason': reason})
    # Top-reputation vacancies choose first, independent of JSON key insertion order.
    vacancies.sort(key=lambda item: (-output['clubs'][item[0]]['reputation'], item[0]))
    employed = {club['coach'] for club in output['clubs'].values() if club['coach'] is not None}
    for club_id, previous in vacancies:
        club = output['clubs'][club_id]
        candidates = [identity for identity, coach in output['coaches'].items()
                      if identity not in employed and identity != previous and not coach['retired']
                      and age_on(coach['birth_date'], boundary) >= 30]
        if not candidates:
            candidates = [_new_coach(output, boundary, club_id)]
            events.append({'type': 'generated', 'coach': candidates[0]})

        def suitability(identity):
            coach = output['coaches'][identity]
            gap = sum(abs(coach['style'][key] - club['identity'][key]) for key in DIMENSIONS) / len(DIMENSIONS)
            return (-(.65 * abs(coach['reputation'] - club['reputation']) + .35 * gap), identity)

        chosen = max(candidates, key=suitability)
        club.update(coach=chosen, appointed=boundary, contract_end=_years_after(boundary, 2))
        employed.add(chosen)
        events.append({'type': 'appointed', 'club': club_id, 'coach': chosen})
    output.update(date=boundary, last_event={'date': boundary, 'results_hash': fingerprint, 'events': events})
    validate(output)
    return output
