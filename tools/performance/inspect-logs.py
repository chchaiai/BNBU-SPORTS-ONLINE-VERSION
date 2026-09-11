"""Read existing HTTP logs; emit aggregates and slow/error metadata only."""
import collections,datetime,json,pathlib,statistics,sys
start=sys.argv[1];end=sys.argv[2]
groups=collections.defaultdict(list); slow=[]; count=0
for path in pathlib.Path('/var/lib/bnbu-sports-production/runtime-logs').glob('*.ndjson'):
 with path.open() as f:
  for line in f:
   try:r=json.loads(line)
   except ValueError:continue
   stamp=r.get('timestamp',r.get('time',''))
   if not isinstance(stamp,str) or not start<=stamp<end:continue
   count+=1; op=r.get('operationId','unknown');groups[op].append(r)
   if r.get('durationMs',0)>1000 or r.get('statusCode',200)>=500:
    slow.append({k:r.get(k) for k in ['timestamp','operationId','statusCode','durationMs','errorCode']})
out={'start':start,'end':end,'requests':count,'operations':{},'slowOrErrors':slow}
for op,rows in groups.items():
 times=sorted(r.get('durationMs',0) for r in rows)
 out['operations'][op]={'requests':len(rows),'statuses':dict(collections.Counter(r.get('statusCode') for r in rows)),'maxMs':max(times),'p95Ms':times[min(len(times)-1,int(len(times)*.95))]}
print(json.dumps(out,indent=2))
