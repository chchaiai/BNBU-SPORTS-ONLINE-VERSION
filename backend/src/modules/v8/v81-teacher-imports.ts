import { permitsSystemMode } from '../system-mode/system-mode-access.js';
import { Body, Controller, Get, Headers, Injectable, Post, Query, Req } from '@nestjs/common';
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { timingSafeEqual } from 'node:crypto';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import { PasswordHasherService } from '../auth/password-hasher.service.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { SecureDigestService } from '../../common/security/secure-digest.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import type { AuthenticatedPrincipal, FoundationRequest } from '../../common/http/request-context.js';
import { requireAdminAccess } from './v81-admin-access.js';
import { inspectTeacherImport, readTeacherCsv, validTeacherInitialPassword, type TeacherImportRow } from './domain/teacher-import.js';

export class TeacherImportPreviewInput {
  @IsString() @MaxLength(1048576) csv!: string;
}
export class TeacherImportConfirmInput extends TeacherImportPreviewInput {
  @IsString() @Matches(/^[a-f0-9]{64}$/u) previewToken!: string;
  @IsString() @MaxLength(1024) initialPassword!: string;
}
export class TeacherAccountListQuery {
  @IsOptional() @IsUUID() after?: string;
}
@Injectable()
export class V81TeacherImportsService {
  constructor(private readonly prisma: PrismaService, private readonly digest: SecureDigestService,
    private readonly idempotency: IdempotencyService, private readonly passwords: PasswordHasherService,
    private readonly clock: Clock, private readonly ids: IdGenerator) {}
  async list(principal: AuthenticatedPrincipal, after?: string) {
    return this.prisma.$transaction(async tx => {
      await requireAdminAccess(tx, principal, 'USER_ACCOUNTS');
      const profiles = await tx.teacherProfile.findMany({ where: { organizationId: principal.organizationId,
        deletedAt: null, user: { deletedAt: null }, ...(after ? { id: { gt: after } } : {}) }, orderBy: { id: 'asc' }, take: 101 });
      const items = profiles.slice(0, 100);
      return { items, nextCursor: profiles.length > 100 ? items.at(-1)!.id : null };
    }, { isolationLevel: 'RepeatableRead' });
  }
  async confirm(principal: AuthenticatedPrincipal, input: TeacherImportConfirmInput,
    facts: { requestId: string; idempotencyKey: string | undefined }) {
    await requireAdminAccess(this.prisma, principal, 'USER_ACCOUNTS');
    const expectedToken = this.digest.digest('teacher-import-preview',
      JSON.stringify({ organizationId: principal.organizationId, actorId: principal.userId, csv: input.csv }));
    if (input.previewToken.length !== expectedToken.length || !timingSafeEqual(Buffer.from(input.previewToken), Buffer.from(expectedToken)))
      throw new ApplicationError('VALIDATION_FAILED', 422, { reason: 'TEACHER_PREVIEW_REQUIRED' });
    if (!validTeacherInitialPassword(input.initialPassword))
      throw new ApplicationError('VALIDATION_FAILED', 422, { reason: 'TEACHER_INITIAL_PASSWORD_INVALID' });
    let rows: TeacherImportRow[];
    try { rows = readTeacherCsv(Buffer.from(input.csv, 'utf8'), { maxBytes: 1048576, maxRows: 1000 }); }
    catch { throw new ApplicationError('VALIDATION_FAILED', 422, { reason: 'TEACHER_CSV_INVALID' }); }
    // The batch intentionally shares one temporary credential; personal changes receive fresh hashes.
    const passwordHash = await this.passwords.hash(input.initialPassword);
    return this.idempotency.execute({ organizationId: principal.organizationId, principalId: principal.userId,
      authSessionId: principal.sessionId, operationId: 'confirmV81TeacherImport', scope: principal.organizationId,
      key: facts.idempotencyKey, requestId: facts.requestId,
      request: { csv: input.csv, previewToken: input.previewToken,
        passwordProof: this.digest.digest('teacher-import-password', input.initialPassword) } }, async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
      await requireAdminAccess(tx, principal, 'USER_ACCOUNTS');
      const policy = await tx.systemPolicy.findUnique({ where: { organizationId: principal.organizationId } });
      if (!permitsSystemMode(policy?.systemMode, principal.role)) throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
      const teachers = await tx.teacherProfile.findMany({ where: { organizationId: principal.organizationId,
        employeeNumber: { in: rows.map(row => row.employeeId) } }, select: { employeeNumber: true } });
      const users = await tx.user.findMany({ where: { organizationId: principal.organizationId,
        primaryEmailNormalized: { in: rows.map(row => row.email) } }, select: { primaryEmailNormalized: true } });
      const inspection = inspectTeacherImport(rows, { existingEmployeeIds: teachers.map(row => row.employeeNumber),
        existingEmails: users.flatMap(row => row.primaryEmailNormalized ? [row.primaryEmailNormalized] : []) });
      if (!inspection.canCreate) throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409, { reason: 'TEACHER_IMPORT_CONFLICT' });
      const now = this.clock.now(), batchId = this.ids.next();
      const accounts = rows.map(row => ({ ...row, userId: this.ids.next(), teacherProfileId: this.ids.next() }));
      await tx.user.createMany({ data: accounts.map(row => ({ id: row.userId, organizationId: principal.organizationId,
        role: 'TEACHER', status: 'ACTIVE', primaryEmail: row.email, primaryEmailNormalized: row.email,
        passwordHash, createdAt: now, updatedAt: now })) });
      await tx.teacherProfile.createMany({ data: accounts.map(row => ({ id: row.teacherProfileId,
        organizationId: principal.organizationId, userId: row.userId, employeeNumber: row.employeeId,
        fullName: row.name, collegeName: row.college, status: 'ACTIVE', createdAt: now, updatedAt: now })) });
      await tx.v81AccountSecurity.createMany({ data: accounts.map(row => ({ userId: row.userId,
        organizationId: principal.organizationId, mustChangePassword: true })) });
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'TEACHER_IMPORT',${batchId}::uuid,'CREATED',
          ${principal.userId}::uuid,${facts.requestId},1,${JSON.stringify({ userIds: accounts.map(row => row.userId), count: accounts.length })}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success({ batchId, createdCount: accounts.length, accounts });
    });
  }
  async preview(principal: AuthenticatedPrincipal, csv: string) {
    await requireAdminAccess(this.prisma, principal, 'USER_ACCOUNTS');
    let rows: TeacherImportRow[];
    try { rows = readTeacherCsv(Buffer.from(csv, 'utf8'), { maxBytes: 1048576, maxRows: 1000 }); }
    catch (error) { throw new ApplicationError('VALIDATION_FAILED', 422, { reason: error instanceof Error ? error.message : 'TEACHER_CSV_INVALID' }); }
    return this.prisma.$transaction(async tx => {
      await requireAdminAccess(tx, principal, 'USER_ACCOUNTS');
      const existingTeachers = await tx.teacherProfile.findMany({ where: { organizationId: principal.organizationId,
        employeeNumber: { in: rows.map(row => row.employeeId) } }, select: { employeeNumber: true } });
      const existingUsers = await tx.user.findMany({ where: { organizationId: principal.organizationId,
        primaryEmailNormalized: { in: rows.map(row => row.email) } }, select: { primaryEmailNormalized: true } });
      const preview = inspectTeacherImport(rows, { existingEmployeeIds: existingTeachers.map(row => row.employeeNumber),
        existingEmails: existingUsers.flatMap(row => row.primaryEmailNormalized ? [row.primaryEmailNormalized] : []) });
      return { ...preview, previewToken: preview.canCreate ? this.digest.digest('teacher-import-preview',
        JSON.stringify({ organizationId: principal.organizationId, actorId: principal.userId, csv })) : null };
    }, { isolationLevel: 'RepeatableRead' });
  }
}
@Controller('admin/teacher-imports')
export class V81TeacherImportsController {
  constructor(private readonly service: V81TeacherImportsService) {}
  @Post('confirm') @OperationPolicy('confirmV81TeacherImport')
  confirm(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() input: TeacherImportConfirmInput,
    @Headers('idempotency-key') key: string | undefined, @Req() request: FoundationRequest) {
    return this.service.confirm(principal, input, { requestId: request.requestId, idempotencyKey: key });
  }
  @Post('preview') @OperationPolicy('previewV81TeacherImport')
  preview(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() input: TeacherImportPreviewInput) {
    return this.service.preview(principal, input.csv);
  }
}

@Controller('admin/teacher-accounts')
export class V81TeacherAccountsController {
  constructor(private readonly service: V81TeacherImportsService) {}
  @Get() @OperationPolicy('listV81TeacherAccounts')
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: TeacherAccountListQuery) {
    return this.service.list(principal, query.after);
  }
}
