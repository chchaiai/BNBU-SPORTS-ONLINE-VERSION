"""Pinned follow-up for retryable submission computation failures."""
import datetime,hashlib,json,os,pathlib,re,shutil,subprocess,time,urllib.request,urllib.error
assert os.geteuid()==0
base=pathlib.Path('/opt/bnbu-sports-production')
work=pathlib.Path('/home/ubuntu/bnbu-deep-review-20260918/retry')
previous=base/'releases/deep-review-20260918'
release=base/'releases/deep-review-retry-20260918'
gate=json.loads((work/'validation.json').read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
out=lambda args:subprocess.check_output(args,text=True).strip()
run=lambda args:subprocess.run(args,check=True)
def baseline():
 assert (base/'current').resolve()==previous
 assert out(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-backend-1'])==gate['previousImage']
 original=json.loads((previous/'deep-review-manifest.json').read_text())
 for item in original['runtime']:
  assert out(['docker','exec','bnbu-sports-production-backend-1','sha256sum','/app/dist/'+item['path']]).split()[0]==item['after']
 for item in original['web']:assert sha(previous/'web/student'/item['path'])==item['after']
 assert sha(previous/'production.env')==original['productionEnvSha256']
 return original
def start(target):
 run(['docker','compose','--project-directory',str(target),'up','-d','--no-deps','--no-build','--pull','never','backend'])
 for _ in range(90):
  if out(['docker','inspect','--format','{{.State.Health.Status}}','bnbu-sports-production-backend-1'])=='healthy':return
  time.sleep(1)
 raise RuntimeError('Backend health timeout')
def switch(target):
 link=base/'current-deep-review-retry-tmp';assert not link.exists() and not link.is_symlink()
 link.symlink_to(target);os.replace(link,base/'current')
def http(url,expected=200):
 try:response=urllib.request.urlopen(url,timeout=25)
 except urllib.error.HTTPError as error:response=error
 with response:assert response.status==expected;return response.read()
original=baseline();assert not release.exists()
for name,digest in gate['files'].items():
 path=(work/name).resolve(strict=True);assert path.is_relative_to(work) and sha(path)==digest
tag='bnbu-backend-production:deep-review-retry-20260918'
with (work/'build.log').open('w') as log:subprocess.run(['docker','build','--pull=false','-t',tag,str(work/'backend')],check=True,stdout=log,stderr=subprocess.STDOUT)
image=out(['docker','image','inspect','--format','{{.Id}}',tag])
assert out(['docker','run','--rm','--network','none','--read-only','--memory','256m','--entrypoint','node',image,'--input-type=module','-e',"const m=await import('./dist/modules/exercise-records/application/exercise-records.service.js');if(typeof m.ExerciseRecordsService!=='function')process.exit(1);console.log('IMPORT_PASS')"])=='IMPORT_PASS'
baseline();shutil.copytree(previous,release)
content,n=re.subn(r'(?m)^BACKEND_IMAGE=.*$','BACKEND_IMAGE='+image,(release/'.env').read_text());assert n==1;(release/'.env').write_text(content)
assert sha(previous/'compose.yml')==sha(release/'compose.yml')
assert sha(previous/'production.env')==sha(release/'production.env')
shutil.copyfile(work/'validation.json',release/'deep-review-retry-manifest.json')
backup=json.loads(out(['python3','/home/ubuntu/bnbu-deep-review-20260918/bundle/backup.py']));assert backup['result']=='PASS'
baseline()
try:
 start(release);switch(release)
 for item in original['runtime']:
  expected=gate['runtimeAfter'] if item['path']==gate['runtimePath'] else item['after']
  assert out(['docker','exec','bnbu-sports-production-backend-1','sha256sum','/app/dist/'+item['path']]).split()[0]==expected
 for item in original['web']:
  assert hashlib.sha256(http('https://www.student.bnbusports.cn/student/'+item['path']+'?verify=deep-review-retry-20260918')).hexdigest()==item['after']
 for domain in ['www.student.bnbusports.cn','www.teacher.bnbusports.cn']:http('https://'+domain+'/api/v1/health/ready')
 http('https://www.student.bnbusports.cn/api/v1/exercise-sessions/recoverable',401)
 assert out(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-portal-1'])==original['baseImages']['portal']
 result={'result':'PASS','checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'release':str(release),'previous':str(previous),'backendImage':image,'runtimeHashes':len(original['runtime']),'studentHashes':len(original['web']),'health':'PASS','backup':backup,'sourceHead':gate['sourceHead'],'sourceManifestSha256':gate['sourceManifestSha256'],'migrations':0,'historicalRewrites':0}
 (work/'deployment.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
except Exception:
 switch(previous);start(previous);raise
