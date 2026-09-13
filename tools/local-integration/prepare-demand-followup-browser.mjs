// Only the isolated synthetic fixture may be made incomplete for the UI test.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTestPrisma} from '../../backend/test/helpers/database.ts';
const fixture=JSON.parse(readFileSync('/workspace/.browser-state/demand-fixture.json','utf8'));
const url=new URL('postgresql://sql-postgres:5432/v81_browser_test');url.username=process.env.PGUSER;url.password=process.env.PGPASSWORD;
const db=createTestPrisma(url.href);
try {
  assert.equal((await db.$queryRaw`SELECT current_database() AS name`)[0].name,'v81_browser_test');
  const profile=await db.studentProfile.findUniqueOrThrow({where:{id:fixture.studentId}});
  assert.equal(profile.fullName,'Synthetic Permanent Student');
  await db.studentProfile.update({where:{id:profile.id},data:{collegeName:null,version:{increment:1}}});
  console.log(JSON.stringify({check:'ISOLATED_SYNTHETIC_PROFILE_PREPARED',result:'PASS'}));
} finally {await db.$disconnect();}
