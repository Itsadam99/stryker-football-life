"""Synthetic fixture-schedule guards; private save files are not test fixtures."""
import hashlib
import struct
import unittest

from career_format import LayoutError
from season_schedule import (COMPETITION_ID_ANCHOR, REFERENCES_FROM_ID,
    FIRST_ROUND_FIXTURE, ROUND_STRIDE, FIXTURE_STRIDE, read_league_schedule,
    verified_league_rule)


def three_team_bye_schedule():
    data = bytearray(FIRST_ROUND_FIXTURE + 6 * ROUND_STRIDE + 512)
    struct.pack_into('<II', data, 0, 11, 80)
    struct.pack_into('<H', data, COMPETITION_ID_ANCHOR, 20)
    data[COMPETITION_ID_ANCHOR + 2:COMPETITION_ID_ANCHOR + 9] = b'Ligue 1'
    struct.pack_into('<58I', data, COMPETITION_ID_ANCHOR + REFERENCES_FROM_ID,
        *list(range(6)), *([0xffffffff] * 52))
    for slot, name in enumerate((b'Club A', b'Club B', b'Club C')):
        offset = 84 + slot * 1680
        data[offset:offset + len(name)] = name
    for rnd, (home, away) in enumerate(((0, 1), (1, 2), (2, 0), (1, 0), (2, 1), (0, 2))):
        offset = FIRST_ROUND_FIXTURE + rnd * ROUND_STRIDE
        for index in range(16):
            struct.pack_into('<4I', data, offset + index * FIXTURE_STRIDE,
                0xffffffff, 0xffffffff, 0xffffffff, 0x07f7ffff)
        struct.pack_into('<4I', data, offset, home | ((100 + home) << 14),
            away | ((100 + away) << 14), 0xffff0000 | rnd, 20 | (rnd << 16))
    return data


class NativeScheduleTests(unittest.TestCase):
    def test_counts_real_fixtures_and_byes(self):
        result = read_league_schedule(three_team_bye_schedule(), 20)
        self.assertEqual((result['roundCount'], result['fixtureCount'], result['matchesPerTeam']), (6, 6, 4))
        self.assertEqual(result['teamSlots'], [0, 1, 2])
        self.assertEqual([team['databaseTeamId'] for team in result['teams']], [100, 101, 102])
        self.assertFalse(result['seasonEndDetected'])

    def test_round_identity_must_agree(self):
        data = three_team_bye_schedule()
        struct.pack_into('<I', data, FIRST_ROUND_FIXTURE + 12, 20 | (1 << 16))
        with self.assertRaisesRegex(LayoutError, 'disagrees'):
            read_league_schedule(data, 20)

    def test_missing_second_leg_refused(self):
        data = three_team_bye_schedule()
        struct.pack_into('<I', data, COMPETITION_ID_ANCHOR + REFERENCES_FROM_ID + 5 * 4, 0xffffffff)
        with self.assertRaisesRegex(LayoutError, 'complete home-and-away'):
            read_league_schedule(data, 20)

    def test_out_of_bounds_and_repeated_reference_refused(self):
        for reference in (0xffffffff - 1, 1):
            with self.subTest(reference=reference):
                data = three_team_bye_schedule()
                struct.pack_into('<I', data, COMPETITION_ID_ANCHOR + REFERENCES_FROM_ID, reference)
                with self.assertRaises(LayoutError):
                    read_league_schedule(data, 20)

    def test_standings_binding_requires_exact_source_and_members(self):
        data = three_team_bye_schedule()
        snapshot = {'dataSha256': hashlib.sha256(data).hexdigest(),
            'competitions': {'20': {'issues': [], 'teamSlots': [0, 1, 2]}},
            'records': [{'competitionId': 20, 'matches': 2}]}
        self.assertEqual(verified_league_rule(data, snapshot, 20)['matchesPerTeam'], 4)
        snapshot['records'][0]['matches'] = 5
        with self.assertRaisesRegex(LayoutError, 'exceed'):
            verified_league_rule(data, snapshot, 20)
        snapshot['dataSha256'] = 'wrong'
        with self.assertRaisesRegex(LayoutError, 'exact same save'):
            verified_league_rule(data, snapshot, 20)

    def test_complex_phase_not_accepted(self):
        with self.assertRaisesRegex(LayoutError, 'phase'):
            read_league_schedule(three_team_bye_schedule(), 148)


if __name__ == '__main__':
    unittest.main()
