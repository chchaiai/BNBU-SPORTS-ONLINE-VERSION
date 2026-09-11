import json,pathlib,subprocess,time
def run(args):return subprocess.check_output(args,text=True,timeout=15).strip()
result={'time':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'hostname':run(['hostname']),'cpus':run(['nproc']),'memory':run(['free','-m']),'disk':run(['df','-h','/']),'release':str(pathlib.Path('/opt/bnbu-sports-production/current').resolve()),'dockerVersion':run(['docker','--version']),'nginx':{}}
for p in ['/etc/nginx/nginx.conf','/etc/nginx/sites-available/bnbu-staging-hk.conf']:
 result['nginx'][p]=pathlib.Path(p).read_text()
result['dockerConfig']=pathlib.Path('/etc/docker/daemon.json').read_text()
result['containers']=[]
for name in ['bnbu-sports-production-backend-1','bnbu-sports-production-portal-1']:
 c=json.loads(run(['docker','inspect',name]))[0]
 env=dict(x.split('=',1) for x in c['Config']['Env'])
 allow=['APP_VERSION','APP_ENV','REQUEST_TIMEOUT_MS','AUTH_RATE_LIMIT_WINDOW_SECONDS','AUTH_RATE_LIMIT_MAX_ATTEMPTS','MEDIA_WORKER_POLL_MS','MEDIA_WORKER_ENABLED','OCR_WORKER_ENABLED','OCR_PROVIDER']
 result['containers'].append({'name':name,'image':c['Image'],'configImage':c['Config']['Image'],'startedAt':c['State']['StartedAt'],'restartCount':c['RestartCount'],'oomKilled':c['State']['OOMKilled'],'health':c['State'].get('Health',{}).get('Status'),'memory':c['HostConfig']['Memory'],'nanoCpus':c['HostConfig']['NanoCpus'],'pidsLimit':c['HostConfig']['PidsLimit'],'env':{k:env[k] for k in allow if k in env},'fdCount':len(list(pathlib.Path('/proc/'+str(c['State']['Pid'])+'/fd').iterdir()))})
result['tcpSummary']=run(['ss','-s'])
result['tcpCounters']=pathlib.Path('/proc/net/snmp').read_text()
result['scanner']=[l for l in pathlib.Path('/etc/clamav/clamd.conf').read_text().splitlines() if l.startswith(('MaxThreads','MaxQueue','MaxScanSize','MaxFileSize'))]
print(json.dumps(result,indent=2))
