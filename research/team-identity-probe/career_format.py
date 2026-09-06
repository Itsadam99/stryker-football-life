"""Experimental FL26 BAL adapter, mapped on file version 26.2.0.3.

This adapter edits a byte copy of decoded data only. It never opens a live save,
never guesses ML offsets, and never changes roster/contract/date bytes.
"""
from dataclasses import dataclass
import hashlib
import struct

HEADER_SIZE = 84
TEAM_COUNT = 750
TEAM_SIZE = 1680
COACH_SIZE = 600
COACH_TABLE = HEADER_SIZE + TEAM_COUNT * TEAM_SIZE
MINIMUM_SIZE = COACH_TABLE + TEAM_COUNT * COACH_SIZE
TEAM_TACTIC_OFFSET = 1116
COACH_TACTIC_OFFSET = 60
PRESET_SIZE = 160
BUILD_UP_OFFSET = 100
LAYOUT = 'FL26-26.2.0.3-BAL-750-experimental'


class LayoutError(ValueError):
    pass


def _text(data, offset, width):
    field = data[offset:offset + width]
    if len(field) != width or b'\0' not in field:
        raise LayoutError('Champ texte incomplet ou incompatible.')
    try:
        return field.split(b'\0', 1)[0].decode('utf-8')
    except UnicodeError as exc:
        raise LayoutError('Texte incompatible avec le format BAL observé.') from exc


@dataclass(frozen=True)
class TeamView:
    index: int
    name: str
    coach_id: int
    coach_name: str
    team_offset: int
    coach_offset: int

    @property
    def build_up_offsets(self):
        return [self.team_offset + TEAM_TACTIC_OFFSET + BUILD_UP_OFFSET] + [
            self.coach_offset + COACH_TACTIC_OFFSET + preset * PRESET_SIZE + BUILD_UP_OFFSET
            for preset in range(3)
        ]


def read_team(data, index):
    if len(data) < MINIMUM_SIZE or type(index) is not int or not 0 <= index < TEAM_COUNT:
        raise LayoutError('Dimensions ou indice hors du format BAL observé.')
    team = HEADER_SIZE + index * TEAM_SIZE
    coach = COACH_TABLE + index * COACH_SIZE
    return TeamView(index, _text(data, team, 70), struct.unpack_from('<I', data, coach)[0],
                    _text(data, coach + 4, 46), team, coach)


def find_team(data, expected_name, expected_coach_id):
    if not expected_name or type(expected_coach_id) is not int or expected_coach_id < 0:
        raise LayoutError('Identité attendue obligatoire.')
    matches = [view for index in range(TEAM_COUNT)
               if (view := read_team(data, index)).name == expected_name]
    if len(matches) != 1:
        raise LayoutError('Équipe absente ou ambiguë : aucune modification.')
    team = matches[0]
    if team.coach_id != expected_coach_id:
        raise LayoutError('Le coach a changé ou le format diffère : aucune modification.')
    return team


def _validate_preset(data, offset):
    preset = data[offset:offset + PRESET_SIZE]
    if len(preset) != PRESET_SIZE:
        raise LayoutError('Plan tactique incomplet.')
    # Three observed formation phases, each holding eleven roles then coordinates.
    for phase in range(3):
        formation = preset[phase * 33:(phase + 1) * 33]
        if formation[0] != 0 or any(role > 12 for role in formation[:11]):
            raise LayoutError('Rôles de la formation incompatibles.')
        if any(value > 127 for value in formation[11:]):
            raise LayoutError('Coordonnées de la formation incompatibles.')
    if any(value not in (0, 1) for value in preset[99:106]):
        raise LayoutError('Consignes binaires incompatibles.')


def patch_build_up(data, *, expected_name, expected_coach_id, short_pass):
    if type(short_pass) is not bool:
        raise ValueError('short_pass doit être un booléen explicite.')
    team = find_team(data, expected_name, expected_coach_id)
    plans = [team.team_offset + TEAM_TACTIC_OFFSET] + [
        team.coach_offset + COACH_TACTIC_OFFSET + n * PRESET_SIZE for n in range(3)
    ]
    for offset in plans:
        _validate_preset(data, offset)
    result = bytearray(data)
    changes = []
    for offset in team.build_up_offsets:
        before = result[offset]
        result[offset] = int(short_pass)
        if before != result[offset]:
            changes.append({'offset':offset, 'before':before, 'after':result[offset]})
    return bytes(result), {
        'layout':LAYOUT, 'team':team.name, 'teamIndex':team.index,
        'coachId':team.coach_id, 'coachName':team.coach_name,
        'setting':'short_pass' if short_pass else 'long_pass',
        'changedBytes':changes, 'allowedOffsets':team.build_up_offsets,
        'beforeSha256':hashlib.sha256(data).hexdigest(),
        'afterSha256':hashlib.sha256(result).hexdigest(),
        'status':'four candidate instruction locations patched; game reload still required for validation',
    }
