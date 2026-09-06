from pathlib import Path
import struct
import unittest
from career_format import (HEADER_SIZE, TEAM_SIZE, COACH_TABLE, COACH_SIZE,
    MINIMUM_SIZE, TEAM_TACTIC_OFFSET, COACH_TACTIC_OFFSET, PRESET_SIZE,
    BUILD_UP_OFFSET, LayoutError, patch_build_up, read_team)


def fixture():
    data = bytearray(MINIMUM_SIZE + 1000)
    index = 73
    team = HEADER_SIZE + index * TEAM_SIZE
    coach = COACH_TABLE + index * COACH_SIZE
    data[team:team + 8] = b'Paris FC'
    struct.pack_into('<I', data, coach, 101358)
    data[coach + 4:coach + 8] = b'Test'
    for start in [team + TEAM_TACTIC_OFFSET] + [coach + COACH_TACTIC_OFFSET + p * PRESET_SIZE for p in range(3)]:
        for phase in range(3):
            data[start + phase * 33:start + phase * 33 + 11] = bytes([0,1,1,2,3,4,5,5,8,9,12])
            data[start + phase * 33 + 11:start + phase * 33 + 33] = bytes([52] * 22)
    return bytes(data)


class CareerTests(unittest.TestCase):
    def test_only_four_instruction_bytes_change_and_patch_is_idempotent(self):
        original = fixture()
        result, report = patch_build_up(original, expected_name='Paris FC', expected_coach_id=101358, short_pass=True)
        actual = [i for i in range(len(original)) if original[i] != result[i]]
        self.assertEqual(actual, sorted(report['allowedOffsets']))
        self.assertEqual(len(actual), 4)
        repeated, again = patch_build_up(result, expected_name='Paris FC', expected_coach_id=101358, short_pass=True)
        self.assertEqual(result, repeated)
        self.assertEqual(again['changedBytes'], [])
        restored, _ = patch_build_up(result, expected_name='Paris FC', expected_coach_id=101358, short_pass=False)
        self.assertEqual(restored, original)

    def test_wrong_club_or_coach_is_rejected(self):
        for club, coach in [('Paris Saint-Germain',101358),('Paris FC',123)]:
            with self.assertRaises(LayoutError):
                patch_build_up(fixture(), expected_name=club, expected_coach_id=coach, short_pass=True)

    def test_duplicate_name_is_rejected(self):
        data = bytearray(fixture())
        data[HEADER_SIZE:HEADER_SIZE + 8] = b'Paris FC'
        with self.assertRaises(LayoutError):
            patch_build_up(data, expected_name='Paris FC', expected_coach_id=101358, short_pass=True)

    def test_damaged_plan_does_not_produce_output(self):
        original = fixture()
        view = read_team(original,73)
        for relative in [0,11,100]:
            data = bytearray(original)
            data[view.team_offset + TEAM_TACTIC_OFFSET + relative] = 255
            with self.assertRaises(LayoutError):
                patch_build_up(data, expected_name='Paris FC', expected_coach_id=101358, short_pass=True)

    def test_truncated_or_unknown_layout_is_rejected(self):
        with self.assertRaises(LayoutError):
            patch_build_up(fixture()[:1000], expected_name='Paris FC', expected_coach_id=101358, short_pass=True)


if __name__ == '__main__':
    unittest.main(verbosity=2)
