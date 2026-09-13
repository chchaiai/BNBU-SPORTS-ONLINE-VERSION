"""Validate reference integrity, local OpenAPI references, scope and entry links."""
import hashlib
import json
from pathlib import Path
import re

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'source-manifest.json').read_bytes())
for item in manifest['files']:
    path = (root / item['path']).resolve()
    assert path.is_relative_to(root)
    assert hashlib.sha256(path.read_bytes()).hexdigest() == item['sha256'], item['path']
doc = json.loads((root / 'api/openapi.student.json').read_bytes())
methods = {'get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'}
ids = []
refs = set()
def resolve(ref):
    assert ref.startswith('#/'), ref
    value = doc
    for segment in ref[2:].split('/'):
        value = value[segment.replace('~1', '/').replace('~0', '~')]
    return value
def walk(value):
    if isinstance(value, dict):
        if '$ref' in value:
            resolve(value['$ref'])
            refs.add(value['$ref'])
        if 'discriminator' in value:
            for mapped in value['discriminator'].get('mapping', {}).values():
                resolve(mapped if mapped.startswith('#/') else '#/components/schemas/' + mapped)
        for key, child in value.items():
            if key == 'security':
                for requirement in child:
                    for name in requirement:
                        assert name in doc['components'].get('securitySchemes', {}), name
            walk(child)
    elif isinstance(value, list):
        for child in value:
            walk(child)
walk(doc)
for route, item in doc['paths'].items():
    assert route.startswith('/')
    for method, op in item.items():
        if method not in methods:
            continue
        ids.append(op['operationId'])
        policy = op['x-access-policy']
        assert 'STUDENT' in policy['allowedRoles'] or policy['authentication'] in {'PUBLIC', 'JOIN_CAPABILITY'}
        assert op['operationId'] not in doc['x-android-handoff']['excludedOperationIds']
        params = item.get('parameters', []) + op.get('parameters', [])
        params = [resolve(p['$ref']) if '$ref' in p else p for p in params]
        declared = {p['name'] for p in params if p['in'] == 'path' and p.get('required')}
        assert set(re.findall(r'\{([^}]+)\}', route)) <= declared, route
assert len(ids) == len(set(ids)) == manifest['operationCount']
assert doc['info']['version'] == manifest['apiVersion']
assert doc['x-android-handoff']['sourceSha256'] == manifest['sourceOpenapiSha256']
for link in re.findall(r'\]\(([^)]+)\)', (root / 'README.md').read_text(encoding='utf-8')):
    if '://' not in link and not link.startswith('#'):
        assert (root / link.split('#')[0]).exists(), link
patterns = [
    r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
    r'gh[pousr]_[A-Za-z0-9]{30,}',
    r'github_pat_[A-Za-z0-9_]{40,}',
    r'AKIA[0-9A-Z]{16}',
    r'AKID[A-Za-z0-9]{28,}',
    r'(?:postgres(?:ql)?|mysql)://[^\s:/]+:[^\s@]+@',
]
for path in root.rglob('*'):
    if not path.is_file() or path.suffix == '.py':
        continue
    assert path.stat().st_size < 2 * 1024 * 1024, path.name
    text = path.read_text(encoding='utf-8')
    assert not any(re.search(pattern, text) for pattern in patterns), f'Potential secret: {path.name}'
print(f'PASS: {len(ids)} unique operations; {len(refs)} resolved component refs; '
      f'{len(manifest["files"])} hashes; path parameters; README links; bounded credential-pattern scan')
