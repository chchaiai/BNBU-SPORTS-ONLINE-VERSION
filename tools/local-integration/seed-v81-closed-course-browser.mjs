import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {createRequire} from 'node:module';
import {createTestPrisma} from '../../backend/test/helpers/database.ts';import {seedExerciseSessionStudent} from '../../backend/test/helpers/exercise-session.ts';
const uuidv7=createRequire(new URL('../../backend/package.json',import.meta.url))('uuid').v7,dir='/workspace/.browser-state',state=JSON.parse(fs.readFileSync(dir+'/state.json')),file=dir+'/closed-course-browser.json';
assert.equal(state.database,'v81_browser_test');const url=new URL('postgresql://sql-postgres:5432/v81_browser_test');url.username=process.env.PGUSER;url.password=process.env.PGPASSWORD;const prisma=createTestPrisma(url.href);
try{assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name,'v81_browser_test');
 if(!fs.existsSync(file)){
  const source=await prisma.classSection.findUniqueOrThrow({where:{id:state.fixture.teacherAActiveSectionId}}),sectionId=uuidv7();
  await prisma.$transaction(async tx=>{await tx.classSection.create({data:{...source,id:sectionId,classCode:'SYNTH-CLOSED-CHAIN',displayName:'Synthetic closed course continuation',version:1,createdAt:new Date(),updatedAt:new Date()}});
   await tx.$executeRaw`INSERT INTO v81_course_rules(class_section_id,organization_id,minimum_minutes,weekly_limit,course_target,general_target,regular_deadline,closing_deadline,settlement_planned_at,published_at,version,template_id)
    SELECT ${sectionId}::uuid,organization_id,minimum_minutes,weekly_limit,course_target,general_target,regular_deadline,closing_deadline,settlement_planned_at,now(),1,template_id FROM v81_course_rules WHERE class_section_id=${source.id}::uuid`;
  });const student=await seedExerciseSessionStudent(prisma,{...state.fixture,teacherAActiveSectionId:sectionId},randomUUID().slice(0,8).toUpperCase(),'ACTIVE',false);fs.writeFileSync(file,JSON.stringify({sectionId,student}),{mode:0o600});
 }
 const fixture=JSON.parse(fs.readFileSync(file));
 const api=async(path,token,body)=>{const response=await fetch('http://127.0.0.1:3199/api/v1'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','idempotency-key':randomUUID(),...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});const json=await response.json();assert.ok(response.ok,`${path}: ${response.status}`);return json.data;};
 const login=await api('/auth/password-login',null,{account:state.accounts.admin.email,password:state.accounts.admin.password}),manual=await api(`/admin/review-services/manual-mode/${fixture.sectionId}`,login.accessToken);
 if(!manual.enabled)await api('/admin/review-services/manual-mode',login.accessToken,{classSectionId:fixture.sectionId,enabled:true,reason:'Synthetic closed-course manual verification',expectedVersion:manual.version});
 console.log('SYNTHETIC_CLOSED_COURSE_CONTINUATION_READY');
}finally{await prisma.$disconnect();}
