"""Restore committed manifest bytes in a .local Git-export build directory only."""
import hashlib
import json
from pathlib import Path
import sys

repo = Path(__file__).resolve().parents[2]
root = Path(sys.argv[1]).resolve(strict=True)
assert root.is_relative_to((repo / '.local').resolve()), 'Only isolated .local build exports are allowed'
changed = []
for sql in (root / 'backend/prisma/migrations').glob('*/migration.sql'):
    expected = json.loads((sql.parent / 'manifest.json').read_text())['sha256']
    raw = sql.read_bytes()
    lf = raw.replace(b'\r\n', b'\n')
    matches = [value for value in (raw, lf, lf.replace(b'\n', b'\r\n'))
               if hashlib.sha256(value).hexdigest() == expected]
    assert matches, f'{sql.parent.name}: neither LF nor CRLF matches the committed manifest'
    if raw != matches[0]:
        sql.write_bytes(matches[0])
        changed.append(sql.parent.name)
print(json.dumps({'check': 'MIGRATION_MANIFEST_BYTES_RESTORED', 'result': 'PASS', 'migrations': changed}))
