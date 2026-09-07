"""Read native FL26 BAL competition totals without mixing league/cup phases.

Observed at team+744: fifteen 20-byte records. Paris FC's competition 20 was
confirmed by the user: 6 matches, 2 wins, 2 draws, 2 losses, 8 points.
Some phases carry points from earlier stages; never silently reinterpret them.
"""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import struct

from career_calendar import read_career_date
from career_format import TEAM_COUNT, LayoutError, read_team
from career_application import TEAM_SLOT_OFFSET, TEAM_COACH_OFFSET

RESULTS_OFFSET = 744
RESULT_SIZE = 20
RESULT_COUNT = 15
EMPTY_COMPETITION = 65535


def read_results(data, description):
    career_date = read_career_date(data, description)
    records, inactive = [], []
    for index in range(TEAM_COUNT):
        team = read_team(data, index)
        if not team.name:
            continue
        if struct.unpack_from('<II', data, team.team_offset + TEAM_SLOT_OFFSET) != (index, team.coach_id):
            raise LayoutError('Team/coach references do not match the observed BAL layout.')
        seen = set()
        for entry in range(RESULT_COUNT):
            offset = team.team_offset + RESULTS_OFFSET + entry * RESULT_SIZE
            competition, points, matches, wins, draws, losses, extra, gf, ga, other = struct.unpack_from('<H6B3I', data, offset)
            if competition == EMPTY_COMPETITION:
                continue
            if competition in seen:
                raise LayoutError('Duplicate competition within a team: ambiguous statistics.')
            seen.add(competition)
            issues = []
            if matches != wins + draws + losses:
                issues.append('match_counts_disagree')
            if points != 3 * wins + draws:
                issues.append('nonstandard_points_or_carry_over')
            records.append({'team': team.name, 'teamSlot': index, 'coachId': team.coach_id,
                'competitionId': competition, 'recordIndex': entry, 'offset': offset,
                'points': points, 'matches': matches, 'wins': wins, 'draws': draws, 'losses': losses,
                'goalsForCandidate': gf, 'goalsAgainstCandidate': ga,
                'unclassifiedByte': extra, 'unclassifiedInteger': other, 'issues': issues})
        if not seen:
            inactive.append({'team': team.name, 'teamSlot': index})
    groups = defaultdict(list)
    for row in records:
        groups[row['competitionId']].append(row)
    competitions = {}
    for identity, rows in sorted(groups.items()):
        totals = {key: sum(row[key] for row in rows) for key in
                  ('points', 'matches', 'wins', 'draws', 'losses', 'goalsForCandidate', 'goalsAgainstCandidate')}
        issues = sorted({issue for row in rows for issue in row['issues']})
        if totals['wins'] != totals['losses'] or totals['draws'] % 2 or totals['matches'] % 2:
            issues.append('competition_results_do_not_balance')
        if totals['goalsForCandidate'] != totals['goalsAgainstCandidate']:
            issues.append('candidate_goal_totals_do_not_balance')
        competitions[str(identity)] = {'teamSlots': sorted(row['teamSlot'] for row in rows),
            'teamCount': len(rows), 'totals': totals, 'issues': issues,
            'standardPointsConsistent': not issues}
    return {'format': 'FL26-BAL-observed-results-v1', 'careerDate': career_date,
            'dataSha256': hashlib.sha256(data).hexdigest(), 'records': records,
            'competitions': competitions, 'teamsWithoutCompetitionRecords': inactive,
            'seasonEndDetected': False}


def results_for_clubs(snapshot, bindings):
    """Select exactly one explicitly bound competition per club for the engine.

    Current totals do not constitute a final season. No sorting by table position
    or combining cup points. The complete competition must be internally coherent.
    """
    if snapshot.get('format') != 'FL26-BAL-observed-results-v1' or not bindings:
        raise ValueError('A supported results snapshot and explicit club bindings are required.')
    rows = {(r['teamSlot'], r['competitionId']): r for r in snapshot['records']}
    if len(rows) != len(snapshot['records']):
        raise ValueError('Ambiguous result rows.')
    selected, slots = {}, set()
    for club, binding in bindings.items():
        slot, competition = binding['teamSlot'], binding['competitionId']
        if type(slot) is not int or type(competition) is not int or slot in slots:
            raise ValueError('Invalid or duplicate team binding.')
        slots.add(slot)
        row = rows.get((slot, competition))
        group = snapshot['competitions'].get(str(competition))
        if row is None or row['team'] != binding['team']:
            raise ValueError('Club identity or competition missing from current results.')
        if not group or group['issues'] or row['issues']:
            raise ValueError('Nonstandard competition totals require a separate phase/points policy.')
        selected[club] = {'matches': row['matches'], 'points': row['points']}
    return selected


def require_completed_leagues(snapshot, league_rules):
    """Completion requires explicit membership and scheduled games per team.

    A year change, balanced current table or low match count never ends a season.
    Rules must come from a verified competition schedule, not a guessed team count.
    """
    if not league_rules:
        raise ValueError('Explicit league schedules are required.')
    for competition, rule in league_rules.items():
        group = snapshot['competitions'].get(str(competition))
        expected = rule['teamSlots']
        if (len(expected) < 2 or any(type(slot) is not int for slot in expected)
                or len(set(expected)) != len(expected)):
            raise ValueError('Invalid expected league membership.')
        if not group or group['issues'] or set(group['teamSlots']) != set(expected):
            raise ValueError('Incomplete, changed or nonstandard league membership/results.')
        scheduled = rule['matchesPerTeam']
        if type(scheduled) is not int or not 1 <= scheduled <= 255:
            raise ValueError('Invalid scheduled match count.')
        league_rows = [r for r in snapshot['records'] if str(r['competitionId']) == str(competition)]
        if any(row['matches'] != scheduled for row in league_rows):
            raise ValueError('League is not complete; no annual coaching event is allowed.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--decoded', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    report = read_results((args.decoded / 'data.dat').read_bytes(), (args.decoded / 'description.dat').read_bytes())
    with args.output.open('x', encoding='utf-8') as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2)
    print(json.dumps({'careerDate': report['careerDate'], 'records': len(report['records']),
        'competitions': len(report['competitions']),
        'nonstandardCompetitions': [key for key, group in report['competitions'].items() if group['issues']],
        'teamsWithoutRecords': len(report['teamsWithoutCompetitionRecords']), 'report': str(args.output.resolve())}))


if __name__ == '__main__':
    main()
