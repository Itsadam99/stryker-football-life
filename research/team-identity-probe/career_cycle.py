"""Prepare an annual coaching state from verified native results; no file writes."""
from career_coaches import advance_season
from career_results import read_results, results_for_clubs, require_completed_leagues


def advance_from_save(data, description, state, bindings, league_rules, *, season_start=None):
    if state['mode'] != 'BAL':
        raise ValueError('The native results adapter is only mapped for BAL.')
    if set(state['clubs']) != set(bindings):
        raise ValueError('Every simulated club needs a current results binding.')
    competitions = {str(binding['competitionId']) for binding in bindings.values()}
    if competitions != {str(key) for key in league_rules}:
        raise ValueError('Rules must cover exactly the simulated competitions.')
    for competition in competitions:
        members = {binding['teamSlot'] for binding in bindings.values() if str(binding['competitionId']) == competition}
        rule = next(value for key, value in league_rules.items() if str(key) == competition)
        if members != set(rule['teamSlots']):
            raise ValueError('All clubs of each simulated league must be included.')
    snapshot = read_results(data, description)
    require_completed_leagues(snapshot, league_rules)
    results = results_for_clubs(snapshot, bindings)
    updated = advance_season(state, snapshot['careerDate'], results, season_start=season_start)
    return updated, {'sourceDataSha256': snapshot['dataSha256'], 'careerDate': snapshot['careerDate'],
                     'competitions': sorted(competitions), 'clubCount': len(results),
                     'status': 'prepared state only; native coach installation and save journal still required'}
