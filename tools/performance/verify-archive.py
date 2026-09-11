import hashlib,json,pathlib,re,datetime
root=pathlib.Path('docs/performance/evidence-20260911')
baseline=json.loads((root/'host-baseline.json').read_text(encoding='utf-8-sig'))
final=json.loads((root/'host-final.json').read_text(encoding='utf-8-sig'))
checks={'releaseUnchanged':baseline['release']==final['release'],'nginxUnchanged':baseline['nginx']==final['nginx'],'dockerConfigUnchanged':baseline['dockerConfig']==final['dockerConfig']}
for a,b in zip(baseline['containers'],final['containers']):
 for key in ['name','image','startedAt','restartCount','oomKilled','health','memory','nanoCpus','pidsLimit','env']:
  checks[a['name']+'/'+key]=a[key]==b[key]
db=json.loads((root/'db-final.json').read_text(encoding='utf-8-sig'))
checks['fixtureAccountsInactive']=db['fixture'][0]['active_users']==0
checks['fixtureNoOpenSessions']=db['fixture'][0]['open_sessions']==0
checks['historyPreserved']=db['fixture'][0]['records']==2000
http=json.loads((root/'recovery-http.json').read_text())
checks['publicRecovery']=all(r['pass'] for r in http)
assert all(checks.values()),checks
result={'time':final['time'],'checks':checks,'result':'PASS','finalMemory':final['memory'],'finalDisk':final['disk'],'databaseFixture':db['fixture']}
(root/'recovery-state.json').write_text(json.dumps(result,indent=2),newline='\n')
patterns=[re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),re.compile(rb'eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}'),re.compile(rb'postgres(?:ql)?://[^\s"\x27]+:[^\s"\x27]+@')]
paths=[p for d in ['docs/performance','tools/performance'] for p in pathlib.Path(d).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.name!='SHA256SUMS.txt']
for p in paths:
 data=p.read_bytes()
 assert not any(pattern.search(data) for pattern in patterns),'Potential credential in '+str(p)
(root/'SHA256SUMS.txt').write_text('\n'.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.as_posix() for p in sorted(paths))+'\n',newline='\n')
print(json.dumps({'recovery':'PASS','credentialPatternScan':'PASS','files':len(paths),'bytes':sum(p.stat().st_size for p in paths),'finalMemory':final['memory']}))
