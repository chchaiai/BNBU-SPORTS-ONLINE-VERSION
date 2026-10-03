import assert from 'node:assert/strict';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
import {V81AdminCourseDirectoryService as Candidate} from '/app/dist/modules/v8/v81-admin-course-directory.js';
import {V81AdminCourseDirectoryService as Previous} from '/app/dist/modules/v8/v81-admin-course-directory-before.js';
await loadRuntimeSecrets(process.env);
const db=new PrismaService(validateEnvironment(process.env).RUNTIME_CONFIG);
try {
  const report=await db.$transaction(async tx=>{
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await tx.$executeRaw`SET LOCAL statement_timeout = '10s'`;
    const admins=await tx.$queryRaw`SELECT a.user_id AS "userId",a.organization_id AS "organizationId" FROM v81_admin_access a JOIN users u ON u.id=a.user_id AND u.organization_id=a.organization_id WHERE a.kind='SUPER' AND a.must_change_password=false AND u.status='ACTIVE' AND u.deleted_at IS NULL AND EXISTS(SELECT 1 FROM class_sections s WHERE s.organization_id=a.organization_id AND s.id='01a09ecc-3cfc-7129-889d-9cb021b26fb8'::uuid) ORDER BY a.user_id LIMIT 1`;
    assert.equal(admins.length,1);
    const principal={...admins[0],role:'ADMIN'};
    const adapter={$transaction:run=>run(tx)}, clock={now:()=>new Date('2026-10-02T00:00:00Z')};
    const candidate=await new Candidate(adapter,clock).get(principal);
    const previous=await new Previous(adapter,clock).get(principal);
    const fields=['minimumMinutes','maximumMinutes','weeklyLimit','dailyLimit'];
    const stripped={...candidate,rows:candidate.rows.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>!fields.includes(key))))};
    assert.deepEqual(stripped,previous,'Existing directory data must stay identical');
    const rules=await tx.$queryRaw`SELECT class_section_id::text AS id,minimum_minutes AS "minimumMinutes",COALESCE(maximum_minutes,GREATEST(60,minimum_minutes)) AS "maximumMinutes",weekly_limit AS "weeklyLimit",daily_limit AS "dailyLimit" FROM v81_course_rules WHERE organization_id=${principal.organizationId}::uuid AND published_at IS NOT NULL`;
    let published=0,unpublished=0;
    for(const row of candidate.rows){
      const rule=rules.find(rule=>rule.id===row.id);
      for(const field of fields){assert.ok(Object.hasOwn(row,field));assert.equal(row[field],rule?.[field]??null);}
      if(rule) {published++;for(const field of fields)assert.ok(Number.isInteger(row[field])&&row[field]>0);}
      else unpublished++;
    }
    assert.ok(published>0);
    await assert.rejects(new Candidate(adapter,clock).get({...principal,role:'STUDENT'}));
    return {result:'PASS',actualRuntimeQueryVerified:true,courses:candidate.rows.length,published,unpublished,allFourFieldsMatchStoredRules:true,existingDirectoryUnchanged:true,readOnly:true,nonAdminRejected:true};
  },{isolationLevel:'RepeatableRead',timeout:45000});
  console.log(JSON.stringify(report));
} finally {await db.$disconnect();}
