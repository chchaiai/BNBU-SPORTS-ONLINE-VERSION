import assert from 'node:assert/strict';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
import {V81ManagementInsightsService} from '/app/dist/modules/v8/v81-management-insights.js';
import {displaySportName} from '/app/dist/modules/v8/domain/sport-display.js';
await loadRuntimeSecrets(process.env);const config=validateEnvironment(process.env).RUNTIME_CONFIG;
assert.equal(config.appEnvironment,'production');assert.equal(config.publicOrganizationCode,'BNBU');
const db=new PrismaService(config);
try {
 const org=await db.organization.findUniqueOrThrow({where:{organizationCode:'BNBU'}});
 const [admin]=await db.$queryRaw`SELECT a.user_id FROM v81_admin_access a JOIN users u ON u.id=a.user_id WHERE a.organization_id=${org.id}::uuid AND a.kind='SUPER' AND a.must_change_password=false AND u.status='ACTIVE' AND u.deleted_at IS NULL LIMIT 1`;
 assert.ok(admin);
 const readOnly={$transaction:(fn,options)=>db.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;return fn(tx);},options)};
 const service=new V81ManagementInsightsService(readOnly,null,{now:()=>new Date()},null);
 const p={userId:admin.user_id,organizationId:org.id,role:'ADMIN',sessionId:'read-only-verification'};
 const data=await service.insights(p,{}),sum=rows=>rows.reduce((n,r)=>n+r.value,0);
 for(const rows of [data.daily,data.sports,data.stages,data.classes,data.heatmap])assert.equal(sum(rows),data.summary.records);
 assert.equal(sum(data.frequency),data.summary.students);
 const teacher=await db.teacherProfile.findFirst({where:{organizationId:org.id,deletedAt:null},select:{id:true}});
 if(teacher){const details=await service.teacher(p,teacher.id);assert.ok(Number.isInteger(details.version));assert.equal(typeof details.remark,'string');}
 assert.equal(displaySportName('Wed','COURSE_RELATED','高尔夫(Wed)1004'),'高尔夫');
 const outbox=await db.$queryRaw`SELECT status,count(*)::int AS count,count(*) FILTER(WHERE attempts=0)::int AS never_attempted FROM outbox_events WHERE organization_id=${org.id}::uuid GROUP BY status ORDER BY status`;
 console.log(JSON.stringify({result:'PASS',verifiedAt:new Date().toISOString(),range:{from:data.from,to:data.to},summary:data.summary,
   chartTotalsReconciled:true,teacherDetailsReadable:!!teacher,outbox,productionBusinessWrites:0}));
}finally{await db.$disconnect();}
