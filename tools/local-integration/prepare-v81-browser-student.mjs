import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createTestPrisma} from '../../backend/test/helpers/database.ts';
import {seedExerciseSessionStudent} from '../../backend/test/helpers/exercise-session.ts';
const directory='/workspace/.browser-state';
const state=JSON.parse(readFileSync(directory+'/state.json','utf8'));
if(state.database!=='v81_browser_test'||!state.bootstrapped)throw new Error('Dedicated browser fixture required');
const purpose=process.env.V81_STUDENT_PURPOSE??'supplement';
if(!['supplement','supplement-once','positive-credit','round2-positive-credit','round2-submit-retry','maintenance-supplement'].includes(purpose))throw new Error('Unsupported synthetic fixture purpose');
const output=`${directory}/student-${purpose}.json`;
const database=new URL('postgresql://sql-postgres:5432/v81_browser_test');
database.username=process.env.PGUSER;database.password=process.env.PGPASSWORD;
const prisma=createTestPrisma(database.href);
try{
  if(existsSync(output)){
    const existing=JSON.parse(readFileSync(output,'utf8'));
    if(!await prisma.enrollment.findFirst({where:{id:existing.enrollmentId,organizationId:state.fixture.organizationId}}))throw new Error('Existing synthetic fixture cannot be verified');
    console.log(JSON.stringify({check:'DEDICATED_BROWSER_STUDENT',purpose,result:'EXISTS'}));
  }else{
    const student=await seedExerciseSessionStudent(prisma,state.fixture,randomUUID().slice(0,8).toUpperCase(),'ACTIVE',false);
    writeFileSync(output,JSON.stringify(student),{mode:0o600});
    console.log(JSON.stringify({check:'DEDICATED_BROWSER_STUDENT',purpose,result:'CREATED',publishedScheduleChanged:false}));
  }
}finally{await prisma.$disconnect();}
