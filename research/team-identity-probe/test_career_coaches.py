from copy import deepcopy
import json
import unittest

from career_coaches import (DIMENSIONS, POLICY, advance_season, age_on, tactical_intent, validate)


def fixture(mode='BAL'):
    state = {'version': 1, 'career_id': 'test-career', 'mode': mode, 'user_club': 'club:0',
             'date': '2025-07-01', 'seed': 7319, 'next_generated': 0, 'clubs': {}, 'coaches': {}}
    for i in range(4):
        state['coaches'][f'coach:{i}'] = {
            'name': f'Fictional Coach {i}', 'kind': 'fictional', 'birth_date': '1966-01-01',
            'retired': False, 'reputation': .2 + i * .2, 'adaptability': .5,
            'style': {key: .2 + i * .15 for key in DIMENSIONS}, 'formations': ['4-3-3', '4-2-3-1'],
        }
    for i in range(3):
        state['clubs'][f'club:{i}'] = {
            'kind': 'club', 'coach': f'coach:{i}', 'reputation': .3 + .25 * i, 'expected_ppg': 1.6,
            'identity': {key: .3 + i * .2 for key in DIMENSIONS},
            'appointed': '2025-07-01', 'contract_end': '2027-07-01',
        }
    return state


def results(state, points=61, matches=38):
    return {club: {'matches': matches, 'points': points} for club in state['clubs']}


class CoachingTests(unittest.TestCase):
    def test_installing_midseason_requires_an_explicit_season_calendar(self):
        state = fixture()
        state['date'] = '2025-10-24'
        with self.assertRaises(ValueError):
            advance_season(state, '2026-07-01', results(state))
        output = advance_season(state, '2026-07-01', results(state), season_start='2025-07-01')
        self.assertEqual(output['date'], '2026-07-01')
        with self.assertRaises(ValueError):
            advance_season(state, '2026-07-01', results(state), season_start='2023-07-01')

    def test_full_sized_fictional_population_survives_25_seasons(self):
        state = fixture()
        template_coach = deepcopy(state['coaches']['coach:0'])
        template_club = deepcopy(state['clubs']['club:0'])
        state['coaches'], state['clubs'] = {}, {}
        for i in range(980):
            coach = deepcopy(template_coach)
            coach.update(name=f'Fictional Coach {i}', birth_date=f'{1954 + i % 37}-01-01',
                         reputation=(i % 101) / 100)
            state['coaches'][f'coach:{i}'] = coach
        for i in range(749):
            club = deepcopy(template_club)
            club.update(coach=f'coach:{i}', reputation=(i % 101) / 100)
            state['clubs'][f'club:{i}'] = club
        for year in range(2026, 2051):
            state = advance_season(state, f'{year}-07-01', results(state))
            self.assertEqual(len(state['clubs']), 749)
            assigned = {club['coach'] for club in state['clubs'].values()}
            self.assertEqual(len(assigned), 749)
            self.assertTrue(all(not state['coaches'][identity]['retired'] for identity in assigned))
        self.assertGreater(state['next_generated'], 0)

    def test_25_seasons_keep_ages_assignments_and_generated_identities_coherent(self):
        state = fixture()
        events = []
        for year in range(2026, 2051):
            state = advance_season(state, f'{year}-07-01', results(state))
            validate(state)
            active = [coach for coach in state['coaches'].values() if not coach['retired']]
            self.assertTrue(all(age_on(c['birth_date'], state['date']) < POLICY['retirement_limit'] for c in active))
            employed = [club['coach'] for club in state['clubs'].values()]
            self.assertEqual(len(employed), len(set(employed)))
            events.extend(state['last_event']['events'])
            state = json.loads(json.dumps(state))
        self.assertGreater(state['next_generated'], 0)
        self.assertTrue(any(event['type'] == 'generated' for event in events))
        self.assertTrue(all(state['coaches'][f'coach:{i}']['retired'] for i in range(4)))
        self.assertEqual(state['date'], '2050-07-01')

    def test_replay_and_restored_snapshot_are_deterministic_without_mutating_input(self):
        original = fixture()
        preserved = deepcopy(original)
        first = advance_season(original, '2026-07-01', results(original, points=15))
        self.assertEqual(original, preserved)
        self.assertEqual(first, advance_season(first, '2026-07-01', results(first, points=15)))
        # Restoring the original game snapshot restores the same simulated future.
        self.assertEqual(first, advance_season(deepcopy(preserved), '2026-07-01', results(preserved, points=15)))
        with self.assertRaises(ValueError):
            advance_season(first, '2026-07-01', results(first, points=60))

    def test_club_order_does_not_change_the_transfer_market(self):
        state = fixture()
        alternate = deepcopy(state)
        alternate['clubs'] = dict(reversed(list(state['clubs'].items())))
        alternate['coaches'] = dict(reversed(list(state['coaches'].items())))
        self.assertEqual(advance_season(state, '2026-07-01', results(state, points=15)),
                         advance_season(alternate, '2026-07-01', results(alternate, points=15)))

    def test_one_defeat_does_not_sack_but_a_poor_season_can(self):
        state = fixture()
        for coach in state['coaches'].values():
            coach['birth_date'] = '1980-01-01'
        one = advance_season(state, '2026-07-01', results(state, points=0, matches=1))
        self.assertFalse(any(e['type'] == 'departed' for e in one['last_event']['events']))
        season = advance_season(state, '2026-07-01', results(state, points=15))
        self.assertEqual(sum(e.get('reason') == 'underperformance' for e in season['last_event']['events']), 3)

    def test_retirement_overrides_a_long_contract(self):
        state = fixture()
        state['coaches']['coach:0']['birth_date'] = '1954-01-01'
        state['clubs']['club:0']['contract_end'] = '2040-07-01'
        output = advance_season(state, '2026-07-01', results(state))
        self.assertTrue(output['coaches']['coach:0']['retired'])
        self.assertNotEqual(output['clubs']['club:0']['coach'], 'coach:0')

    def test_expired_contracts_are_renewed_or_replaced(self):
        state = fixture()
        for club in state['clubs'].values():
            club['contract_end'] = '2026-07-01'
        output = advance_season(state, '2026-07-01', results(state))
        self.assertTrue(all(c['contract_end'] > output['date'] for c in output['clubs'].values()))

    def test_master_league_player_tactics_are_protected(self):
        ml, bal = fixture('ML'), fixture('BAL')
        self.assertIsNone(tactical_intent(ml, 'club:0'))
        self.assertIsNotNone(tactical_intent(ml, 'club:1'))
        self.assertIsNotNone(tactical_intent(bal, 'club:0'))

    def test_new_coach_changes_preferences_without_erasing_club_identity(self):
        state = fixture()
        before = tactical_intent(state, 'club:0')
        state['clubs']['club:0']['coach'] = 'coach:3'
        after = tactical_intent(state, 'club:0')
        self.assertNotEqual(before['style'], after['style'])
        self.assertNotEqual(after['style'], state['coaches']['coach:3']['style'])
        self.assertFalse(after['applied_to_game'])

    def test_missing_results_unknown_age_and_nationals_cannot_be_silently_simulated(self):
        state = fixture()
        with self.assertRaises(ValueError):
            advance_season(state, '2026-07-01', {'club:0': {'matches': 38, 'points': 61}})
        for mutation in ('unknown_birth', 'national', 'duplicate_coach'):
            bad = fixture()
            if mutation == 'unknown_birth':
                bad['coaches']['coach:0'].update(kind='real', biography_source='')
            elif mutation == 'national':
                bad['clubs']['club:0']['kind'] = 'national'
            else:
                bad['clubs']['club:1']['coach'] = 'coach:0'
            with self.assertRaises(ValueError):
                advance_season(bad, '2026-07-01', results(bad))

    def test_invalid_or_skipped_calendar_does_not_advance_the_simulation(self):
        state = fixture()
        for boundary in ('2024-07-01', '2025-08-01', '2028-07-01'):
            with self.assertRaises(ValueError):
                advance_season(state, boundary, results(state))


if __name__ == '__main__':
    unittest.main(verbosity=2)
