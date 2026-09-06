from collections import Counter
from copy import deepcopy
import struct
import unittest
from unittest.mock import patch

from test_career_format import fixture
from career_format import read_team, LayoutError
from career_application import apply_operations, plan_offsets, TEAM_SLOT_OFFSET, TEAM_COACH_OFFSET
from tactical_plans import (compile_plan, decode_plan, baseline_settings, FORMATIONS, FIELDS)
from career_application import operations_from_simulation
from test_career_coaches import fixture as simulation_fixture


def native_fixture():
    data = bytearray(fixture())
    team = read_team(data, 73)
    struct.pack_into('<I', data, team.team_offset + TEAM_SLOT_OFFSET, 73)
    struct.pack_into('<I', data, team.team_offset + TEAM_COACH_OFFSET, team.coach_id)
    for offset in plan_offsets(team):
        for relative in (140, 142, 143):
            data[offset + relative] = 5
    return bytes(data)


def operation():
    return {'team': 'Paris FC', 'expected_coach': 101358,
            'plans': [{'settings': {'build_up': 1, 'compactness': 8}, 'formation': '4-3-3'} for _ in range(4)]}


class ApplicationTests(unittest.TestCase):
    def test_independent_guard_rejects_a_compiler_writing_an_unknown_field(self):
        def damaged_compiler(plan, settings, formation):
            output = bytearray(plan)
            output[157] ^= 1
            return bytes(output)
        with patch('career_application.compile_plan', damaged_compiler):
            with self.assertRaises(AssertionError):
                apply_operations(native_fixture(), [operation()], mode='BAL', coach_catalog={})

    def test_simulated_coach_can_produce_a_native_appointment_and_formation(self):
        state = simulation_fixture()
        state['clubs'] = {'club:0': state['clubs']['club:0']}
        state['coaches']['coach:0']['name'] = 'Laurent Blanc'
        binding = {'club:0': {'team': 'Paris FC', 'expected_coach': 101358}}
        operations = operations_from_simulation(state, binding, {'coach:0': 18}, {18: 'Laurent Blanc'})
        changed, _ = apply_operations(native_fixture(), operations, mode='BAL', coach_catalog={18: 'Laurent Blanc'})
        self.assertEqual(read_team(changed, 73).coach_id, 18)
        self.assertEqual(operations[0]['plans'][0]['formation'], '4-3-3')
        state['mode'] = 'ML'
        self.assertEqual(operations_from_simulation(state, binding, {}, {}), [])
        state['mode'] = 'BAL'
        with self.assertRaises(ValueError):
            operations_from_simulation(state, binding, {}, {})

    def test_formation_preserves_goalkeeper_slots_and_unrelated_instructions(self):
        data = native_fixture()
        start = plan_offsets(read_team(data, 73))[0]
        plan = data[start:start + 160]
        for name, targets in FORMATIONS.items():
            changed = compile_plan(plan, formation=name)
            self.assertEqual(changed[99:], plan[99:])
            for phase in range(3):
                base = phase * 33
                self.assertEqual(changed[base], 0)
                self.assertEqual(changed[base + 11:base + 13], plan[base + 11:base + 13])
                self.assertEqual(Counter(changed[base + 1:base + 11]), Counter(p[0] for p in targets))
        shape = compile_plan(plan, formation='4-2-3-1')
        self.assertEqual(Counter(shape[:11]), Counter([0,1,1,2,3,4,5,6,7,8,12]))

    def test_coach_and_both_native_references_change_together(self):
        data, op = native_fixture(), operation()
        op['new_coach'] = 18
        changed, report = apply_operations(data, [op], mode='BAL', coach_catalog={18: 'Laurent Blanc'})
        team = read_team(changed, 73)
        self.assertEqual(team.coach_id, 18)
        self.assertEqual(team.coach_name, 'Laurent Blanc')
        self.assertEqual(struct.unpack_from('<I', changed, team.team_offset + TEAM_COACH_OFFSET)[0], 18)
        actual = [i for i in range(len(data)) if data[i] != changed[i]]
        self.assertEqual(report['changedOffsets'], actual)
        allowed = set(range(team.team_offset + TEAM_COACH_OFFSET, team.team_offset + TEAM_COACH_OFFSET + 4))
        allowed.update(range(team.coach_offset, team.coach_offset + 50))
        for start in plan_offsets(team):
            allowed.update(range(start, start + 99))
            allowed.update(start + offset for offset in FIELDS.values())
        self.assertTrue(set(actual).issubset(allowed))
        self.assertEqual(len(changed), len(data))

    def test_bad_batch_cannot_partially_modify_input(self):
        data = native_fixture()
        op = operation()
        invalid = deepcopy(op)
        invalid['team'] = 'Unknown'
        with self.assertRaises(LayoutError):
            apply_operations(data, [op, invalid], mode='BAL', coach_catalog={})
        self.assertEqual(data, native_fixture())

    def test_duplicate_or_unknown_coach_and_wrong_mode_are_rejected(self):
        for new_coach, catalog in [(101358, {101358: 'Already employed'}), (18, {})]:
            op = operation()
            op['new_coach'] = new_coach
            with self.assertRaises(ValueError):
                apply_operations(native_fixture(), [op], mode='BAL', coach_catalog=catalog)
        with self.assertRaises(LayoutError):
            apply_operations(native_fixture(), [operation()], mode='ML', coach_catalog={})

    def test_disagreeing_team_reference_is_rejected(self):
        data = bytearray(native_fixture())
        team = read_team(data, 73)
        for relative in (TEAM_SLOT_OFFSET, TEAM_COACH_OFFSET):
            invalid = bytearray(data)
            struct.pack_into('<I', invalid, team.team_offset + relative, 999)
            with self.assertRaises(LayoutError):
                apply_operations(invalid, [operation()], mode='BAL', coach_catalog={})

    def test_native_direct_style_is_preserved_and_possession_build_up_is_corrected(self):
        data = native_fixture()
        start = plan_offsets(read_team(data, 73))[0]
        direct = data[start:start + 160]
        self.assertEqual(baseline_settings(direct)['build_up'], 0)
        possession = compile_plan(direct, {'attacking_style': 1, 'support_range': 9})
        corrected = baseline_settings(possession)
        self.assertEqual(corrected['build_up'], 1)
        self.assertEqual(corrected['support_range'], 6)

    def test_invalid_tactical_values_and_unknown_formations_are_rejected(self):
        data = native_fixture()
        start = plan_offsets(read_team(data, 73))[0]
        plan = data[start:start + 160]
        for settings in ({'build_up': 2}, {'compactness': 0}, {'defensive_line': True}, {'made_up': 3}):
            with self.assertRaises(ValueError):
                compile_plan(plan, settings)
        with self.assertRaises(ValueError):
            compile_plan(plan, formation='0-0-10')


if __name__ == '__main__':
    unittest.main(verbosity=2)
