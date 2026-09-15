import {writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createTestPrisma,seedFoundationFixture} from '../../backend/test/helpers/database.ts';
import {TEST_PASSWORD} from '../../backend/test/helpers/test-environment.ts';
const url=new URL('postgresql://sql-postgres:5432/v81_browser_test');url.username=process.env.PGUSER;url.password=process.env.PGPASSWORD;
const db=createTestPrisma(url.href);
try {
 const fixture=await seedFoundationFixture(db,'-B15-'+Date.now().toString(36).toUpperCase());
 await db.classSection.update({where:{id:fixture.teacherAActiveSectionId},data:{isEnrollmentOpen:true,checkInWindowMode:'AVAILABLE',checkInStartDate:new Date('2026-08-01T00:00:00Z'),checkInEndDate:new Date('2027-01-23T00:00:00Z'),dailyStartTime:new Date('1970-01-01T00:00:00Z'),dailyEndTime:new Date('1970-01-01T23:59:59Z'),submissionDeadlineAt:new Date('2027-01-23T15:59:59Z')}});
 await db.v81AccountSecurity.createMany({data:[fixture.teacherUserId,fixture.adminUserId].map(userId=>({userId,organizationId:fixture.organizationId,mustChangePassword:false,passwordChangedAt:new Date(),loginAccount:userId===fixture.adminUserId?fixture.adminEmail:null}))});
 await db.v81AdminAccess.create({data:{userId:fixture.adminUserId,organizationId:fixture.organizationId,kind:'SUPER',permissions:[],mustChangePassword:false}});
 const call=async(path,token,body)=>{const r=await fetch('http://127.0.0.1:3199/api/v1'+path,{method:'POST',headers:{'content-type':'application/json','idempotency-key':randomUUID(),...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});const v=await r.json();if(!r.ok)throw Error(`${path}: ${r.status} ${v.code}`);return v.data;};
 const admin=await call('/auth/password-login',null,{account:fixture.adminEmail,password:TEST_PASSWORD});
 const teacher=await call('/auth/password-login',null,{account:fixture.teacherEmail,password:TEST_PASSWORD});
 const template=await call('/rule-templates',admin.accessToken,{displayName:'Bug15 synthetic',expectedVersion:0});
 await call(`/class-sections/${fixture.teacherAActiveSectionId}/v81-rules`,teacher.accessToken,{templateId:template.id,minimumMinutes:1,weeklyLimit:3,courseTarget:600,generalTarget:600,regularDeadline:'2027-01-23T15:59:59Z',closingDeadline:'2027-01-30T15:59:59Z',settlementPlannedAt:'2027-01-30T15:59:59Z',publish:true,expectedVersion:0});
 writeFileSync('/workspace/.browser-state/bug15-teacher.json',JSON.stringify({fixture,accounts:{teacher:{email:fixture.teacherEmail,password:TEST_PASSWORD},admin:{email:fixture.adminEmail,password:TEST_PASSWORD}}}),{mode:0o600});
 console.log(JSON.stringify({result:'PASS',organizationId:fixture.organizationId,classSectionId:fixture.teacherAActiveSectionId}));
}finally{await db.$disconnect();}
