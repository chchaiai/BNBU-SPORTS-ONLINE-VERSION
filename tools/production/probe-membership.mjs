import assert from 'node:assert/strict';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';import {validateEnvironment} from '/app/dist/common/config/environment.js';import {PrismaService} from '/app/dist/common/database/prisma.service.js';
const id=process.argv[2];assert.match(id,/^[0-9a-f-]{36}$/);await loadRuntimeSecrets(process.env);const config=validateEnvironment(process.env).RUNTIME_CONFIG;assert.equal(config.appEnvironment,'production');const db=new PrismaService(config);
try{
 const facts=await db.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;
 const members=await tx.$queryRaw`SELECT e.status FROM enrollments e JOIN organizations o ON o.id=e.organization_id WHERE e.id=${id}::uuid AND o.organization_code LIKE '%MEMBER13%'`;assert.equal(members.length,1);assert.equal(members[0].status,'ACTIVE');
 const apps=await tx.$queryRaw`SELECT a.id,a.status,a.membership_cleared_at,(SELECT count(*)::int FROM exemption_review_records r WHERE r.application_id=a.id) AS reviews,(SELECT count(*)::int FROM exemption_application_media m WHERE m.application_id=a.id) AS media,(SELECT count(*)::int FROM v81_events v WHERE v.resource_id=a.id AND v.resource_type='EXEMPTION_MEMBERSHIP' AND v.is_system_actor=true AND substr(v.id::text,15,1)='7') AS events FROM exemption_applications a WHERE a.enrollment_id=${id}::uuid`;
 assert.equal(apps.length,3);assert.ok(apps.every(a=>a.status==='REVOKED'&&a.membership_cleared_at&&a.media>=1&&a.events===1));assert.equal(apps.reduce((n,a)=>n+a.reviews,0),2);
 const active=await tx.$queryRaw`SELECT count(*)::int AS count FROM v81_certification_credits WHERE enrollment_id=${id}::uuid AND active=true`;assert.equal(active[0].count,0);
 return {applications:apps.length,reviewHistory:2,mediaBindingsRetained:apps.reduce((n,a)=>n+a.media,0),systemEvents:3,activeRecognition:0};});
 console.log(JSON.stringify({check:'CLOUD_APPLICATION_AUDIT_MEDIA_AND_QUALIFICATION_REVOCATION',result:'PASS',...facts}));
}finally{await db.$disconnect();}
