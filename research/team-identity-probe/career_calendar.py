"""Read-only FL26 BAL date observation, corroborated by three local snapshots.

Never infer a season end from the year alone. These fixed offsets are not an ML
mapping; require both native copies and the D/M/Y save description to agree.
"""
from datetime import date
import re
import struct
from career_format import LayoutError

DATE_OFFSETS = (11322908, 11516880)


def read_career_date(data, description):
    if len(data) < max(DATE_OFFSETS) + 4 or data[:8] != struct.pack('<II', 11, 80):
        raise LayoutError('Unsupported BAL calendar layout.')
    if len(description) != 384:
        raise LayoutError('Unsupported description block.')
    try:
        copies = [date(*struct.unpack_from('<HBB', data, offset)) for offset in DATE_OFFSETS]
        line = description[128:].split(b'\0', 1)[0].decode('utf-8').strip().splitlines()[-1]
        match = re.fullmatch(r'(\d{1,2})/(\d{1,2})/(\d{4})', line)
        if not match:
            raise ValueError('Only the observed D/M/Y description is supported.')
        day, month, year = map(int, match.groups())
        described = date(year, month, day)
    except (ValueError, IndexError, UnicodeError) as error:
        raise LayoutError('Invalid or unrecognized career date.') from error
    if copies[0] != copies[1] or copies[0] != described:
        raise LayoutError('Calendar copies disagree; simulation must not advance.')
    return copies[0].isoformat()
