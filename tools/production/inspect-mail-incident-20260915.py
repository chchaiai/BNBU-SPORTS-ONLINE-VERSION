"""Read-only diagnosis of one user-supplied request; never emit OTP or recipient data."""
import json
from pathlib import Path
import subprocess

REQUEST = '01a0a3a9-4de4-7443-81e4-09603e38504d'
js = r"""
await import('reflect-metadata');
const {loadRuntimeSecrets}=await import('./dist/common/config/file-json-secret-loader.js');
const {validateEnvironment}=await import('./dist/common/config/environment.js');
const {PrismaService}=await import('./dist/common/database/prisma.service.js');
await loadRuntimeSecrets(process.env);
const config=validateEnvironment(process.env).RUNTIME_CONFIG;
const db=new PrismaService(config);
try {
 const result=await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '10s'");
  return tx.studentSignInChallenge.findMany({
   where:{requestId:'01a0a3a9-4de4-7443-81e4-09603e38504d'},
   select:{id:true,status:true,requestedAt:true,deliveredAt:true,expiresAt:true,consumedAt:true,failedAttempts:true}
  });
 },{timeout:15000});
 console.log(JSON.stringify({challenge:result,currentProvider:config.emailDelivery?.provider,
  currentTemplate:config.emailDelivery?.templateId,checkedAt:new Date().toISOString()}));
} finally {await db.$disconnect();}
"""
subprocess.run(['docker','exec','-i','bnbu-sports-production-backend-1','node','--input-type=module'],input=js,text=True,check=True)
groups = {}
target = []
for path in Path('/var/lib/bnbu-sports-production/runtime-logs').glob('http*.ndjson'):
    for line in path.open():
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if row.get('requestId') == REQUEST:
            target.append(row)
        stamp = row.get('time', '')
        window = 'incident_1400_1405' if '2026-09-15T06:00' <= stamp < '2026-09-15T06:05' else 'after_1425' if stamp >= '2026-09-15T06:25' else None
        if window and row.get('operationId') == 'requestStudentSignInCode':
            key = (window, row.get('statusCode'))
            groups[key] = groups.get(key, 0) + 1
print(json.dumps({'request':target,'loginCodeCounts':[{'window':w,'status':s,'count':c} for (w,s),c in groups.items()]}))
