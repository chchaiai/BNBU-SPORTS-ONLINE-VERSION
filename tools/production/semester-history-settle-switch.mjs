import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {v7 as uuidv7} from 'uuid';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
import {TokenService} from '/app/dist/modules/auth/token.service.js';
import {approvedRuleTemplate} from '/app/dist/modules/v8/domain/rule-template.js';
const f=JSON.parse(readFileSync('/acceptance/semester-history-fixture.json')).fixture;
const s=JSON.parse(readFileSync('/acceptance/semester-history-student.json'));
assert.equal(f.organizationId,'01a09918-10d0-75ae-93a0-a4bf948d2495');
const destination='/acceptance/semester-history-settlement-v2.json';assert.ok(!existsSync(destination));
await loadRuntimeSecrets(process.env);const config=validateEnvironment(process.env).RUNTIME_CONFIG;assert.equal(config.appEnvironment,'production');
const db=new PrismaService(config),checks=[],tokens={};let reportId,targetId;
async function api(path,role='teacher',body,status=body?201:200,key=randomUUID()){
 const response=await fetch('https://www.teacher.bnbusports.cn/api/v1'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+tokens[role],'content-type':'application/json','idempotency-key':key},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 const value=await response.json();assert.equal(response.status,status,JSON.stringify({path,status:response.status,code:value.code,checks:value.data?.checks}));return value.data;
}
try {
 const sessions=await db.$transaction(async tx=>{
  assert.equal(await tx.v81CourseRule.count({where:{classSectionId:s.sectionId}}),0);
  const now=new Date(),templateId=uuidv7(),published=new Date('2026-08-02T12:00:00Z');
  const values=[];
  for(const [role,userId] of [['teacher',f.teacherUserId],['admin',f.adminUserId]]){
   const before=await tx.user.findUniqueOrThrow({where:{id:userId}});assert.equal(before.organizationId,f.organizationId);assert.equal(before.status,'DISABLED');
   const user=await tx.user.update({where:{id:userId},data:{status:'ACTIVE'}});
   await tx.v81AccountSecurity.upsert({where:{userId},create:{userId,organizationId:f.organizationId,mustChangePassword:false,passwordChangedAt:now},update:{}});
   if(role==='admin')await tx.v81AdminAccess.create({data:{userId,organizationId:f.organizationId,kind:'SUPER',permissions:[],mustChangePassword:false}});
   const sessionId=uuidv7();await tx.authSession.create({data:{id:sessionId,organizationId:f.organizationId,userId,status:'ACTIVE',tokenFamilyId:uuidv7(),createdAt:now,lastSeenAt:now,absoluteExpiresAt:new Date(+now+600000),idleExpiresAt:new Date(+now+600000)}});
   values.push({role,user,sessionId});
  }
  await tx.$executeRaw`INSERT INTO v81_rule_templates(id,organization_id,version,display_name,rules,actor_id,request_id,published_at) VALUES(${templateId}::uuid,${f.organizationId}::uuid,1,'Synthetic semester history template',${JSON.stringify(approvedRuleTemplate)}::jsonb,${f.adminUserId}::uuid,${randomUUID()},${published})`;
  await tx.$executeRaw`INSERT INTO v81_course_rules(class_section_id,organization_id,minimum_minutes,weekly_limit,course_target,general_target,regular_deadline,closing_deadline,settlement_planned_at,published_at,version,template_id) VALUES(${s.sectionId}::uuid,${f.organizationId}::uuid,30,4,600,600,'2026-08-31T15:59:59Z'::timestamptz,'2026-09-07T15:59:59Z'::timestamptz,'2026-09-07T16:00:00Z'::timestamptz,${published},1,${templateId}::uuid)`;
  return values;
 },{timeout:30000});
 for(const x of sessions)tokens[x.role]=(await new TokenService(config,{now:()=>new Date()},{next:uuidv7}).issue({userId:x.user.id,organizationId:f.organizationId,role:x.role==='admin'?'ADMIN':'TEACHER',sessionId:x.sessionId,tokenVersion:x.user.tokenVersion})).token;
 await api(`/enrollments/${s.enrollmentId}/final-grades`,'teacher',{finalGrade:80,published:true,expectedVersion:0});
 const path=`/class-sections/${s.sectionId}`;
 const preview=await api(path+'/settlement-preview');assert.equal(preview.canConfirm,true,JSON.stringify(preview.checks));
 const key=randomUUID(),body={expectedVersion:0,previewFingerprint:preview.previewFingerprint};
 const saved=await api(path+'/settlement-reports','teacher',body,201,key);reportId=saved.id;
 assert.deepEqual(await api(path+'/settlement-reports','teacher',body,201,key),saved);checks.push('FORMAL_SETTLEMENT_AND_REPLAY');
 const report=await api(path+'/settlement-reports/1'),exported=await api(path+'/settlement-reports/1/export');
 const members=await db.enrollment.findMany({where:{classSectionId:s.sectionId},orderBy:{id:'asc'}});
 const target=await api('/admin/semesters','admin',{academicYear:'2026-2027',termCode:'SECOND',displayName:'Synthetic history next semester',startDate:'2026-09-08',endDate:'2027-06-30'});targetId=target.id;
 const check=await api(`/admin/semesters/${target.id}/switch-check`,'admin');assert.equal(check.ready,true,JSON.stringify(check.checks));assert.equal(check.totalCourseCount,1);
 const switchBody={expectedVersion:check.target.version,currentSemesterId:check.current.id,currentSemesterVersion:check.current.version},switchKey=randomUUID();
 const changed=await api(`/admin/semesters/${target.id}/switch`,'admin',switchBody,201,switchKey);
 assert.equal(changed.archived.id,f.semesterId);assert.deepEqual(await api(`/admin/semesters/${target.id}/switch`,'admin',switchBody,201,switchKey),changed);checks.push('SETTLED_COURSE_SWITCH_ARCHIVE_REPLAY');
 assert.deepEqual(await api(path+'/settlement-reports/1'),report);
 const afterExport=await api(path+'/settlement-reports/1/export');assert.equal(afterExport.fileBase64,exported.fileBase64);
 assert.deepEqual(await db.enrollment.findMany({where:{classSectionId:s.sectionId},orderBy:{id:'asc'}}),members);
 assert.equal(await db.semester.count({where:{organizationId:f.organizationId,status:'CURRENT'}}),1);checks.push('REPORT_EXPORT_MEMBERS_PRESERVED_ONE_CURRENT');
}finally{
 await db.user.updateMany({where:{id:{in:[f.adminUserId,f.teacherUserId]},organizationId:f.organizationId},data:{status:'DISABLED',tokenVersion:{increment:1}}});
 const result={organizationId:f.organizationId,sectionId:s.sectionId,targetId,reportId,checks,passed:checks.length===3,accountsDisabled:true,scope:'Production HTTP formal settlement and archive; historical rule dates explicitly seeded; browser and archived new-operation denial still pending'};
 writeFileSync(destination,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(result));await db.$disconnect();
}
