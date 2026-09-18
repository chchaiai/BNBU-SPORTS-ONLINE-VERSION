import json,subprocess,urllib.request,datetime
out=lambda a:subprocess.check_output(a,text=True).strip()
current=out(['readlink','-f','/opt/bnbu-sports-production/current']);assert current.endswith('/deep-review-retry-20260918')
containers={name:json.loads(out(['docker','inspect',f'bnbu-sports-production-{name}-1']))[0] for name in ['backend','portal']}
result={'result':'PASS','release':current,'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'containers':{n:{'healthy':c['State']['Health']['Status'],'restarts':c['RestartCount'],'image':c['Image']} for n,c in containers.items()}}
assert all(v['healthy']=='healthy' and v['restarts']==0 for v in result['containers'].values())
log=subprocess.run(['docker','logs','--since',containers['backend']['State']['StartedAt'],'bnbu-sports-production-backend-1'],capture_output=True,text=True,check=True)
errors=[]
for line in (log.stdout+'\n'+log.stderr).splitlines():
 try:
  row=json.loads(line)
  if isinstance(row.get('level'),int) and row['level']>=50:errors.append(row)
 except ValueError:pass
result['backendErrorLogCountSinceRestart']=len(errors)
assert not errors
result['workerFailureMarkers']=sum(any(code in line for code in ['SESSION_AUTO_COMPLETE_FAILED','MEDIA_WORKER_POLL_FAILED','VIDEO_WORKSPACE_CAPACITY_FAILED']) for line in (log.stdout+'\n'+log.stderr).splitlines())
assert result['workerFailureMarkers']==0
for domain in ['www.student.bnbusports.cn','www.teacher.bnbusports.cn']:
 with urllib.request.urlopen('https://'+domain+'/api/v1/health/ready',timeout=20) as response:assert response.status==200
print(json.dumps(result))
