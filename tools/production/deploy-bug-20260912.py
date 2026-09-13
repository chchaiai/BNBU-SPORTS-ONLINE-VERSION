"""Deploy the verified bug release with a database backup and application rollback."""
import hashlib, json, os, re, shutil, subprocess, sys, tarfile, time, urllib.request
from pathlib import Path, PurePosixPath
assert os.geteuid() == 0 and sys.argv[1:] == ['--apply']
base=Path('/opt/bnbu-sports-production');work=Path('/home/ubuntu/bnbu-bug-20260912')
previous=base/'releases/media-round3-20260912';release=base/'releases/bug-20260912'
assert (base/'current').resolve()==previous and not release.exists()
gate=json.loads((work/'validation.json').read_text());assert gate['localResult']=='PASS'
assert re.fullmatch('[a-f0-9]{40}',gate['sourceCommit'])
def run(args):subprocess.run(args,check=True)
def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
for name in ['images.tar.gz','static.tar']:assert digest(work/name)==gate['archives'][name]
run(['docker','load','-i',str(work/'images.tar.gz')])
for service in ['backend','migrator']:
 image='bnbu-'+service+'-production:bug-20260912'
 assert subprocess.check_output(['docker','image','inspect','--format','{{.Id}}',image],text=True).strip()==gate['images'][service]
run(['python3',str(work/'backup-before-bugfix.py')])
shutil.copytree(previous,release)
with tarfile.open(work/'static.tar') as archive:
 assert set(archive.getnames())==set(gate['staticFiles'])
 for item in archive:
  path=PurePosixPath(item.name)
  assert item.isfile() and item.name.startswith('student/') and not path.is_absolute() and '..' not in path.parts
  content=archive.extractfile(item).read();assert hashlib.sha256(content).hexdigest()==gate['staticFiles'][item.name]
  target=release/'web'/item.name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(content)
env=release/'.env';content=env.read_text()
for service in ['BACKEND','MIGRATOR']:
 content,count=re.subn(rf'(?m)^{service}_IMAGE=.*$',f'{service}_IMAGE=bnbu-{service.lower()}-production:bug-20260912',content);assert count==1
env.write_text(content)
site=Path('/etc/nginx/sites-enabled/bnbu-staging-hk.conf').resolve(strict=True)
oldNginx=site.read_text();(release/'nginx-before-bug.conf').write_text(oldNginx)
anchor='    location = /runtime-config.js { try_files $uri =404; }'
assert oldNginx.count(anchor)==1
newNginx=oldNginx.replace(anchor,anchor+'''
    location ^~ /student/vendor/ffmpeg/ {
        add_header X-Content-Type-Options nosniff always;
        add_header Referrer-Policy strict-origin-when-cross-origin always;
        add_header Cache-Control "public, max-age=2592000" always;
        try_files $uri =404;
    }''')
def switch(target):
 link=base/'current-bug-tmp';assert not link.exists() and not link.is_symlink();link.symlink_to(target);os.replace(link,base/'current')
try:
 run(['docker','compose','--project-directory',str(release),'--profile','migration','run','--rm','migrator'])
 run(['docker','compose','--project-directory',str(release),'up','-d','--no-build','--pull','never','backend'])
 for attempt in range(120):
  if subprocess.check_output(['docker','inspect','--format','{{.State.Health.Status}}','bnbu-sports-production-backend-1'],text=True).strip()=='healthy':break
  time.sleep(1)
 else:raise RuntimeError('Backend did not become healthy')
 switch(release);site.write_text(newNginx);run(['nginx','-t']);run(['systemctl','reload','nginx'])
 for name,expected in gate['staticFiles'].items():
  with urllib.request.urlopen('https://www.student.bnbusports.cn/'+name+'?bug='+gate['sourceCommit'][:12],timeout=30) as response:
   assert response.status==200 and hashlib.sha256(response.read()).hexdigest()==expected
 with urllib.request.urlopen('https://www.student.bnbusports.cn/api/v1/health/ready',timeout=30) as response:assert response.status==200
 result=dict(check='BUG_DEPLOYMENT',result='PASS',sourceCommit=gate['sourceCommit'],release=str(release),previous=str(previous),staticFilesVerified=len(gate['staticFiles']),images=gate['images'])
 (work/'deployment-result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
except Exception:
 site.write_text(oldNginx);run(['nginx','-t']);switch(previous);run(['systemctl','reload','nginx'])
 run(['docker','compose','--project-directory',str(previous),'up','-d','--no-build','--pull','never','backend'])
 # 0071 only broadens an existing CHECK; retain it rather than restore business data.
 raise
