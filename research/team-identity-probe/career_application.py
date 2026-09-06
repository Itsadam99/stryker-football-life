"""Apply explicit tactical/coach operations to a BAL byte copy with a byte audit.

This is an offline adapter. It never advances a season, infers a firing or writes
a live file. ML is refused until its separate layout has been mapped.
"""
import hashlib
import struct
from career_format import (find_team, read_team, TEAM_COUNT, TEAM_TACTIC_OFFSET,
                           COACH_TACTIC_OFFSET, PRESET_SIZE, LayoutError)
from tactical_plans import compile_plan, from_coach_intent, FIELDS
from career_coaches import validate, tactical_intent

TEAM_SLOT_OFFSET = 648
TEAM_COACH_OFFSET = 652


def operations_from_simulation(state, bindings, native_coach_ids, coach_catalog):
    """Translate a simulated snapshot into explicit native operations.

    Bindings describe the *current* decoded save, not an old team-name guess.
    Missing native identities (including generated coaches) stop the whole batch.
    This does not invent results, advance time, add Coach.bin rows or write a file.
    """
    validate(state)
    if set(bindings) != set(state['clubs']):
        raise ValueError('Every simulated club needs an explicit current-save binding.')
    operations = []
    for club_id in sorted(state['clubs']):
        intent = tactical_intent(state, club_id)
        if intent is None:  # Player's own ML tactics remain entirely outside the batch.
            continue
        coach_key = intent['coach']
        identity = native_coach_ids.get(coach_key)
        if identity not in coach_catalog or coach_catalog[identity] != state['coaches'][coach_key]['name']:
            raise ValueError('Coach has no matching native identity; prepare and validate Coach.bin first.')
        settings = from_coach_intent(intent)
        formations = intent['formations']
        alternate = formations[1] if len(formations) > 1 else formations[0]
        binding = bindings[club_id]
        operation = {'team': binding['team'], 'expected_coach': binding['expected_coach'],
                     'plans': [
                         {'settings': settings, 'formation': formations[0]},
                         {'settings': settings, 'formation': formations[0]},
                         {'settings': dict(settings, defensive_line=max(2, settings['defensive_line'] - 2)), 'formation': alternate},
                         {'settings': dict(settings, pressuring=0, defensive_style=0), 'formation': alternate},
                     ]}
        if identity != binding['expected_coach']:
            operation['new_coach'] = identity
        operations.append(operation)
    return operations


def plan_offsets(team):
    return [team.team_offset + TEAM_TACTIC_OFFSET] + [
        team.coach_offset + COACH_TACTIC_OFFSET + preset * PRESET_SIZE for preset in range(3)]


def apply_operations(data, operations, *, mode, coach_catalog):
    if mode != 'BAL':
        raise LayoutError('Only the observed BAL adapter is available; ML is not patched.')
    if not operations:
        raise ValueError('Explicit operations are required.')
    teams = [read_team(data, index) for index in range(TEAM_COUNT)]
    occupied = {team.coach_id for team in teams if team.name}
    output = bytearray(data)
    allowed, touched, reports = set(), set(), []
    for operation in operations:
        team = find_team(data, operation['team'], operation['expected_coach'])
        if team.index in touched:
            raise ValueError('Duplicate team operation.')
        touched.add(team.index)
        if struct.unpack_from('<I', data, team.team_offset + TEAM_SLOT_OFFSET)[0] != team.index:
            raise LayoutError('Team slot reference does not match the observed layout.')
        if struct.unpack_from('<I', data, team.team_offset + TEAM_COACH_OFFSET)[0] != team.coach_id:
            raise LayoutError('Team and coach references disagree.')
        coach_change = operation.get('new_coach')
        if coach_change is not None:
            if type(coach_change) is not int or coach_change not in coach_catalog:
                raise ValueError('New coach must have a known native database identity.')
            if coach_change in occupied:
                raise ValueError('Coach already employed; simultaneous transfers need a separate transaction.')
            name = coach_catalog[coach_change].encode('utf-8')
            if not name or len(name) >= 46 or b'\0' in name:
                raise ValueError('Coach name does not fit the native field.')
            for offset in (team.team_offset + TEAM_COACH_OFFSET, team.coach_offset):
                output[offset:offset + 4] = struct.pack('<I', coach_change)
                allowed.update(range(offset, offset + 4))
            offset = team.coach_offset + 4
            output[offset:offset + 46] = name.ljust(46, b'\0')
            allowed.update(range(offset, offset + 46))
            occupied.add(coach_change)
            # Keep departed identities unavailable in the same batch. This avoids
            # incorrect assumptions when an identity is shared by native teams.
        plans = operation['plans']
        if len(plans) != 4:
            raise ValueError('Explicit team plan and all three coach plans are required.')
        for offset, specification in zip(plan_offsets(team), plans):
            original = data[offset:offset + PRESET_SIZE]
            modified = compile_plan(original, specification.get('settings'), specification.get('formation'))
            declared = {FIELDS[name] for name in specification.get('settings', {})}
            if specification.get('formation') is not None:
                declared.update(phase * 33 + relative for phase in range(3)
                                for relative in range(33) if relative not in (0, 11, 12))
            changed = {relative for relative, (before, after) in enumerate(zip(original, modified)) if before != after}
            if not changed.issubset(declared):
                raise AssertionError('Compiler changed an undeclared field.')
            allowed.update(offset + relative for relative in declared)
            output[offset:offset + PRESET_SIZE] = modified
        reports.append({'team': team.name, 'slot': team.index, 'previousCoach': team.coach_id,
                        'newCoach': coach_change, 'plans': plans})
    actual = {offset for offset, (a, b) in enumerate(zip(data, output)) if a != b}
    if len(data) != len(output) or not actual.issubset(allowed):
        raise AssertionError('Unexpected mutation outside the approved byte regions.')
    return bytes(output), {'mode': mode, 'teams': reports, 'changedByteCount': len(actual),
        'changedOffsets': sorted(actual), 'beforeSha256': hashlib.sha256(data).hexdigest(),
        'afterSha256': hashlib.sha256(output).hexdigest(),
        'inGameValidated': False, 'automaticCoachChanges': False}
