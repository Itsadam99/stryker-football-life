"""Read a verified FL26 BAL double round-robin fixture schedule; never write saves.

The field anchors below were observed in four private snapshots, not inferred
from real-world league rules. Round count differs from matches per team when
the game schedules byes (observed Ligue 2: 42 rounds, 21 teams, 40 matches).
"""
from collections import Counter
import hashlib
import struct

from career_format import LayoutError, TEAM_COUNT, read_team

COMPETITION_ID_ANCHOR = 2040080
COMPETITION_STRIDE = 788
COMPETITION_CAPACITY = 300
NAME_FROM_ID = 2
NAME_BYTES = 116
REFERENCES_FROM_ID = 136
REFERENCE_CAPACITY = 58
FIRST_ROUND_FIXTURE = 2276484
ROUND_STRIDE = 520
FIXTURE_STRIDE = 32
FIXTURES_PER_ROUND = 16
EMPTY = 0xffffffff

# These competition identities have been resolved against local regulation
# names and native results. Their schedules still must pass every check below.
SIMPLE_LEAGUE_IDS = frozenset((17, 18, 19, 20, 21, 22, 50, 79, 80, 81, 82, 116, 117, 118))


def read_league_schedule(data, competition_id):
    """Return scheduled games from actual fixture entries, with strict guards.

    This does not label the overall career season complete or decode fixture
    scores. Fixture score words remain unknown in all observed snapshots.
    """
    if type(competition_id) is not int or competition_id not in SIMPLE_LEAGUE_IDS:
        raise LayoutError('This competition/phase has no validated simple-league policy.')
    if len(data) < FIRST_ROUND_FIXTURE or struct.unpack_from('<II', data, 0) != (11, 80):
        raise LayoutError('Unsupported BAL layout.')
    candidates = [COMPETITION_ID_ANCHOR + i * COMPETITION_STRIDE
        for i in range(COMPETITION_CAPACITY)
        if struct.unpack_from('<H', data, COMPETITION_ID_ANCHOR + i * COMPETITION_STRIDE)[0] == competition_id]
    if len(candidates) != 1:
        raise LayoutError('Missing or duplicate native competition identity.')
    anchor = candidates[0]
    name_bytes = data[anchor + NAME_FROM_ID:anchor + NAME_FROM_ID + NAME_BYTES]
    if b'\0' not in name_bytes:
        raise LayoutError('Unterminated competition name.')
    try:
        name = name_bytes.split(b'\0', 1)[0].decode('utf-8')
    except UnicodeDecodeError as exc:
        raise LayoutError('Invalid competition name.') from exc
    if not name:
        raise LayoutError('Unnamed native competition.')
    references = struct.unpack_from('<58I', data, anchor + REFERENCES_FROM_ID)
    used = [value for value in references if value != EMPTY]
    if (not used or tuple(used) != references[:len(used)] or len(used) != len(set(used))):
        raise LayoutError('No complete, unambiguous round-reference sequence.')
    teams, appearances, pairs, fixtures = {}, Counter(), Counter(), []
    fixture_ids = set()
    fingerprint = hashlib.sha256()
    fingerprint.update(struct.pack('<H', competition_id))
    for round_index, reference in enumerate(used):
        start = FIRST_ROUND_FIXTURE + reference * ROUND_STRIDE
        if start + FIXTURES_PER_ROUND * FIXTURE_STRIDE > len(data):
            raise LayoutError('Round reference points outside the save.')
        playing = set()
        for position in range(FIXTURES_PER_ROUND):
            offset = start + position * FIXTURE_STRIDE
            home, away, identity_word, flags = struct.unpack_from('<4I', data, offset)
            if home == away == EMPTY:
                continue
            home_slot, away_slot = home & 0x3fff, away & 0x3fff
            if home_slot == away_slot or max(home_slot, away_slot) >= TEAM_COUNT:
                raise LayoutError('Invalid scheduled teams.')
            if home_slot in playing or away_slot in playing:
                raise LayoutError('Team appears twice in the same scheduled round.')
            if (flags & 0xffff != competition_id or (flags >> 16) & 0x3f != round_index
                    or (flags >> 22) & 0xf != position):
                raise LayoutError('Fixture identity disagrees with its competition/round/position.')
            fixture_id = identity_word & 0xffff
            if fixture_id == 0xffff or fixture_id in fixture_ids:
                raise LayoutError('Invalid or duplicate scheduled fixture identity.')
            fixture_ids.add(fixture_id)
            for slot, packed in ((home_slot, home), (away_slot, away)):
                row = read_team(data, slot)
                if not row.name:
                    raise LayoutError('Scheduled team has no native team identity.')
                identity = {'team': row.name, 'teamSlot': slot, 'databaseTeamId': packed >> 14}
                if slot in teams and identity != teams[slot]:
                    raise LayoutError('Scheduled team identity changes within a competition.')
                teams[slot] = identity
            playing.update((home_slot, away_slot))
            appearances.update((home_slot, away_slot))
            pairs[home_slot, away_slot] += 1
            fingerprint.update(data[offset:offset + 16])
            fixtures.append({'roundReference': reference, 'roundIndex': round_index,
                'fixtureId': fixture_id, 'homeSlot': home_slot, 'awaySlot': away_slot, 'offset': offset})
        if not playing:
            raise LayoutError('A referenced round contains no scheduled fixture.')
    if len(teams) < 2 or any(pairs[home, away] != 1 for home in teams for away in teams if home != away):
        raise LayoutError('Schedule is not a complete home-and-away league; separate phase policy required.')
    counts = set(appearances.values())
    if len(counts) != 1:
        raise LayoutError('Unbalanced scheduled appearances.')
    return {'format': 'FL26-BAL-observed-double-round-robin-v1', 'competitionId': competition_id,
        'name': name, 'roundCount': len(used), 'roundReferences': used, 'fixtureCount': len(fixtures),
        'teamSlots': sorted(teams), 'teams': [teams[slot] for slot in sorted(teams)],
        'matchesPerTeam': counts.pop(), 'scheduleSha256': fingerprint.hexdigest(),
        'fixtures': fixtures, 'seasonEndDetected': False}


def verified_league_rule(data, snapshot, competition_id):
    """Bind a real planned schedule to current coherent native standings."""
    schedule = read_league_schedule(data, competition_id)
    if snapshot.get('dataSha256') != hashlib.sha256(data).hexdigest():
        raise LayoutError('Schedule and standings must come from the exact same save.')
    group = snapshot.get('competitions', {}).get(str(competition_id))
    if not group or group['issues'] or group['teamSlots'] != schedule['teamSlots']:
        raise LayoutError('Scheduled membership and current standings do not agree.')
    for row in snapshot['records']:
        if row['competitionId'] == competition_id and row['matches'] > schedule['matchesPerTeam']:
            raise LayoutError('Current played matches exceed the verified schedule.')
    return {'teamSlots': schedule['teamSlots'], 'matchesPerTeam': schedule['matchesPerTeam'],
        'scheduleSha256': schedule['scheduleSha256'], 'sourceDataSha256': snapshot['dataSha256'],
        'evidence': 'native planned fixtures; each ordered opponent pair occurs exactly once'}
