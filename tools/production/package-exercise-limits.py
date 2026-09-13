"""Package only committed student changes and the three verified local images."""
import gzip,hashlib,json,shutil,subprocess,tarfile
from pathlib import Path
root=Path(__file__).resolve().parents[2];out=root/'.local/exercise-limits-deploy';out.mkdir(exist_ok=True)
def git(*args):return subprocess.check_output(['git',*args],cwd=root,text=True).strip()
commit=git('rev-parse','HEAD')
paths=git('diff','--name-only','6e15ad467f568b03fc5fadc611d96d3776cc065b',commit,'--','BNBU-Sports-Web-new/frontend/student/').splitlines()
def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as stream:
  for data in iter(lambda:stream.read(1024*1024),b''):h.update(data)
 return h.hexdigest()
static={}
with tarfile.open(out/'static.tar','w') as archive:
 for name in paths:
  assert name.startswith('BNBU-Sports-Web-new/frontend/student/')
  relative=name.removeprefix('BNBU-Sports-Web-new/frontend/')
  static[relative]=digest(root/name);archive.add(root/name,arcname=relative,recursive=False)
with (root/'.local/exercise-limits-images.tar').open('rb') as source,gzip.open(out/'images.tar.gz','wb',compresslevel=1) as destination:shutil.copyfileobj(source,destination,1024*1024)
images={service:subprocess.check_output(['docker','image','inspect','--format','{{.Id}}',f'bnbu-{service}-production:exercise-limits-20260912'],text=True).strip() for service in ['backend','portal','migrator']}
gate={'localResult':'PASS','sourceCommit':commit,'staticFiles':static,'archives':{name:digest(out/name) for name in ['static.tar','images.tar.gz']},'images':images}
(out/'validation.json').write_text(json.dumps(gate,indent=2))
print(json.dumps({'check':'RELEASE_PACKAGE_READY','sourceCommit':commit,'staticFileCount':len(static),'imageArchiveBytes':(out/'images.tar.gz').stat().st_size}))
