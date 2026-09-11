import csv,json,pathlib,statistics,datetime
root=pathlib.Path('docs/performance/evidence-20260911')
rows=[]
for p in sorted(root.glob('*/summary.json')):
 s=json.loads(p.read_text()); monitors=[json.loads(x) for x in (p.parent/'monitor.jsonl').read_text().splitlines()]
 cpu=[m['cpuPct'] for m in monitors[1:]] or [0]
 memory=[m['availableMiB'] for m in monitors]
 backend=[float(c['CPUPerc'].rstrip('%')) for m in monitors for c in m.get('containers',[]) if c['Name']=='bnbu-sports-production-backend-1']
 connections=[sum(a['connections'] for a in m.get('db',{}).get('activity',[]) if a['usename']=='bnbusports_app') for m in monitors]
 active=[sum(a['connections'] for a in m.get('db',{}).get('activity',[]) if a['usename']=='bnbusports_app' and a['state']!='idle') for m in monitors]
 internal=[a['ms'] for m in monitors for a in m.get('internalApi',[])]
 windows=[json.loads(x) for x in (p.parent/'windows.jsonl').read_text().splitlines()] if (p.parent/'windows.jsonl').exists() else []
 requests=[json.loads(x) for x in (p.parent/'requests.jsonl').read_text().splitlines()]
 network=[]
 for a,b in zip(monitors,monitors[1:]):
  dt=(datetime.datetime.fromisoformat(b['time'])-datetime.datetime.fromisoformat(a['time'])).total_seconds()
  if dt>0:network.append((b['net']['eth0']['tx']-a['net']['eth0']['tx'])*8/dt/1000000)
 row={k:s[k] for k in ['runId','mode','vus','thinkMs','elapsed','requests','errors','p50','p95','p99','rps','peakInflight','stopped']}
 row.update(cpuAvg=round(statistics.mean(cpu),2),cpuMax=max(cpu),backendCpuMax=max(backend,default=0),availableMiBMin=min(memory,default=0),appConnectionsMax=max(connections,default=0),activeConnectionsMax=max(active,default=0),internalApiMaxMs=max(internal,default=0),windowRpsMax=max([w['requests']/10 for w in windows],default=0))
 row.update(hostTxMbitMax=round(max(network,default=0),3),responsePayloadMbitAvg=round(sum(r['bytes'] for r in requests)*8/s['elapsed']/1000000,3))
 rows.append(row)
(root/'aggregate.json').write_text(json.dumps(rows,indent=2))
with (root/'stages.csv').open('w',newline='',encoding='utf-8') as f:
 writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
for row in rows:
 if row['mode']=='stage':print(json.dumps(row))
