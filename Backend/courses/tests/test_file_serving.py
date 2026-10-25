from django.test import SimpleTestCase

from courses.file_serving import INVALID_RANGE, parse_range_header


class RangeHeaderTests(SimpleTestCase):
    size = 100

    def test_no_header(self):
        self.assertIsNone(parse_range_header("", self.size))

    def test_closed_range(self):
        self.assertEqual(parse_range_header("bytes=0-9", self.size), (0, 9))

    def test_open_ended_range(self):
        self.assertEqual(parse_range_header("bytes=10-", self.size), (10, 99))

    def test_suffix_range(self):
        self.assertEqual(parse_range_header("bytes=-10", self.size), (90, 99))

    def test_end_is_capped_to_file_size(self):
        self.assertEqual(parse_range_header("bytes=95-200", self.size), (95, 99))

    def test_start_beyond_file_size_is_invalid(self):
        self.assertIs(parse_range_header("bytes=100-", self.size), INVALID_RANGE)

    def test_reversed_range_is_invalid(self):
        self.assertIs(parse_range_header("bytes=20-10", self.size), INVALID_RANGE)

    def test_zero_suffix_is_invalid(self):
        self.assertIs(parse_range_header("bytes=-0", self.size), INVALID_RANGE)

    def test_other_unit_is_ignored(self):
        self.assertIsNone(parse_range_header("items=0-9", self.size))

    def test_multiple_ranges_are_ignored(self):
        self.assertIsNone(parse_range_header("bytes=0-1,3-4", self.size))

    def test_malformed_range_is_ignored(self):
        self.assertIsNone(parse_range_header("bytes=abc", self.size))

    def test_empty_range_is_ignored(self):
        self.assertIsNone(parse_range_header("bytes=-", self.size))
