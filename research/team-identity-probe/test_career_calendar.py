import struct
import unittest
from career_calendar import DATE_OFFSETS, read_career_date
from career_format import LayoutError


def fixture():
    data = bytearray(max(DATE_OFFSETS) + 4)
    struct.pack_into('<II', data, 0, 11, 80)
    for offset in DATE_OFFSETS:
        struct.pack_into('<HBB', data, offset, 2025, 10, 24)
    description = bytes(128) + b'Fictional Player\nTest Club\n24/10/2025'.ljust(256, b'\0')
    return data, description


class CalendarTests(unittest.TestCase):
    def test_date_comes_from_matching_game_fields_and_description(self):
        data, description = fixture()
        self.assertEqual(read_career_date(data, description), '2025-10-24')

    def test_disagreement_and_wrong_description_stop_simulation(self):
        data, description = fixture()
        struct.pack_into('<HBB', data, DATE_OFFSETS[0], 2026, 10, 24)
        with self.assertRaises(LayoutError):
            read_career_date(data, description)
        data, description = fixture()
        with self.assertRaises(LayoutError):
            read_career_date(data, description.replace(b'24/10/2025', b'25/10/2025'))

    def test_impossible_date_or_truncated_layout_is_rejected(self):
        data, description = fixture()
        for offset in DATE_OFFSETS:
            struct.pack_into('<HBB', data, offset, 2025, 2, 30)
        with self.assertRaises(LayoutError):
            read_career_date(data, description)
        with self.assertRaises(LayoutError):
            read_career_date(data[:100], description)


if __name__ == '__main__':
    unittest.main(verbosity=2)
