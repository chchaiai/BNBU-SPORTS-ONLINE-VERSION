// Isolated historical-time baseline only. Real exercise and settlement use current server time and public APIs.
import assert from 'node:assert/strict';import {existsSync,writeFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';import {v7 as uuidv7} from 'uuid';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';import {validateEnvironment} from '/app/dist/common/config/environment.js';import {PrismaService} from '/app/dist/common/database/prisma.service.js';
import {TokenService} from '/app/dist/modules/auth/token.service.js';import {AuthService} from '/app/dist/modules/auth/auth.service.js';import {SecureDigestService} from '/app/dist/common/security/secure-digest.service.js';import {AuditService} from '/app/dist/common/audit/audit.service.js';import {OutboxService} from '/app/dist/common/outbox/outbox.service.js';
await loadRuntimeSecrets(process.env);const config=validateEnvironment(process.env).RUNTIME_CONFIG,db=new PrismaService(config),organizationId='01a096c2-20a2-706b-8c69-802f67dee12c',sectionId=process.argv[2],out='/tmp/ocr-utc-closing-fixture-20260913.json';assert.ok(!existsSync(out));
try {
 const section=await db.classSection.findUniqueOrThrow({where:{id:sectionId},include:{teacher:true}});assert.equal(section.organizationId,organizationId);assert.equal(section.displayName,'Synthetic UTC closing settlement 20260913');assert.equal(await db.enrollment.count({where:{classSectionId:sectionId}}),0);
 const now=new Date(),closing=new Date(now.getTime()+8*60_000),regular=new Date(closing.getTime()-7*86400000),planned=closing;
 await db.$executeRaw`INSERT INTO v81_course_rules(class_section_id,organization_id,minimum_minutes,maximum_minutes,weekly_limit,daily_limit,course_target,general_target,regular_deadline,closing_deadline,settlement_planned_at,published_at,version,template_id,target_global_version)
 SELECT ${sectionId}::uuid,organization_id,1,60,7,1,course_target,general_target,${regular},${closing},${planned},${now},1,template_id,target_global_version FROM v81_course_rules WHERE class_section_id='01a096e7-a22e-7535-a65d-ce0da82d59af'::uuid AND organization_id=${organizationId}::uuid`;
 const student={userId:uuidv7(),studentId:uuidv7(),enrollmentId:uuidv7(),email:`closing.${Date.now()}.synthetic@bnbu.invalid`};
 await db.$transaction(async tx=>{
   await tx.user.create({data:{id:student.userId,organizationId,role:'STUDENT',status:'ACTIVE',primaryEmail:student.email,primaryEmailNormalized:student.email,emailVerifiedAt:now,createdAt:now,updatedAt:now}});
   await tx.studentProfile.create({data:{id:student.studentId,organizationId,userId:student.userId,studentNumber:'9900000004',fullName:'TEST DELTA',gender:'MALE',gradeYear:2026,status:'ACTIVE',createdAt:now,updatedAt:now}});
   await tx.enrollment.create({data:{id:student.enrollmentId,organizationId,semesterId:section.semesterId,classSectionId:sectionId,studentId:student.studentId,source:'MANUAL',status:'ACTIVE',joinedAt:now,createdBy:section.teacher.userId,updatedBy:section.teacher.userId,createdAt:now,updatedAt:now}});
 });
 const clock={now:()=>new Date()},ids={next:uuidv7},issuer=new TokenService(config,clock,ids),digest=new SecureDigestService(config),auth=new AuthService(db,null,issuer,null,null,new AuditService(clock,ids,digest),new OutboxService(db,clock,ids),digest,clock,ids,config);
 const session=await db.$transaction(async tx=>auth.establishStudentSession(tx,await tx.user.findUniqueOrThrow({where:{id:student.userId}}),{requestId:uuidv7(),idempotencyKey:randomUUID()}));
 const result={organizationId,sectionId,...student,session,regularDeadline:regular.toISOString(),closingDeadline:closing.toISOString(),settlementPlannedAt:planned.toISOString(),setup:'Isolated synthetic past-window baseline; not email or publication acceptance'};
 writeFileSync(out,JSON.stringify(result),{mode:0o600,flag:'wx'});console.log(JSON.stringify({check:'SYNTHETIC_CLOSING_BASELINE_READY',organizationId,sectionId,studentId:student.studentId,enrollmentId:student.enrollmentId,closingDeadline:result.closingDeadline,setup:result.setup}));
}finally{await db.$disconnect();}
