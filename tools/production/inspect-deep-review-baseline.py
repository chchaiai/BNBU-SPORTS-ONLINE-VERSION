"""Read-only release inventory. Exports application artifacts, never secrets or student data."""
import json, pathlib, subprocess, tarfile, io
base=pathlib.Path('/opt/bnbu-sports-production/current').resolve()
out=lambda args:subprocess.check_output(args,text=True).strip()
env=dict(line.split('=',1) for line in (base/'.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
images={name:out(['docker','inspect','--format','{{.Image}}',f'bnbu-sports-production-{name}-1']) for name in ['backend','portal']}
images['migrator']=out(['docker','image','inspect','--format','{{.Id}}',env['MIGRATOR_IMAGE']])
import hashlib
result={'release':base.name,'baseImages':images,'composeSha256':hashlib.sha256((base/'compose.yml').read_bytes()).hexdigest(),'productionEnvSha256':hashlib.sha256((base/'production.env').read_bytes()).hexdigest()}
target=pathlib.Path('/home/ubuntu/deep-review-baseline-20260918.tar')
assert not target.exists()
with tarfile.open(target,'w') as tar:
 raw=subprocess.check_output(['docker','cp','bnbu-sports-production-backend-1:/app/dist','-'])
 with tarfile.open(fileobj=io.BytesIO(raw)) as source:
  for item in source:
   if item.isfile():item.name='backend/'+item.name;tar.addfile(item,source.extractfile(item))
 for name in ['js/api.js','js/app.js','js/screens/checkin.js','js/screens/notifications.js']:
  tar.add(base/'web/student'/name,arcname='web/student/'+name)
 data=json.dumps(result,indent=2).encode();info=tarfile.TarInfo('baseline.json');info.size=len(data);tar.addfile(info,io.BytesIO(data))
print(json.dumps(result))
