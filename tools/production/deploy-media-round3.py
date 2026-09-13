"""Apply the hash-verified PDF module MIME compatibility fix to a new release."""
from pathlib import Path
import hashlib, json, os, shutil, tarfile, urllib.request

assert os.geteuid() == 0
work = Path('/home/ubuntu/bnbu-media-round2-20260912')
base = Path('/opt/bnbu-sports-production')
previous = base / 'releases/media-round2-pdf-20260912'
release = base / 'releases/media-round3-20260912'
assert (base / 'current').resolve() == previous and not release.exists()
gate = json.loads((work / 'round3-patch.json').read_text())
with tarfile.open(work / 'round3-patch.tar') as tar:
    assert set(tar.getnames()) == set(gate['files'])
    contents = {}
    for item in tar:
        assert item.isfile() and item.name.startswith('student/') and '..' not in Path(item.name).parts
        data = tar.extractfile(item).read()
        assert hashlib.sha256(data).hexdigest() == gate['files'][item.name]
        contents[item.name] = data
shutil.copytree(previous, release)
for name, data in contents.items():
    (release / 'web' / name).write_bytes(data)
link = base / 'current-media-round3-tmp'
assert not link.exists() and not link.is_symlink()
link.symlink_to(release)
os.replace(link, base / 'current')
for name, expected in gate['files'].items():
    with urllib.request.urlopen('https://www.student.bnbusports.cn/' + name, timeout=30) as response:
        assert 'javascript' in response.headers['Content-Type']
        assert hashlib.sha256(response.read()).hexdigest() == expected
result = dict(check='MEDIA_ROUND3_DEPLOYMENT', result='PASS', sourceCommit=gate['sourceCommit'], release=str(release), previous=str(previous), filesVerified=len(contents))
(work / 'round3-deployment-result.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result))
