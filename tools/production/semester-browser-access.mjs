import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {hash,argon2id} from 'argon2';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
const f=JSON.parse(readFileSync('/acceptance/semester-history-fixture.json')).fixture;
assert.equal(f.organizationId,'01a09918-10d0-75ae-93a0-a4bf948d2495');
const mode=process.argv[2];assert.ok(['prepare','activate','disable'].includes(mode));
await loadRuntimeSecrets(process.env);const config=validateEnvironment(process.env).RUNTIME_CONFIG;assert.equal(config.appEnvironment,'production');
const db=new PrismaService(config),path='/acceptance/semester-browser-credentials.json';
try{
 const user=await db.user.findUniqueOrThrow({where:{id:f.adminUserId}});assert.equal(user.organizationId,f.organizationId);
 if(mode==='prepare'){
  assert.equal(user.status,'DISABLED');assert.ok(!existsSync(path));
  const password='Sh!'+randomBytes(30).toString('base64url');
  const passwordHash=await hash(password,{type:argon2id});
  await db.user.update({where:{id:user.id},data:{passwordHash,tokenVersion:{increment:1}}});
  writeFileSync(path,JSON.stringify({email:user.primaryEmail,password,userId:user.id,organizationId:f.organizationId}),{flag:'wx',mode:0o600});
 }else if(mode==='activate'){
  assert.equal(user.status,'DISABLED');assert.ok(existsSync(path));
  await db.user.update({where:{id:user.id},data:{status:'ACTIVE'}});
 }else await db.user.update({where:{id:user.id},data:{status:'DISABLED',tokenVersion:{increment:1}}});
 console.log(JSON.stringify({mode,userId:user.id,status:(await db.user.findUniqueOrThrow({where:{id:user.id}})).status}));
}finally{await db.$disconnect();}
