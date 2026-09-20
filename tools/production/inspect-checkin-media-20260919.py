import subprocess
js=r"""
await import('reflect-metadata');
const {loadRuntimeSecrets}=await import('./dist/common/config/file-json-secret-loader.js');
const {validateEnvironment}=await import('./dist/common/config/environment.js');
const {PrismaService}=await import('./dist/common/database/prisma.service.js');
const {ExerciseRecordsService}=await import('./dist/modules/exercise-records/application/exercise-records.service.js');
await loadRuntimeSecrets(process.env);const db=new PrismaService(validateEnvironment(process.env).RUNTIME_CONFIG);
try{const result=await db.$transaction(async tx=>{
await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');await tx.$executeRawUnsafe("SET LOCAL statement_timeout='10s'");
const record=await tx.exerciseRecord.findUniqueOrThrow({where:{id:'01a0b4e6-aec2-7450-ba5f-f988caa0e5b9'},include:{student:{select:{userId:true}}}});
const service=Object.create(ExerciseRecordsService.prototype);service.prisma=tx;
const projection=await service.getEvidenceContext({organizationId:record.organizationId,userId:record.student.userId,role:'STUDENT'}, {recordId:record.id,organizationId:record.organizationId,studentUserId:record.student.userId});
const media=await tx.mediaEvidence.findMany({where:{id:{in:projection.mediaIds}},select:{mediaType:true,uploadStatus:true}});
return {recordStatus:record.status,submittedAt:record.submittedAt,recoveryMediaCount:projection.mediaIds.length,images:media.filter(m=>m.mediaType==='IMAGE').length,videos:media.filter(m=>m.mediaType==='VIDEO').length,allAvailable:media.every(m=>m.uploadStatus==='AVAILABLE'),writes:0};
});console.log(JSON.stringify(result));}catch(e){console.log(JSON.stringify({error:e.name,code:e.code}));process.exitCode=1;}finally{await db.$disconnect();}
"""
subprocess.run(['docker','exec','-i','bnbu-sports-production-backend-1','node','--input-type=module'],input=js,text=True,check=True)
