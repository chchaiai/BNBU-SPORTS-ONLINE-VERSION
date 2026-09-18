"""Pinned review remediation release. No migration or historical-data rewrite."""
import hashlib,json,os,pathlib,re,shutil,subprocess,sys,time,urllib.request,urllib.error
assert os.geteuid()==0 and sys.argv[1:] in [['--prepare'],['--apply'],['--rollback']]
base=pathlib.Path('/opt/bnbu-sports-production');work=pathlib.Path('/home/ubuntu/bnbu-deep-review-20260918/bundle')
gate=json.loads((work/'validation.json').read_text());previous=base/'releases'/gate['release'];release=base/'releases/deep-review-20260918'
media=pathlib.Path('/var/lib/bnbu-sports-production/media-work');tag='bnbu-backend-production:deep-review-20260918'
out=lambda args:subprocess.check_output(args,text=True).strip()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def run(args):subprocess.run(args,check=True)
def baseline():
 assert (base/'current').resolve()==previous
 assert sha(previous/'compose.yml')==gate['composeSha256'] and sha(previous/'production.env')==gate['productionEnvSha256']
 for service in ['backend','portal']:assert out(['docker','inspect','--format','{{.Image}}',f'bnbu-sports-production-{service}-1'])==gate['baseImages'][service]
 for item in gate['runtime']:
  if item['before']:assert out(['docker','exec','bnbu-sports-production-backend-1','sha256sum','/app/dist/'+item['path']]).split()[0]==item['before'],item['path']
 for item in gate['web']:assert sha(previous/'web/student'/item['path'])==item['before'],item['path']
def switch(target):
 link=base/'current-deep-review-tmp';assert not link.exists() and not link.is_symlink();link.symlink_to(target);os.replace(link,base/'current')
def start(target):
 run(['docker','compose','--project-directory',str(target),'up','-d','--no-deps','--no-build','--pull','never','backend'])
 for _ in range(90):
  if out(['docker','inspect','--format','{{.State.Health.Status}}','bnbu-sports-production-backend-1'])=='healthy':return
  time.sleep(1)
 raise RuntimeError('Backend health timeout')
def http(url,expected=200):
 try:r=urllib.request.urlopen(url,timeout=25)
 except urllib.error.HTTPError as error:r=error
 with r:assert r.status==expected,(url,r.status);return r.read()
if sys.argv[1]=='--rollback':
 assert (base/'current').resolve()==release;switch(previous);start(previous);print(json.dumps({'result':'ROLLED_BACK','release':str(previous)}));raise SystemExit
baseline()
for name,digest in gate['files'].items():
 p=(work/name).resolve(strict=True);assert p.is_relative_to(work) and sha(p)==digest,name
if sys.argv[1]=='--prepare':
 assert not release.exists()
 if not media.exists():media.mkdir(mode=0o750);os.chown(media,10001,10001)
 assert media.is_dir() and not media.is_symlink() and media.stat().st_uid==10001
 assert shutil.disk_usage(media).free>2*1024**3
 run(['docker','tag',gate['baseImages']['backend'],'bnbu-backend-deep-review-base:20260918'])
 with (work/'build.log').open('w') as log:subprocess.run(['docker','build','--pull=false','-t',tag,str(work/'backend')],check=True,stdout=log,stderr=subprocess.STDOUT)
 image=out(['docker','image','inspect','--format','{{.Id}}',tag])
 candidate=json.loads(out(['docker','run','--rm','--network','none','--read-only','--cpus','1','--memory','768m','--pids-limit','128','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,nosuid,nodev,size=64m','-v',str(media)+':/work','-v',str(work/'candidate.mjs')+':/app/deep-review-probe.mjs:ro','-e','MEDIA_WORK_DIRECTORY=/work','--entrypoint','node',image,'/app/deep-review-probe.mjs']))
 assert candidate['result']=='PASS';(work/'candidate.json').write_text(json.dumps(candidate,indent=2))
 low=out(['docker','run','--rm','--network','none','--read-only','--memory','256m','--tmpfs','/limited:rw,size=64m','-e','MEDIA_WORK_DIRECTORY=/limited','--entrypoint','node',image,'--input-type=module','-e',"const {checkVideoWorkspace}=await import('./dist/modules/media/application/video-normalizer.js');try{await checkVideoWorkspace();process.exit(1)}catch(e){if(e.message!=='VIDEO_WORKSPACE_CAPACITY_FAILED')throw e;console.log('CAPACITY_GUARD_PASS')} "])
 assert low=='CAPACITY_GUARD_PASS';baseline();shutil.copytree(previous,release)
 content,n=re.subn(r'(?m)^BACKEND_IMAGE=.*$','BACKEND_IMAGE='+image,(release/'.env').read_text());assert n==1;(release/'.env').write_text(content)
 compose=(release/'compose.yml').read_text();startpos=compose.index('  backend:');endpos=compose.index('  portal:',startpos);part=compose[startpos:endpos]
 assert '    environment:' not in part and part.count('    volumes:')==1
 part=part.replace('    volumes:', '    environment:\n      MEDIA_WORK_DIRECTORY: /var/lib/bnbu-media-work\n    volumes:\n      - '+str(media)+':/var/lib/bnbu-media-work',1)
 (release/'compose.yml').write_text(compose[:startpos]+part+compose[endpos:])
 for item in gate['web']:shutil.copyfile(work/'web/student'/item['path'],release/'web/student'/item['path'])
 assert sha(release/'production.env')==gate['productionEnvSha256']
 shutil.copyfile(work/'validation.json',release/'deep-review-manifest.json')
 (work/'prepared.json').write_text(json.dumps({'image':image}));print(json.dumps({'result':'PREPARED','image':image,'candidate':candidate,'capacityGuard':low}));raise SystemExit
image=json.loads((work/'prepared.json').read_text())['image'];assert out(['docker','image','inspect','--format','{{.Id}}',tag])==image
backup=json.loads(out(['python3',str(work/'backup.py')]));assert backup['result']=='PASS';(work/'backup.json').write_text(json.dumps(backup));baseline()
try:
 start(release);switch(release)
 for item in gate['runtime']:assert out(['docker','exec','bnbu-sports-production-backend-1','sha256sum','/app/dist/'+item['path']]).split()[0]==item['after'],item['path']
 for item in gate['web']:assert hashlib.sha256(http('https://www.student.bnbusports.cn/student/'+item['path']+'?verify=deep-review-20260918')).hexdigest()==item['after'],item['path']
 for url in ['https://www.teacher.bnbusports.cn/','https://www.student.bnbusports.cn/student/','https://www.teacher.bnbusports.cn/api/v1/health/ready','https://www.student.bnbusports.cn/api/v1/health/ready']:http(url)
 http('https://www.student.bnbusports.cn/api/v1/exercise-sessions/recoverable',401)
 assert out(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-portal-1'])==gate['baseImages']['portal']
 mounts=json.loads(out(['docker','inspect','--format','{{json .Mounts}}','bnbu-sports-production-backend-1']))
 assert any(m['Source']==str(media) and m['Destination']=='/var/lib/bnbu-media-work' and m['RW'] for m in mounts)
 result={'result':'PASS','previous':str(previous),'release':str(release),'backendImage':image,'runtimeHashes':len(gate['runtime']),'studentHashes':len(gate['web']),'health':'PASS','recoveryUnauthenticated':401,'mediaDiskMounted':True,'migrations':0,'historicalRewrites':0,'backup':backup,'sourceHead':gate['sourceHead'],'sourceManifestSha256':gate['sourceManifestSha256']}
 (work/'deployment.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
except Exception:
 switch(previous);start(previous);raise
