import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { hash, argon2id } from 'argon2';
import { PrismaService } from '/app/dist/common/database/prisma.service.js';

// Run as a one-shot operator, with a private writable /bootstrap mount.
const secrets = JSON.parse(await readFile('/run/secrets/runtime.json', 'utf8'));
const db = new PrismaService({databaseUrl:secrets.DATABASE_URL,tencentDbCaFile:'/run/secrets/tencentdb-ca-chain.pem',requestTimeoutMs:10000});
const email = 'chengwacheong@bnbu.edu.cn';
try {
  const existing = await db.organization.findUnique({where:{organizationCode:'BNBU'}});
  if (existing) {
    const admin = await db.user.findFirst({where:{organizationId:existing.id,primaryEmailNormalized:email,role:'ADMIN'}});
    if (!admin) throw new Error('Existing organization requires manual bootstrap review');
    console.log(JSON.stringify({check:'initial-admin',status:'EXISTS',organizationId:existing.id,userId:admin.id}));
  } else {
    const password = randomBytes(24).toString('base64url');
    const passwordHash = await hash(password,{type:argon2id});
    const organizationId=randomUUID(), userId=randomUUID(), now=new Date();
    // Persist before transaction so a committed account never loses its initial secret.
    await writeFile('/bootstrap/initial-admin.json',JSON.stringify({email,password,organizationId,userId}),{mode:0o600,flag:'wx'});
    await db.$transaction(async tx=>{
      await tx.organization.create({data:{id:organizationId,organizationCode:'BNBU',legalName:'BNBU',displayName:'BNBU Sports',timezone:'Asia/Shanghai',defaultLocale:'zh-CN',status:'ACTIVE',createdAt:now,updatedAt:now}});
      await tx.user.create({data:{id:userId,organizationId,role:'ADMIN',status:'ACTIVE',primaryEmail:email,primaryEmailNormalized:email,passwordHash,createdAt:now,updatedAt:now}});
      await tx.adminProfile.create({data:{id:randomUUID(),organizationId,userId,employeeNumber:'BOOTSTRAP-SUPER',fullName:'总管理员',status:'ACTIVE',createdAt:now,updatedAt:now}});
      await tx.v81AdminAccess.create({data:{userId,organizationId,kind:'SUPER',permissions:[],mustChangePassword:true}});
      await tx.v81AccountSecurity.create({data:{userId,organizationId,mustChangePassword:true}});
      await tx.systemPolicy.create({data:{organizationId,systemMode:'NORMAL',changedBy:userId,changeReason:'Initial production deployment authorized by owner',updatedAt:now}});
    });
    console.log(JSON.stringify({check:'initial-admin',status:'CREATED',organizationId,userId,firstPasswordChangeRequired:true,emailVerified:false}));
  }
  const [tls]=await db.$queryRaw`SELECT ssl,version FROM pg_stat_ssl WHERE pid=pg_backend_pid()`;
  const [migrations]=await db.$queryRaw`SELECT count(*)::int AS applied FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  console.log(JSON.stringify({check:'database',tls,migrations}));
} finally {await db.$disconnect();}
