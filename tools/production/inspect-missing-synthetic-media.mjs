import assert from 'node:assert/strict';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
await loadRuntimeSecrets(process.env);
const config=validateEnvironment(process.env).RUNTIME_CONFIG;
assert.equal(config.appEnvironment,'production');
const db=new PrismaService(config);
try {
 const facts=await db.$transaction(async tx=>{
  await tx.$executeRaw`SET TRANSACTION READ ONLY`;
  const media=await tx.mediaEvidence.findUniqueOrThrow({where:{id:'01a097a4-2975-710e-86f5-2b8e27f152b3'},select:{id:true,organizationId:true,uploadStatus:true,createdAt:true,uploadedAt:true,boundAt:true,availableAt:true,failedAt:true,failureCode:true,sessionId:true,enrollmentId:true,businessPurpose:true}});
  assert.equal(media.organizationId,'01a096c2-20a2-706b-8c69-802f67dee12c');
  const recordBindings=await tx.exerciseRecordMedia.count({where:{mediaId:media.id}});
  const exemptionBindings=await tx.exemptionApplicationMedia.count({where:{mediaId:media.id}});
  const otherBindings=await tx.$queryRaw`SELECT 'v81_application_materials' AS kind,count(*)::int AS count FROM v81_application_materials WHERE media_id=${media.id}::uuid UNION ALL SELECT 'v81_material_items',count(*)::int FROM v81_material_items WHERE media_id=${media.id}::uuid UNION ALL SELECT 'v81_swim_intake_items',count(*)::int FROM v81_swim_intake_items WHERE media_id=${media.id}::uuid`;
  return {media,recordBindings,exemptionBindings,otherBindings};
 });
 console.log(JSON.stringify({check:'MISSING_SYNTHETIC_MEDIA_DIAGNOSTIC',observedAt:new Date().toISOString(),...facts}));
}finally{await db.$disconnect();}
