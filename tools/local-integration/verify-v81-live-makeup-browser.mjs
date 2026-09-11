const makeupRun=process.env.V81_MAKEUP_RETEST==='1'?'live-makeup-retest':'live-makeup';
import fs from 'node:fs';import assert from 'node:assert/strict';
import {createTestPrisma} from '../../backend/test/helpers/database.ts';
const dir='/workspace/.browser-state',state=JSON.parse(fs.readFileSync(dir+'/state.json')),fixture=JSON.parse(fs.readFileSync(dir+'/'+makeupRun+'.json')),result=JSON.parse(fs.readFileSync(dir+'/'+makeupRun+'-progress.json'));
assert.equal(state.database,'v81_browser_test');const url=new URL('postgresql://sql-postgres:5432/v81_browser_test');url.username=process.env.PGUSER;url.password=process.env.PGPASSWORD;const prisma=createTestPrisma(url.href);
try{assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name,'v81_browser_test');
 const session=await prisma.exerciseSession.findUniqueOrThrow({where:{id:result.sessionId}});assert.equal(session.classSectionId,fixture.sectionId);assert.equal(session.status,'COMPLETED');assert.equal(session.enrollmentId,fixture.student.enrollmentId);
 const rows=await prisma.$queryRaw`SELECT w.starts_at,w.ends_at,r.created_at AS revoked_at,s.window_id FROM v81_makeup_session_sources s JOIN v81_makeup_windows w ON w.id=s.window_id JOIN v81_makeup_revocations r ON r.window_id=w.id WHERE s.session_id=${result.sessionId}::uuid`;
 assert.equal(rows.length,1);const link=rows[0];assert.equal(link.window_id,result.windowId);assert.ok(session.startedAt>=link.starts_at&&session.startedAt<link.ends_at);assert.ok(session.startedAt<link.revoked_at);assert.ok(session.completedAt>link.revoked_at);assert.ok(session.startedAt>new Date(fixture.regular));
 const record=await prisma.exerciseRecord.findUniqueOrThrow({where:{id:result.recordId}});assert.equal(record.sessionId,session.id);assert.equal(record.creditedDurationSeconds,0n);
 const workflow=(await prisma.$queryRaw`SELECT stage FROM v81_record_workflows WHERE record_id=${result.recordId}::uuid`)[0];assert.equal(workflow.stage,'VALID');assert.equal(await prisma.exerciseSession.count({where:{enrollmentId:fixture.student.enrollmentId}}),1);
 console.log(JSON.stringify({check:'LIVE_MAKEUP_DATABASE_READBACK',result:'PASS',exactWindowSource:true,startedAfterRegularDeadline:true,startedBeforeRevocation:true,completedAfterRevocation:true,workflow:'VALID',sessionCount:1,actualDurationSeconds:Number(session.actualDurationSeconds),creditedDurationSeconds:0}));
}finally{await prisma.$disconnect();}
