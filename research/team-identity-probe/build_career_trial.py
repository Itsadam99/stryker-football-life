"""Build an isolated BAL trial from six decoded blocks and verify a crypt round trip.

External prerequisite: the PES 2021 executables from pesXdecrypter 6.0.0.
The destination must not exist. This tool never installs or overwrites a live save.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

from career_format import patch_build_up

BLOCKS = ('data.dat', 'description.dat', 'encryptHeader.dat', 'header.dat', 'logo.png', 'version.txt')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def build_trial(source, destination, crypto_tools, team, coach, title):
    data = (Path(source) / 'data.dat').read_bytes()
    output, report = patch_build_up(data, expected_name=team, expected_coach_id=coach, short_pass=True)
    report['changedOffsets'] = sorted(c['offset'] for c in report['changedBytes'])
    return write_verified_trial(source, destination, crypto_tools, output, report, title)


def write_verified_trial(source, destination, crypto_tools, output, report, title):
    source, destination, crypto_tools = map(Path, (source, destination, crypto_tools))
    blocks = {name: (source / name).read_bytes() for name in BLOCKS}
    # Independently verify the complete decoded diff, not just the adapter's log.
    actual = [i for i, (before, after) in enumerate(zip(blocks['data.dat'], output)) if before != after]
    if digest(blocks['data.dat']) != report['beforeSha256'] or digest(output) != report['afterSha256']:
        raise ValueError('Patch provenance differs from the source snapshot.')
    if len(output) != len(blocks['data.dat']) or actual != report['changedOffsets']:
        raise ValueError('Unexpected changes outside the tactical patch.')
    if 'allowedOffsets' in report and not set(actual).issubset(report['allowedOffsets']):
        raise ValueError('A change is outside the allowed instruction locations.')
    label = title.encode('utf-8')
    if not label or len(label) >= 128 or b'\0' in label or len(blocks['description.dat']) != 384:
        raise ValueError('Invalid trial label or unsupported description block.')
    expected = dict(blocks)
    expected['data.dat'] = output
    expected['description.dat'] = label.ljust(128, b'\0') + blocks['description.dat'][128:]
    for exe in ('encrypter21.exe', 'decrypter21.exe'):
        if not (crypto_tools / exe).is_file():
            raise FileNotFoundError(crypto_tools / exe)
    destination.mkdir(parents=True, exist_ok=False)
    modified, roundtrip = destination / 'modified', destination / 'roundtrip'
    modified.mkdir()
    roundtrip.mkdir()
    for name, data in expected.items():
        (modified / name).write_bytes(data)
    save = destination / 'BAL-STRYKER-TEST'
    subprocess.run([str((crypto_tools / 'encrypter21.exe').resolve()), str(modified.resolve()), str(save.resolve())], check=True)
    subprocess.run([str((crypto_tools / 'decrypter21.exe').resolve()), str(save.resolve()), str(roundtrip.resolve())], check=True)
    checks = {name: (roundtrip / name).read_bytes() == data for name, data in expected.items()}
    if not all(checks.values()):
        raise ValueError(f'Round-trip mismatch; do not install trial: {checks}')
    # Source snapshots must remain byte-identical throughout the build.
    if any((source / name).read_bytes() != data for name, data in blocks.items()):
        raise ValueError('Source changed during trial build; do not install.')
    report.update({
        'trialTitle': title, 'outputFile': str(save.resolve()),
        'encryptedSha256': digest(save.read_bytes()), 'roundTripExact': checks,
        'sourceBlockHashes': {name: digest(data) for name, data in blocks.items()},
        'descriptionChanges': 'only first 128 bytes (display title); career description preserved',
        'inGameValidated': False,
    })
    (destination / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--decoded', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--crypto-tools', required=True, type=Path)
    parser.add_argument('--team', required=True)
    parser.add_argument('--coach', required=True, type=int)
    parser.add_argument('--title', required=True)
    args = parser.parse_args()
    report = build_trial(args.decoded, args.output, args.crypto_tools, args.team, args.coach, args.title)
    print(json.dumps(report, ensure_ascii=True, indent=2))


if __name__ == '__main__':
    main()
