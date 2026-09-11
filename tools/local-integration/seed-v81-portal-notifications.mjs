import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createTestPrisma} from '../../backend/test/helpers/database.ts';
const uuid=createRequire(new URL('../../backend/package.json',import.meta.url))('uuid').v7;
const dir='/workspace/.browser-state',file=dir+'/portal-notifications.json',state=JSON.parse(fs.readFileSync(dir+'/state.json'));
assert.equal(state.database,'v81_browser_test');const url=new URL('postgresql://sql-postgres:5432/v81_browser_test');url.username=process.env.PGUSER;url.password=process.env.PGPASSWORD;
const prisma=createTestPrisma(url.href);
try{
 assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name,'v81_browser_test');
 if(!fs.existsSync(file)){
  const fixture={};
  await prisma.$transaction(async tx=>{
   for(const role of ['teacher','admin']){
    fixture[role]=[];
    for(let index=0;index<21;index++){
     const id=uuid(),title=`Synthetic ${role} notification ${id}`;fixture[role].push({id,title});
     await tx.notification.create({data:{id,organizationId:state.fixture.organizationId,recipientUserId:role==='teacher'?state.fixture.teacherUserId:state.fixture.adminUserId,notificationType:'COURSE_UPDATE',title,body:'Synthetic local notification for browser read, pagination and navigation verification.',targetType:'CLASS_SECTION',targetId:state.fixture.teacherAActiveSectionId,createdAt:new Date(Date.now()-index)}});
    }
   }
  });fs.writeFileSync(file,JSON.stringify(fixture));
 }
 console.log('SYNTHETIC_PORTAL_NOTIFICATIONS_READY');
}finally{await prisma.$disconnect();}
