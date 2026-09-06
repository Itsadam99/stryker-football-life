"""Build an experimental all-team BAL style trial, with an optional coach test.

Nothing is installed. The known game database is supplied locally, not bundled.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import struct
from career_format import read_team, TEAM_COUNT, PRESET_SIZE, LayoutError
from career_application import apply_operations, plan_offsets
from tactical_plans import baseline_settings, family
from build_career_trial import write_verified_trial


def native_coaches(data):
    if len(data) % 100:
        raise ValueError('Unsupported Coach.bin length.')
    coaches = {}
    for offset in range(0, len(data), 100):
        identity = struct.unpack_from('<I', data, offset)[0]
        if identity in coaches:
            raise ValueError('Duplicate native coach ID.')
        coaches[identity] = data[offset + 54:offset + 100].split(b'\0', 1)[0].decode('utf-8')
    return coaches


def authored_plans(profile):
    balanced = dict(profile['settings'])
    protect = dict(balanced, defensive_line=max(2, balanced['defensive_line'] - 2),
                   compactness=min(10, balanced['compactness'] + 1))
    chase = dict(balanced, defensive_style=0, pressuring=0,
                 defensive_line=min(9, balanced['defensive_line'] + 1))
    return [
        {'settings': balanced, 'formation': profile['formations'][0]},
        {'settings': balanced, 'formation': profile['formations'][0]},
        {'settings': protect, 'formation': profile['formations'][1]},
        {'settings': chase, 'formation': profile['formations'][2]},
    ]


def recipe(data, profiles, *, coach_trial=False):
    operations, coverage, skipped = [], [], []
    for index in range(TEAM_COUNT):
        team = read_team(data, index)
        if not team.name:
            continue
        try:
            plans = [{'settings': baseline_settings(data[offset:offset + PRESET_SIZE])}
                     for offset in plan_offsets(team)]
        except LayoutError as error:
            skipped.append({'team': team.name, 'reason': str(error)})
            continue
        authored = profiles['clubs'].get(team.name)
        operation = {'team': team.name, 'expected_coach': team.coach_id, 'plans': plans}
        origin = 'native plans, with short build-up for possession plans'
        if authored and team.coach_id == authored['expected_coach']:
            operation['plans'] = authored_plans(authored)
            origin = 'authored experimental club/coach profile'
        trial = profiles['coach_trial']
        if coach_trial and team.name == trial['team']:
            if team.coach_id != trial['expected_coach']:
                raise ValueError('Coach trial no longer matches this career.')
            operation.update(new_coach=trial['new_coach'], plans=authored_plans(trial))
            origin = 'explicit coach appointment experiment'
        operations.append(operation)
        coverage.append({'team': team.name, 'coach': operation.get('new_coach', team.coach_id),
                         'family': family(operation['plans'][0]['settings']), 'origin': origin})
    if coach_trial and not any('new_coach' in operation for operation in operations):
        raise ValueError('Coach trial team was not found or had an unsupported plan.')
    return operations, {'teams': coverage, 'skipped': skipped,
                        'families': dict(Counter(team['family'] for team in coverage))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--decoded', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--crypto-tools', required=True, type=Path)
    parser.add_argument('--coach-bin', required=True, type=Path)
    parser.add_argument('--coach-trial', action='store_true')
    args = parser.parse_args()
    profiles = json.loads(Path(__file__).with_name('identity-presets.json').read_text(encoding='utf-8'))
    data = (args.decoded / 'data.dat').read_bytes()
    operations, coverage = recipe(data, profiles, coach_trial=args.coach_trial)
    output, report = apply_operations(data, operations, mode='BAL', coach_catalog=native_coaches(args.coach_bin.read_bytes()))
    report['coverage'] = coverage
    title = 'STRYKER TEST - Coach et styles' if args.coach_trial else 'STRYKER TEST - Styles'
    write_verified_trial(args.decoded, args.output, args.crypto_tools, output, report, title)
    print(json.dumps({'title': title, 'teams': len(operations), 'changedBytes': report['changedByteCount'],
        'skipped': coverage['skipped'], 'families': coverage['families'],
        'report': str((args.output / 'verification.json').resolve())}, ensure_ascii=True, indent=2))


if __name__ == '__main__':
    main()
