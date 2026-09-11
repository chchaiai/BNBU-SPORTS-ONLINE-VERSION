import fs from 'node:fs';import assert from 'node:assert/strict';import {createTestPrisma} from '../../backend/test/helpers/database.ts';
const dir='/workspace/.browser-state',fixture=JSON.parse(fs.readFileSync(dir+'/live-reminder.json')),state=JSON.parse(fs.readFileSync(dir+'/state.json'));assert.equal(state.database,'v81_browser_test');
const url=new URL('postgresql://sql-postgres:5432/v81_browser_test');url.username=process.env.PGUSER;url.password=process.env.PGPASSWORD;const prisma=createTestPrisma(url.href);
try{assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name,'v81_browser_test');
const rows=await prisma.notification.findMany({where:{id:{in:fixture.notices.map(n=>n.id)}}});assert.equal(rows.length,2);
for(const expected of fixture.notices){const actual=rows.find(n=>n.id===expected.id);assert.equal(actual.targetId,expected.targetId);assert.equal(actual.notificationType,'COURSE_DEADLINE_REMINDER');assert.ok(actual.readAt);}
console.log(JSON.stringify({check:'LIVE_REMINDER_BROWSER_DURABLE_READBACK',result:'PASS',readNotices:2,exactTargets:true}));
}finally{await prisma.$disconnect();}
