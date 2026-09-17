import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
import {readProfileQualities} from '/app/dist/modules/users/application/student-profile-quality.js';
await loadRuntimeSecrets(process.env);
const db=new PrismaService(validateEnvironment(process.env).RUNTIME_CONFIG);
try {
 const organizations=await db.organization.findMany({select:{id:true,organizationCode:true}});
 const counts={NORMAL:0,REQUIRES_PROFILE_UPDATE:0,PENDING_REVIEW:0};const reasons={};let total=0;const byOrganization=[];
 for(const org of organizations){const orgCounts={NORMAL:0,REQUIRES_PROFILE_UPDATE:0,PENDING_REVIEW:0};let cursor;for(;;){const rows=await db.studentProfile.findMany({where:{organizationId:org.id,deletedAt:null},orderBy:{id:'asc'},take:100,...(cursor?{cursor:{id:cursor},skip:1}:{})});if(!rows.length)break;const qualities=await readProfileQualities(db,rows);for(const q of qualities.values()){total++;counts[q.profileQualityStatus]++;orgCounts[q.profileQualityStatus]++;for(const raw of q.profileQualityReasons){const reason=raw.startsWith('manual:')?'manual':raw;reasons[reason]=(reasons[reason]||0)+1;}}cursor=rows.at(-1).id;}if(Object.values(orgCounts).some(Boolean))byOrganization.push({code:org.organizationCode,counts:orgCounts});}
 console.log(JSON.stringify({result:'PASS',readOnly:true,total,counts,reasons,byOrganization,checkedAt:new Date().toISOString()}));
}finally{await db.$disconnect();}
