import fs from 'node:fs';import assert from 'node:assert/strict';import {createTestPrisma} from '../../backend/test/helpers/database.ts';
const root='/workspace/.browser-state',state=JSON.parse(fs.readFileSync(root+'/state.json')),joined=JSON.parse(fs.readFileSync(root+'/new-student-join.json'));assert.equal(state.database,'v81_browser_test');
const url=new URL('postgresql://sql-postgres:5432/v81_browser_test');url.username=process.env.PGUSER;url.password=process.env.PGPASSWORD;const prisma=createTestPrisma(url.href);
try{assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name,'v81_browser_test');
 const enrollment=await prisma.enrollment.findUniqueOrThrow({where:{id:joined.membership.enrollment.id}});assert.equal(enrollment.status,'ACTIVE');assert.equal(enrollment.classSectionId,joined.membership.enrollment.classSectionId);
 const rule=(await prisma.$queryRaw`SELECT minimum_minutes,weekly_limit,course_target,general_target,published_at,regular_deadline,closing_deadline FROM v81_course_rules WHERE class_section_id=${enrollment.classSectionId}::uuid`)[0];assert.ok(rule.published_at);assert.equal(rule.minimum_minutes,45);assert.equal(rule.weekly_limit,4);assert.equal(rule.course_target,480);assert.equal(rule.general_target,720);assert.equal(rule.closing_deadline-rule.regular_deadline,7*86400000);
 console.log(JSON.stringify({check:'NEW_COURSE_WEB_PUBLICATION_DATABASE_READBACK',result:'PASS',minimumMinutes:45,weeklyLimit:4,courseTarget:480,generalTarget:720,closingDays:7,enrollment:'ACTIVE'}));
}finally{await prisma.$disconnect();}
