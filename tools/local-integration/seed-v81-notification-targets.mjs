import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {createTestPrisma} from '../../backend/test/helpers/database.ts';
const uuid=createRequire(new URL('../../backend/package.json',import.meta.url))('uuid').v7;
const dir='/workspace/.browser-state',state=JSON.parse(fs.readFileSync(dir+'/state.json')),course=JSON.parse(fs.readFileSync(dir+'/closed-course-browser.json'));
const url=new URL('postgresql://sql-postgres:5432/v81_browser_test');url.username=process.env.PGUSER;url.password=process.env.PGPASSWORD;const prisma=createTestPrisma(url.href);
try {assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name,'v81_browser_test');const fixture=[];const applications=JSON.parse(fs.readFileSync(dir+'/closed-applications-browser.json')).applications;
 for(const [targetType,targetId] of [['CLASS_SECTION',course.sectionId],['EXERCISE_RECORD',course.recordId],...applications.map(item=>['EXEMPTION_APPLICATION',item.id])]) {
 const id=uuid();await prisma.notification.create({data:{id,organizationId:state.fixture.organizationId,recipientUserId:state.fixture.teacherUserId,notificationType:'COURSE_UPDATE',title:`Synthetic exact target ${targetType}`,body:'Synthetic notification for an existing closed-course business object.',targetType,targetId,createdAt:new Date()}});fixture.push({id,targetType,targetId});
 }fs.writeFileSync(dir+'/notification-targets.json',JSON.stringify(fixture));console.log('SYNTHETIC_NOTIFICATION_TARGETS_READY');
}finally{await prisma.$disconnect();}
