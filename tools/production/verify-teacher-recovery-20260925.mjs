import assert from 'node:assert/strict';
import { loadRuntimeSecrets } from '/app/dist/common/config/file-json-secret-loader.js';
import { validateEnvironment } from '/app/dist/common/config/environment.js';
import { PrismaService } from '/app/dist/common/database/prisma.service.js';
import { ClientAuthenticationService } from '/app/dist/modules/client-capabilities/client-authentication.service.js';

await loadRuntimeSecrets(process.env);
const config = validateEnvironment(process.env).RUNTIME_CONFIG;
assert.equal(config.appEnvironment, 'production');
assert.equal(config.publicOrganizationCode, 'BNBU');
const db = new PrismaService(config);
try {
  const result = await db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const organization = await tx.organization.findUniqueOrThrow({ where: { organizationCode: 'BNBU' } });
    const account = 'hanying@bnbu.edu.cn';
    const user = await tx.user.findFirstOrThrow({ where: {
      organizationId: organization.id, primaryEmailNormalized: account, role: 'TEACHER', deletedAt: null,
    }, select: { id: true, status: true, emailVerifiedAt: true } });
    assert.equal(user.status, 'ACTIVE');
    // Exercise the deployed lookup using a read-only transaction; return no credential fields.
    const service = Object.assign(Object.create(ClientAuthenticationService.prototype), {
      prisma: { user: { findFirst: ({ where }) => tx.user.findFirst({ where, select: { id: true } }) } },
    });
    const resolved = await service.findUser(organization.id, account, 'TEACHER');
    if (process.argv.includes('--before')) assert.equal(resolved, null);
    else assert.equal(resolved?.id, user.id);
    assert.equal(await service.findUser(organization.id, account, 'STUDENT'), null);
    return { result: 'PASS', activeTeacher: true, emailVerified: user.emailVerifiedAt !== null,
      teacherRecoveryResolved: resolved !== null, productionBusinessWrites: 0 };
  });
  console.log(JSON.stringify(result));
} finally { await db.$disconnect(); }
