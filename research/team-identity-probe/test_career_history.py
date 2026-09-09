from copy import deepcopy
import tempfile
import unittest

from career_history import CareerHistory
from career_results import read_results
from test_career_results import fixture as results_fixture
from test_career_coaches import fixture as coaching_fixture


class HistoryTests(unittest.TestCase):
    def test_checkpoint_restores_exact_state_and_repeated_store_is_idempotent(self):
        with tempfile.TemporaryDirectory() as folder:
            history = CareerHistory(folder, 'test-career')
            results, state = read_results(*results_fixture()), coaching_fixture()
            checkpoint = history.store(results, coaching_state=state)
            self.assertEqual(history.store(results, coaching_state=state), checkpoint)
            self.assertEqual(history.load(checkpoint)['coachingState'], state)
            state['next_generated'] = 1234
            self.assertEqual(history.load(checkpoint)['coachingState']['next_generated'], 0)
            self.assertEqual(len(list(history.directory.iterdir())), 1)

    def test_rollback_branch_preserves_previous_future(self):
        with tempfile.TemporaryDirectory() as folder:
            history = CareerHistory(folder, 'test-career')
            results, state = read_results(*results_fixture()), coaching_fixture()
            root = history.store(results, coaching_state=state)
            branch_a, branch_b = deepcopy(state), deepcopy(state)
            branch_a['seed'], branch_b['seed'] = 4, 5
            a = history.store(results, coaching_state=branch_a, parent=root)
            b = history.store(results, coaching_state=branch_b, parent=root)
            self.assertNotEqual(a, b)
            self.assertEqual(history.load(a)['parent'], root)
            self.assertEqual(history.load(b)['parent'], root)
            self.assertEqual(history.load(root)['coachingState'], state)

    def test_other_career_and_altered_checkpoint_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            history = CareerHistory(folder, 'test-career')
            results, state = read_results(*results_fixture()), coaching_fixture()
            other = CareerHistory(folder, 'another-career')
            with self.assertRaises(ValueError):
                other.store(results, coaching_state=state)
            checkpoint = history.store(results, coaching_state=state)
            with self.assertRaises(FileNotFoundError):
                other.load(checkpoint)
            path = history.directory / (checkpoint + '.json')
            path.write_bytes(path.read_bytes() + b' ')
            with self.assertRaises(ValueError):
                history.load(checkpoint)

    def test_future_parent_cannot_be_used_as_an_implicit_rollback(self):
        with tempfile.TemporaryDirectory() as folder:
            history = CareerHistory(folder, 'test-career')
            results = read_results(*results_fixture())
            future = history.store(results)
            older = deepcopy(results)
            older['careerDate'] = '2025-10-24'
            with self.assertRaises(ValueError):
                history.store(older, parent=future)


if __name__ == '__main__':
    unittest.main(verbosity=2)
