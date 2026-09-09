from copy import deepcopy
import struct
import unittest

from career_format import HEADER_SIZE, TEAM_SIZE, COACH_TABLE, COACH_SIZE, LayoutError
from career_calendar import DATE_OFFSETS
from career_results import read_results, results_for_clubs, require_completed_leagues, RESULTS_OFFSET
from career_cycle import advance_from_save
from test_career_coaches import fixture as coach_fixture


def fixture():
    data = bytearray(max(DATE_OFFSETS) + 4)
    struct.pack_into('<II', data, 0, 11, 80)
    for offset in DATE_OFFSETS:
        struct.pack_into('<HBB', data, offset, 2026, 7, 1)
    for slot, name in [(73, b'Paris FC'), (74, b'Test Club')]:
        team, coach = HEADER_SIZE + slot * TEAM_SIZE, COACH_TABLE + slot * COACH_SIZE
        data[team:team + len(name)] = name
        struct.pack_into('<I', data, coach, 100000 + slot)
        struct.pack_into('<II', data, team + 648, slot, 100000 + slot)
        for entry in range(15):
            struct.pack_into('<H', data, team + RESULTS_OFFSET + entry * 20, 65535)
        struct.pack_into('<H6B3I', data, team + RESULTS_OFFSET, 20, 8, 6, 2, 2, 2, 1, 8, 8, 3)
    description = bytes(128) + b'Test Player\nTest League\n1/7/2026'.ljust(256, b'\0')
    return data, description


def bindings():
    return {'club:0': {'team': 'Paris FC', 'teamSlot': 73, 'competitionId': 20},
            'club:1': {'team': 'Test Club', 'teamSlot': 74, 'competitionId': 20}}


class ResultsTests(unittest.TestCase):
    def test_known_user_counts_are_decoded_without_modifying_the_save(self):
        data, description = fixture()
        original = bytes(data)
        report = read_results(data, description)
        self.assertEqual(results_for_clubs(report, bindings()),
                         {'club:0': {'matches': 6, 'points': 8}, 'club:1': {'matches': 6, 'points': 8}})
        self.assertEqual(report['competitions']['20']['totals']['wins'], 4)
        self.assertEqual(data, original)
        self.assertFalse(report['seasonEndDetected'])

    def test_carried_points_are_flagged_without_blocking_other_competitions(self):
        data, description = fixture()
        for slot in (73, 74):
            at = HEADER_SIZE + slot * TEAM_SIZE + RESULTS_OFFSET + 20
            struct.pack_into('<H6B3I', data, at, 148, 40, 0, 0, 0, 0, 0, 0, 0, 0)
        report = read_results(data, description)
        self.assertEqual(results_for_clubs(report, bindings())['club:0']['points'], 8)
        alternative = bindings()
        alternative['club:0']['competitionId'] = 148
        with self.assertRaises(ValueError):
            results_for_clubs(report, alternative)
        self.assertIn('nonstandard_points_or_carry_over', report['competitions']['148']['issues'])

    def test_ambiguous_or_inconsistent_table_is_not_used(self):
        data, description = fixture()
        base = HEADER_SIZE + 73 * TEAM_SIZE + RESULTS_OFFSET
        data[base + 3] = 7
        report = read_results(data, description)
        with self.assertRaises(ValueError):
            results_for_clubs(report, bindings())
        data, description = fixture()
        struct.pack_into('<H', data, base + 20, 20)
        with self.assertRaises(LayoutError):
            read_results(data, description)

    def test_wrong_club_or_duplicate_binding_is_rejected(self):
        report = read_results(*fixture())
        wrong = bindings()
        wrong['club:0']['team'] = 'Other Club'
        with self.assertRaises(ValueError):
            results_for_clubs(report, wrong)
        duplicate = bindings()
        duplicate['club:1'] = duplicate['club:0']
        with self.assertRaises(ValueError):
            results_for_clubs(report, duplicate)

    def test_date_and_balanced_partial_table_do_not_end_the_season(self):
        report = read_results(*fixture())
        with self.assertRaises(ValueError):
            require_completed_leagues(report, {20: {'teamSlots': [73, 74], 'matchesPerTeam': 34}})
        with self.assertRaises(ValueError):
            require_completed_leagues(report, {20: {'teamSlots': [73], 'matchesPerTeam': 6}})
        require_completed_leagues(report, {20: {'teamSlots': [73, 74], 'matchesPerTeam': 6}})

    def test_native_results_feed_a_guarded_simulation_only_after_schedule_completion(self):
        data, description = fixture()
        state = coach_fixture()
        del state['clubs']['club:2']
        original = deepcopy(state)
        incomplete = {20: {'teamSlots': [73, 74], 'matchesPerTeam': 34}}
        with self.assertRaises(ValueError):
            advance_from_save(data, description, state, bindings(), incomplete)
        self.assertEqual(state, original)
        # Six-match synthetic competition, explicitly declared by this fixture.
        rules = {20: {'teamSlots': [73, 74], 'matchesPerTeam': 6}}
        updated, audit = advance_from_save(data, description, state, bindings(), rules)
        self.assertEqual(updated['date'], '2026-07-01')
        self.assertEqual(audit['clubCount'], 2)
        repeated, _ = advance_from_save(data, description, updated, bindings(), rules)
        self.assertEqual(updated, repeated)
        self.assertEqual(state, original)


if __name__ == '__main__':
    unittest.main(verbosity=2)
