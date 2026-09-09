"""PES 2021 preset compiler. Offsets describe a 160-byte plan, never Tactics.bin.

Format source: https://implyingrigged.info/wiki/Pro_Evolution_Soccer_2021/Edit_file
Only build-up has a controlled FL26 menu validation so far. Other fields and
formation changes remain experimental on FL26; preserve every unrelated byte.
"""
from functools import lru_cache
from career_format import PRESET_SIZE, LayoutError, _validate_preset

FIELDS = {'attacking_style': 99, 'build_up': 100, 'attacking_area': 101,
          'positioning': 102, 'defensive_style': 103, 'containment_area': 104,
          'pressuring': 105, 'support_range': 140, 'defensive_line': 142, 'compactness': 143}

# Original geometry, in PES's observed vertical/horizontal coordinate system.
# Goalkeeper slot stays fixed. Field-player slots are assigned by current roles.
FORMATIONS = {
    '4-3-3': [(1,11,38),(1,11,66),(2,16,13),(3,16,91),(4,23,52),
              (5,31,33),(5,31,71),(9,41,16),(10,41,88),(12,44,52)],
    '4-2-3-1': [(1,11,38),(1,11,66),(2,16,13),(3,16,91),(4,24,36),
                (5,24,68),(8,35,52),(6,34,16),(7,34,88),(12,45,52)],
    '4-4-2': [(1,11,38),(1,11,66),(2,16,13),(3,16,91),(5,26,37),
              (5,26,67),(6,30,15),(7,30,89),(12,43,37),(12,43,67)],
    '3-4-2-1': [(1,12,26),(1,10,52),(1,12,78),(6,26,11),(7,26,93),
                (4,24,37),(5,26,67),(8,36,33),(8,36,71),(12,45,52)],
    '3-5-2': [(1,12,26),(1,10,52),(1,12,78),(6,27,11),(7,27,93),
              (4,23,52),(5,30,34),(5,30,70),(12,43,37),(12,43,67)],
    '4-1-4-1': [(1,11,38),(1,11,66),(2,16,13),(3,16,91),(4,23,52),
                (5,31,34),(5,31,70),(6,32,14),(7,32,90),(12,45,52)],
}


def decode_plan(plan):
    if len(plan) != PRESET_SIZE:
        raise LayoutError('A plan must contain exactly 160 bytes.')
    _validate_preset(plan, 0)
    settings = {name: plan[offset] for name, offset in FIELDS.items()}
    if any(not 1 <= settings[name] <= 10 for name in ('support_range','defensive_line','compactness')):
        raise LayoutError('Unsupported tactical sliders.')
    return settings


def _group(role):
    return 0 if role == 0 else 1 if role <= 3 else 2 if role <= 8 else 3


def _assign(roles, coordinates, targets):
    """Minimum role/position mismatch; never changes roster or lineup indices."""
    @lru_cache(None)
    def solve(slot, used):
        if slot == 10:
            return 0, ()
        choices = []
        for index, (role, y, x) in enumerate(targets):
            if used & (1 << index):
                continue
            previous = roles[slot + 1]
            cost = (0 if previous == role else 100 if _group(previous) == _group(role) else 1000)
            cost += abs(coordinates[2 * (slot + 1) + 1] - x)
            rest, assignment = solve(slot + 1, used | (1 << index))
            choices.append((cost + rest, (index,) + assignment))
        return min(choices)
    return solve(0, 0)[1]


def compile_plan(plan, settings=None, formation=None):
    decoded = decode_plan(plan)
    changes = settings or {}
    if set(changes) - set(FIELDS):
        raise ValueError('Unknown tactical setting.')
    for name, value in changes.items():
        if type(value) is not int or not (1 <= value <= 10 if FIELDS[name] >= 140 else value in (0, 1)):
            raise ValueError(f'Invalid setting: {name}')
    output = bytearray(plan)
    for name, value in changes.items():
        output[FIELDS[name]] = value
    if formation is not None:
        if formation not in FORMATIONS:
            raise ValueError('Unsupported formation.')
        targets = FORMATIONS[formation]
        assignment = _assign(plan[:11], plan[11:33], targets)
        for phase in range(3):
            start = phase * 33
            for slot, target in enumerate(assignment, 1):
                role, y, x = targets[target]
                # Same player slot across all phases; retain the plan's fluid flag.
                if phase == 1:
                    y += 3 if role >= 2 else 1
                elif phase == 2:
                    y -= 3 if role >= 2 else 1
                output[start + slot] = role
                output[start + 11 + slot * 2:start + 13 + slot * 2] = bytes((y, x))
    decode_plan(output)
    return bytes(output)


def from_coach_intent(intent):
    style = intent['style']
    slider = lambda value: max(1, min(10, round(1 + value * 9)))
    return {
        'attacking_style': int(style['transition'] < .5),
        'build_up': int(style['short_build_up'] >= .5),
        'attacking_area': int(style['width'] < .5),
        'defensive_style': int(style['pressing'] < .6),
        'pressuring': int(style['pressing'] < .5),
        'support_range': slider(1 - style['support']),
        'defensive_line': slider(style['line_height']),
        'compactness': slider(style['compactness']),
    }


def family(settings):
    if settings['attacking_style'] == 1 and settings['build_up'] == 1:
        return 'possession'
    if settings['defensive_style'] == 1 and settings['compactness'] >= 7:
        return 'compact_transitions'
    if settings['build_up'] == 0:
        return 'structured_direct'
    if settings['defensive_style'] == 0 and settings['pressuring'] == 0:
        return 'high_press'
    return 'short_transitions'


def baseline_settings(plan):
    """Keep native identity; repair possession plans that request long build-up.

    Do not turn all direct-play teams into possession teams. This rule is a mod
    design choice; it does not claim these instructions are a corrupt game file.
    """
    settings = decode_plan(plan)
    if settings['attacking_style'] == 1 and settings['build_up'] == 0:
        settings.update(build_up=1, support_range=min(6, settings['support_range']))
    return settings
