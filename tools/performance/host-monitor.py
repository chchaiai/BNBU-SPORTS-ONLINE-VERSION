"""Read-only bounded host sampler, aggregates only. Run through SSH, no daemon."""
import json,pathlib,subprocess,time,urllib.request
work=pathlib.Path('/home/ubuntu/bnbu-performance-20260911/private')
def run(args): return subprocess.check_output(args,text=True,timeout=8).strip()
def cpu(): return list(map(int,pathlib.Path('/proc/stat').read_text().splitlines()[0].split()[1:]))
prev=cpu(); previous_time=time.monotonic(); netprev=None
end=time.monotonic()+3600
while time.monotonic()<end:
 start=time.monotonic(); current=cpu(); delta=[a-b for a,b in zip(current,prev)]; prev=current
 mem={x.split(':')[0]:int(x.split()[1]) for x in pathlib.Path('/proc/meminfo').read_text().splitlines()}
 net={}
 for line in pathlib.Path('/proc/net/dev').read_text().splitlines()[2:]:
  name,data=line.split(':'); values=list(map(int,data.split()))
  if name.strip()!='lo': net[name.strip()]={'rx':values[0],'tx':values[8],'rxDrop':values[3],'txDrop':values[11]}
 result={'time':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'cpuPct':round(100*(sum(delta)-delta[3]-delta[4])/max(1,sum(delta)),2),'iowaitPct':round(100*delta[4]/max(1,sum(delta)),2),'availableMiB':mem['MemAvailable']/1024,'net':net,'load':pathlib.Path('/proc/loadavg').read_text().strip()}
 try:
  result['containers']=[json.loads(line) for line in run(['docker','stats','--no-stream','--format','{{json .}}']).splitlines()]
  result['state']=run(['docker','inspect','--format','{{.Name}} {{.RestartCount}} {{.State.OOMKilled}} {{.State.Health.Status}}','bnbu-sports-production-backend-1','bnbu-sports-production-portal-1'])
  result['db']=json.loads((work/'db-latest.json').read_text())
  t=time.monotonic()
  with urllib.request.urlopen('http://127.0.0.1:3000/api/v1/health/ready',timeout=3) as r: result['health']=r.status
  result['healthMs']=round((time.monotonic()-t)*1000,2)
  private=json.loads((work/'private.json').read_text())
  result['internalApi']=[]
  for route,token in [('/student-progress?limit=20',private['students'][0]['token']),('/enrollments?classSectionId='+private['fixture']['teacherAActiveSectionId']+'&limit=20',private['teacherToken'])]:
   t=time.monotonic()
   request=urllib.request.Request('http://127.0.0.1:3000/api/v1'+route,headers={'Authorization':'Bearer '+token})
   with urllib.request.urlopen(request,timeout=3) as r:
    size=len(r.read())
    result['internalApi'].append({'route':route.split('?')[0],'status':r.status,'ms':round((time.monotonic()-t)*1000,2),'bytes':size})
 except Exception as e: result['error']=type(e).__name__
 print(json.dumps(result),flush=True)
 time.sleep(max(0,5-(time.monotonic()-start)))
