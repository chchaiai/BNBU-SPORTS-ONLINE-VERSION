"""Publish a hash-verified demand release; preserve a complete previous release."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import time
import urllib.request


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def run(args):
    subprocess.run(args, check=True)


def main():
    assert sys.argv[1:] == ['--apply'] and os.geteuid() == 0
    work = Path('/home/ubuntu/bnbu-media-round2-20260912')
    base = Path('/opt/bnbu-sports-production')
    previous = base / 'releases/demand-followup-20260912'
    release = base / 'releases/media-round2-20260912'
    gate = json.loads((work / 'validation.json').read_text())
    assert gate['localResult'] == 'PASS' and re.fullmatch('[a-f0-9]{40}', gate['sourceCommit'])
    assert (base / 'current').resolve() == previous and not release.exists()
    for name in ['images.tar.gz', 'static.tar']:
        assert digest(work / name) == gate['archives'][name]
    run(['docker', 'load', '-i', str(work / 'images.tar.gz')])
    if 'portal-update.tar.gz' in gate['archives']:
        assert digest(work / 'portal-update.tar.gz') == gate['archives']['portal-update.tar.gz']
        combined = work / 'portal-combined.tar'
        with tarfile.open(combined, 'x') as output:
            seen = set()
            for name in ['portal-update.tar.gz', 'images.tar.gz']:
                with tarfile.open(work / name) as source:
                    for item in source:
                        if not item.isfile() or item.name in seen:
                            continue
                        if name == 'images.tar.gz' and not item.name.startswith('blobs/sha256/'):
                            continue
                        output.addfile(item, source.extractfile(item))
                        seen.add(item.name)
        run(['docker', 'load', '-i', str(combined)])
    for service in ['backend']:
        image = f'bnbu-{service}-production:media-round2-20260912'
        actual = subprocess.check_output(['docker', 'image', 'inspect', '--format', '{{.Id}}', image], text=True).strip()
        assert actual == gate['images'][service]
    run(['python3', str(work / 'backup-before-bugfix.py')])
    assert (base / 'current').resolve() == previous
    shutil.copytree(previous, release)
    with tarfile.open(work / 'static.tar') as archive:
        assert set(archive.getnames()) == set(gate['staticFiles'])
        for item in archive:
            path = PurePosixPath(item.name)
            assert item.isfile() and not path.is_absolute() and '..' not in path.parts
            assert item.name.startswith('student/')
            content = archive.extractfile(item).read()
            assert hashlib.sha256(content).hexdigest() == gate['staticFiles'][item.name]
            target = release / 'web' / item.name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
    env = release / '.env'
    content = env.read_text()
    for service in ['BACKEND']:
        content, count = re.subn(rf'(?m)^{service}_IMAGE=.*$',
                                f'{service}_IMAGE=bnbu-{service.lower()}-production:media-round2-20260912', content)
        assert count == 1
    env.write_text(content)
    for name in ['production.env', 'compose.yml', 'nginx.conf']:
        assert (release / name).read_bytes() == (previous / name).read_bytes()

    def switch(target):
        link = base / 'current-media-round2-tmp'
        assert not link.exists() and not link.is_symlink()
        link.symlink_to(target)
        os.replace(link, base / 'current')

    try:
        run(['docker', 'compose', '--project-directory', str(release), '--profile', 'migration', 'run', '--rm', 'migrator'])
        run(['docker', 'compose', '--project-directory', str(release), 'up', '-d', '--no-build', '--pull', 'never', 'backend', 'portal'])
        for attempt in range(120):
            states = [subprocess.check_output(['docker', 'inspect', '--format', '{{.State.Health.Status}}',
                      f'bnbu-sports-production-{service}-1'], text=True).strip() for service in ['backend', 'portal']]
            if states == ['healthy', 'healthy']:
                break
            time.sleep(1)
        else:
            raise RuntimeError('New application health timeout')
        switch(release)
        for url in ['https://www.teacher.bnbusports.cn/', 'https://www.student.bnbusports.cn/api/v1/health/ready']:
            with urllib.request.urlopen(url, timeout=30) as response:
                assert response.status == 200
        for name, expected in gate['staticFiles'].items():
            with urllib.request.urlopen('https://www.student.bnbusports.cn/' + name + '?demand=' + gate['sourceCommit'][:12], timeout=30) as response:
                assert hashlib.sha256(response.read()).hexdigest() == expected
        result = {'check': 'MEDIA_ROUND2_DEPLOYMENT', 'result': 'PASS', 'sourceCommit': gate['sourceCommit'],
                  'release': str(release), 'previous': str(previous), 'staticFilesVerified': len(gate['staticFiles']), 'images': gate['images']}
        (work / 'deployment-result.json').write_text(json.dumps(result, indent=2))
        print(json.dumps(result))
    except Exception:
        # New-rule writes can occur as soon as the backend starts. Old code does
        # not understand record snapshots: never roll it back automatically.
        print(json.dumps({'check': 'MEDIA_ROUND2_DEPLOYMENT', 'result': 'FAILED_REQUIRES_FORWARD_FIX',
                          'database': 'Forward migrations retained. Snapshot-aware binaries required.',
                          'previous': str(previous), 'release': str(release)}))
        raise


if __name__ == '__main__':
    main()
