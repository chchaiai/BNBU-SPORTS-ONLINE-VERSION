// Retain isolated synthetic audit evidence; disable only this task's test accounts.
import 'reflect-metadata';
import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';
import {loadRuntimeSecrets} from './dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from './dist/common/config/environment.js';import {PrismaService} from './dist/common/database/prisma.service.js';
await loadRuntimeSecrets(process.env);const config=validateEnvironment(process.env).RUNTIME_CONFIG,db=new PrismaService(config);
const f=JSON.parse(await readFile('/acceptance/ai-review-20260917.json','utf8'));
try{
 const ids=[f.fixture.organizationId,f.fixture.isolationOrganizationId];
 const orgs=await db.organization.findMany({where:{id:{in:ids}}});assert.equal(orgs.length,2);assert.ok(orgs.every(o=>/^(BNBU|ISOLATION)-TEST-AI17-/.test(o.organizationCode)));
 const count=await db.user.updateMany({where:{organizationId:{in:ids}},data:{status:'DISABLED',tokenVersion:{increment:1}}});
 const queue=await db.$queryRaw`SELECT status,count(*)::int AS count FROM v81_ai_review_jobs GROUP BY status ORDER BY status`;
 const budget=await db.v81AiReviewBudget.findUniqueOrThrow({where:{id:1}});
 const result={result:'PASS',syntheticUsersDisabled:count.count,syntheticOrganizations:ids,queue,budgetReservedFen:budget.reservedFen,applicationReservationLimitFen:config.aiReview.budgetFen,recordsRetainedForAudit:true};
 await writeFile('/acceptance/final-health.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await db.$disconnect();}
