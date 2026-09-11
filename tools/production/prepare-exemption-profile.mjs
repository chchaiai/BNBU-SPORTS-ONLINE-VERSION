// Complete the isolated synthetic profile for the endurance exemption test.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
await loadRuntimeSecrets(process.env);
const config=validateEnvironment(process.env).RUNTIME_CONFIG;assert.equal(config.appEnvironment,'production');
const db=new PrismaService(config),fixture=JSON.parse(readFileSync('/acceptance/long-checkin.json','utf8'));
try{
 const org=await db.organization.findUniqueOrThrow({where:{id:fixture.fixture.organizationId}});assert.ok(org.organizationCode.startsWith('BNBU-TEST-LONG-'));
 const student=await db.studentProfile.findUniqueOrThrow({where:{id:fixture.student.studentId}});assert.equal(student.organizationId,org.id);assert.equal(student.userId,fixture.student.userId);assert.ok(student.fullName.startsWith('Synthetic Session Student '));assert.ok(['OTHER','MALE'].includes(student.gender));
 await db.studentProfile.update({where:{id:student.id},data:{gender:'MALE'}});
 console.log(JSON.stringify({check:'CLOUD_SYNTHETIC_EXEMPTION_PROFILE',result:'PASS',gender:'MALE'}));
}finally{await db.$disconnect();}
