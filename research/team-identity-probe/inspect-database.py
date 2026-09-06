"""Read decompressed PES 2020/21 database tables. Never writes game tables.

Team/Coach layout reference: the4chancup/pes-db-generator generators/team.py
and coach.py. Tactics/formation relationships inferred from the local FL26
snapshot; raw tactical flags are intentionally not assigned gameplay meanings.
"""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import struct


def records(filename, size):
    data = Path(filename).read_bytes()
    if not data or len(data) % size:
        raise ValueError(f'{filename}: invalid record size; expected multiples of {size}')
    return [data[i:i + size] for i in range(0, len(data), size)]


def text_field(data):
    if b'\0' not in data:
        raise ValueError('Unexpected unterminated text field')
    return data.split(b'\0', 1)[0].decode('utf-8')


def unique(rows, key):
    values = [row[key] for row in rows]
    if len(values) != len(set(values)):
        raise ValueError(f'Duplicate {key}; incompatible table layout')


def inspect(args):
    coaches = [{'id':struct.unpack_from('<I',r)[0], 'name':text_field(r[54:100])}
               for r in records(args.coaches,100)]
    teams = [{'id':struct.unpack_from('<I',r,8)[0], 'coachId':struct.unpack_from('<I',r)[0],
              'name':text_field(r[368:438])} for r in records(args.teams,1532)]
    tactics = [{'id':struct.unpack_from('<I',r)[0], 'teamId':struct.unpack_from('<I',r,4)[0],
                'rawFlagsHex':r[8:12].hex()} for r in records(args.tactics,12)]
    unique(coaches,'id'); unique(teams,'id'); unique(tactics,'id')
    coach_map = {r['id']:r['name'] for r in coaches}
    tactic_map = defaultdict(list)
    for tactic in tactics:
        tactic_map[tactic['teamId']].append(tactic)
    formation_counts = Counter(struct.unpack_from('<I',r)[0] for r in records(args.formations,12))
    if any(n != 33 for n in formation_counts.values()):
        raise ValueError('Unexpected formation group length; only observed 33-record groups supported')
    for team in teams:
        team['coachName'] = coach_map.get(team['coachId'])
        team['tactics'] = tactic_map.get(team['id'], [])
        team['formationRecordCounts'] = {str(t['id']):formation_counts.get(t['id'],0) for t in team['tactics']}
    ids = {t['id'] for t in teams}
    hashes = {key:hashlib.sha256(Path(getattr(args,key)).read_bytes()).hexdigest()
              for key in ['teams','coaches','tactics','formations']}
    return {
        'status':'read-only database inventory; not live career data or decoded gameplay settings',
        'inputSha256':hashes,
        'summary':{'teams':len(teams), 'coaches':len(coaches), 'tactics':len(tactics),
                   'formationGroups':len(formation_counts),
                   'teamsWithoutTacticRows':sum(not t['tactics'] for t in teams),
                   'teamsWithoutCoachRow':sum(t['coachName'] is None for t in teams),
                   'tacticsWithoutFormation':sum(t['id'] not in formation_counts for t in tactics)},
        'unmatchedTacticTeamIds':sorted(set(tactic_map)-ids),
        'teams':teams, 'coaches':coaches,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ['teams','coaches','tactics','formations','output']:
        parser.add_argument('--'+key, required=True, type=Path)
    args = parser.parse_args()
    output = args.output.resolve()
    if output in {getattr(args,key).resolve() for key in ['teams','coaches','tactics','formations']}:
        raise ValueError('Output must not replace an input table')
    result = inspect(args)
    # Fail if an earlier result exists, keeping previous research snapshots intact.
    with output.open('x',encoding='utf-8') as file:
        json.dump(result,file,ensure_ascii=False,indent=2)
    print(json.dumps(result['summary']))
    print(json.dumps([t for t in result['teams'] if t['id'] in [108,172,414,4211]],ensure_ascii=True))
