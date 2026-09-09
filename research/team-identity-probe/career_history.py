"""Immutable checkpoints for a caller-selected career; never touches game saves.

Career identity and parent checkpoint are explicit: a filename/slot alone cannot
identify a career or choose a branch after loading an older save.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from datetime import date

from career_coaches import validate


def _encoded(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')


def _digest(value):
    if not isinstance(value, str) or not re.fullmatch('[0-9a-f]{64}', value):
        raise ValueError('Invalid checkpoint identifier.')
    return value


class CareerHistory:
    def __init__(self, root, career_id):
        if not isinstance(career_id, str) or not career_id.strip():
            raise ValueError('Explicit career identity required.')
        self.career_id = career_id
        self.directory = Path(root) / hashlib.sha256(career_id.encode('utf-8')).hexdigest()

    def load(self, checkpoint):
        raw = (self.directory / (_digest(checkpoint) + '.json')).read_bytes()
        if hashlib.sha256(raw).hexdigest() != checkpoint:
            raise ValueError('Checkpoint content differs from its fingerprint.')
        payload = json.loads(raw)
        if payload.get('version') != 1 or payload.get('careerId') != self.career_id:
            raise ValueError('Checkpoint belongs to a different career or version.')
        if payload['coachingState'] is not None:
            validate(payload['coachingState'])
        return payload

    def store(self, results, *, coaching_state=None, parent=None):
        if results.get('format') != 'FL26-BAL-observed-results-v1':
            raise ValueError('Verified results observations are required.')
        _digest(results['dataSha256'])
        if date.fromisoformat(results['careerDate']).isoformat() != results['careerDate']:
            raise ValueError('Invalid career date.')
        if coaching_state is not None:
            validate(coaching_state)
            if coaching_state['career_id'] != self.career_id or coaching_state['date'] > results['careerDate']:
                raise ValueError('Coaching state identity/date does not match the career observation.')
        if parent is not None:
            previous = self.load(parent)
            if previous['results']['careerDate'] > results['careerDate']:
                raise ValueError('For rollback, select the earlier parent checkpoint explicitly.')
        payload = {'version': 1, 'careerId': self.career_id, 'parent': parent,
                   'results': results, 'coachingState': coaching_state}
        raw = _encoded(payload)
        identifier = hashlib.sha256(raw).hexdigest()
        self.directory.mkdir(parents=True, exist_ok=True)
        target = self.directory / (identifier + '.json')
        # Publish a fully-written immutable file. Concurrent duplicate writes are
        # harmless; partially-written checkpoints are never visible under their ID.
        with tempfile.NamedTemporaryFile(dir=self.directory, suffix='.pending', delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            try:
                os.link(temporary, target)
            except FileExistsError:
                if target.read_bytes() != raw:
                    raise ValueError('Existing checkpoint content is inconsistent.')
        finally:
            temporary.unlink()
        return identifier
