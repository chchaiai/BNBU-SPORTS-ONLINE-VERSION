import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {createTestPrisma} from '../../backend/test/helpers/database.ts';
import {seedExerciseSessionStudent} from '../../backend/test/helpers/exercise-session.ts';
const directory='/workspace/.browser-state',file=directory+'/physical-browser.json';
const state=JSON.parse(fs.readFileSync(directory+'/state.json'));assert.equal(state.database,'v81_browser_test');
const url=new URL('postgresql://sql-postgres:5432/v81_browser_test');url.username=process.env.PGUSER;url.password=process.env.PGPASSWORD;
const prisma=createTestPrisma(url.href);
try{
 assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name,'v81_browser_test');
 if(!fs.existsSync(file)){
  const student=await seedExerciseSessionStudent(prisma,state.fixture,randomUUID().slice(0,8).toUpperCase(),'ACTIVE',false);
  await prisma.studentProfile.update({where:{id:student.studentId},data:{gender:'MALE'}});
  fs.writeFileSync(file,JSON.stringify({...student,classSectionId:state.fixture.teacherAActiveSectionId}));
 }
 console.log('SYNTHETIC_PHYSICAL_BROWSER_FIXTURE_READY');
}finally{await prisma.$disconnect();}
