"""Read container logs privately and emit only correlation counts for synthetic requests."""
import json,subprocess
from pathlib import Path
root=Path('/home/ubuntu/bnbu-demand-20260916')
report=json.loads((root/'http-result.json').read_text())
ids=[x['requestId'] for x in report['checks'] if x.get('requirement')==12]
logs=subprocess.run(['docker','logs','--since','1h','bnbu-sports-production-backend-1'],capture_output=True,text=True,check=True)
text=logs.stdout+logs.stderr
result=[{'requestId':i,'matchingLines':sum(i in line for line in text.splitlines())} for i in ids]
assert ids and all(x['matchingLines']>0 for x in result)
print(json.dumps({'result':'PASS','correlations':result}))
