"""Preserve mod research source and evidence notes, excluding private game files."""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED


def build_archive(output, revision):
    source = Path(__file__).resolve().parent
    repository = source.parents[1]
    files = sorted(path for path in source.rglob('*') if path.is_file()
                   and '__pycache__' not in path.parts and path.suffix in ('.py', '.lua', '.mjs', '.md', '.json'))
    files.append(repository / 'docs' / 'TEAM_IDENTITIES_AND_COACHES.md')
    files.extend(path for path in (repository / 'server' / 'career').rglob('*')
                 if path.is_file() and path.suffix in ('.js', '.txt'))
    for relative in ('src/components/CareerStudio.tsx', 'src/services/careerApi.ts',
                     'test/career.test.js', 'test/career-api.test.js', 'test/bal-adapter.test.js',
                     'test/coach-table.test.js', 'test/coaching.test.js', 'test/coaching-bridge.test.js',
                     'test/schedule.test.js', 'test/helpers/career.js', 'test/cpk-reader.test.js',
                     'test/fixtures/career-native-table.cpk'):
        files.append(repository / relative)
    payloads = {path.relative_to(repository).as_posix(): path.read_bytes() for path in files}
    inventory = {'revision': revision, 'type': 'development sources, not a public installable gameplay mod',
        'files': {name: hashlib.sha256(data).hexdigest() for name, data in payloads.items()},
        'externalRequirements': ['STRYKER repository for app integration and diagnostic deployment tests',
                                 'Node.js >=20 for native runtime (no Python or external executable needed by app)',
                                 'PES 2021 pesXdecrypter only for independent legacy research verification',
                                 'local game data supplied separately; no user saves or game tables included']}
    payloads['SOURCE-INVENTORY.json'] = json.dumps(inventory, ensure_ascii=False, indent=2).encode('utf-8')
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, 'x', compression=ZIP_DEFLATED) as archive:
        for name, data in payloads.items():
            archive.writestr(name, data)
    with ZipFile(output, 'r') as archive:
        if set(archive.namelist()) != set(payloads) or any(archive.read(name) != data for name, data in payloads.items()):
            raise ValueError('Source archive verification failed.')
    return {'archive': str(output.resolve()), 'files': len(payloads), 'revision': revision,
            'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    parser.add_argument('--revision', required=True)
    args = parser.parse_args()
    print(json.dumps(build_archive(args.output, args.revision), indent=2))
