"""Deploy the reviewed limits and supplement release; block writes during the switch."""
import hashlib,json,os,re,shutil,subprocess,sys,tarfile,time,urllib.request
from pathlib import Path,PurePosixPath
assert os.geteuid()==0 and sys.argv[1:]==['--apply']
base=Path('/opt/bnbu-sports-production');work=Path('/home/ubuntu/bnbu-membership-20260913')
previous=base/'releases/course-retired-20260912';release=base/'releases/membership-20260913'
assert (base/'current').resolve()==previous and not release.exists()
gate=json.loads((work/'validation.json').read_text());assert gate['localResult']=='PASS'
assert re.fullmatch('[a-f0-9]{40}',gate['sourceCommit'])
def run(args):subprocess.run(args,check=True)
def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as stream:
  for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
for name in ['images.tar.gz','static.tar']:assert digest(work/name)==gate['archives'][name]
run(['docker','load','-i',str(work/'images.tar.gz')])
for service in ['backend','migrator']:
 image='bnbu-'+service+'-production:membership-20260913'
 assert subprocess.check_output(['docker','image','inspect','--format','{{.Id}}',image],text=True).strip()==gate['images'][service]
run(['python3',str(work/'backup-before-bugfix.py')])
shutil.copytree(previous,release)
with tarfile.open(work/'static.tar') as archive:
 assert set(archive.getnames())==set(gate['staticFiles'])
 for item in archive:
  path=PurePosixPath(item.name)
  assert item.isfile() and item.name.startswith('student/') and not path.is_absolute() and '..' not in path.parts
  data=archive.extractfile(item).read();assert hashlib.sha256(data).hexdigest()==gate['staticFiles'][item.name]
  target=release/'web'/item.name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
env=release/'.env';content=env.read_text()
for service in ['BACKEND','MIGRATOR']:
 content,count=re.subn(rf'(?m)^{service}_IMAGE=.*$',f'{service}_IMAGE=bnbu-{service.lower()}-production:membership-20260913',content);assert count==1
env.write_text(content)
site=Path('/etc/nginx/sites-enabled/bnbu-staging-hk.conf').resolve(strict=True)
oldNginx=site.read_text();(release/'nginx-before-limits.conf').write_text(oldNginx)
anchor='    location /api/v1/ {';assert oldNginx.count(anchor)==2
frozen=oldNginx.replace(anchor,anchor+'\n        if ($request_method !~ ^(GET|HEAD|OPTIONS)$) { return 503; }')
def switch(target):
 link=base/'current-limits-tmp';assert not link.exists() and not link.is_symlink();link.symlink_to(target);os.replace(link,base/'current')
def healthy():
 for attempt in range(120):
  states=[subprocess.check_output(['docker','inspect','--format','{{.State.Health.Status}}',f'bnbu-sports-production-{service}-1'],text=True).strip() for service in ['backend','portal']]
  if states==['healthy','healthy']:return
  time.sleep(1)
 raise RuntimeError('Application health timeout')
try:
 site.write_text(frozen);run(['nginx','-t']);run(['systemctl','reload','nginx'])
 # Drain/stop application writes before applying membership cleanup.
 run(['docker','compose','--project-directory',str(previous),'stop','backend','portal'])
 run(['docker','compose','--project-directory',str(release),'--profile','migration','run','--rm','migrator'])
 run(['docker','compose','--project-directory',str(release),'up','-d','--no-build','--pull','never','backend','portal'])
 healthy();switch(release)
 for name,expected in gate['staticFiles'].items():
  with urllib.request.urlopen('https://www.student.bnbusports.cn/'+name+'?release='+gate['sourceCommit'][:12],timeout=30) as response:
   assert response.status==200 and hashlib.sha256(response.read()).hexdigest()==expected
 for url in ['https://www.student.bnbusports.cn/api/v1/health/ready','https://www.teacher.bnbusports.cn/']:
  with urllib.request.urlopen(url,timeout=30) as response:assert response.status==200
except Exception:
 switch(previous)
 run(['docker','compose','--project-directory',str(previous),'up','-d','--no-build','--pull','never','backend','portal'])
 healthy();site.write_text(oldNginx);run(['nginx','-t']);run(['systemctl','reload','nginx'])
 raise
# Membership cleanup is effective after migration. Prefer forward corrections;
# database restoration requires a separate assessment of later business writes.
site.write_text(oldNginx);run(['nginx','-t']);run(['systemctl','reload','nginx'])
result=dict(check='MEMBERSHIP_APPLICATION_DEPLOYMENT',result='PASS',sourceCommit=gate['sourceCommit'],release=str(release),previous=str(previous),staticFilesVerified=len(gate['staticFiles']),images=gate['images'],writesResumed=True)
(work/'deployment-result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
