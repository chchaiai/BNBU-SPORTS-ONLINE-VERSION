"""Compare the current validated build to the read-only production snapshot."""
import hashlib, json
from pathlib import Path
root=Path(__file__).resolve().parents[2]
evidence=root/'evidence/demand-20260916'
base=evidence/'production-baseline'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
result={}
for area,local,remote in [('backend',root/'backend/dist',base/'backend/dist'),('student',root/'BNBU-Sports-Web-new/frontend/student',base/'web/student')]:
    changes=[]
    for p in local.rglob('*'):
        if not p.is_file():continue
        name=p.relative_to(local).as_posix()
        if area=='backend' and not (name.endswith('.js') or name.endswith('.json')):continue
        if area=='student' and not (name=='index.html' or name.startswith('js/') and name.endswith('.js')):continue
        old=remote/name
        if old.exists() and old.read_bytes().replace(b'\r\n',b'\n')==p.read_bytes().replace(b'\r\n',b'\n'):continue
        if not old.exists() or sha(old)!=sha(p):changes.append({'path':name,'before':sha(old) if old.exists() else None,'after':sha(p)})
    result[area]=changes
(evidence/'production-diff.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
