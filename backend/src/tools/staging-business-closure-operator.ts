import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { v7 as uuidv7 } from 'uuid';

import { validateEnvironment, type RuntimeConfig } from '../common/config/environment.js';
import { loadRuntimeSecrets } from '../common/config/file-json-secret-loader.js';
import { PrismaService } from '../common/database/prisma.service.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import {
  ensureCompletedClosureSession,
  ensureStagingBusinessFixture,
  loadStagingBusinessFixtureSecret,
  STAGING_BUSINESS_ADMIN_EMAIL,
  STAGING_BUSINESS_CONFIRMATION,
  STAGING_BUSINESS_ORGANIZATION_CODE,
  STAGING_BUSINESS_PUBLIC_BASE_URL,
  STAGING_QR_PATH_LOG_REDACTION_CONFIRMATION,
  STAGING_BUSINESS_STUDENT_NAME,
  STAGING_BUSINESS_STUDENT_NUMBER,
  STAGING_BUSINESS_TEACHER_EMAIL,
  StagingBusinessOperatorFailure,
  type BusinessFixtureState,
  type StagingBusinessFixtureSecret,
} from './staging-business-fixture.js';

type OperatorCommand = 'bootstrap' | 'run';

export interface StagingBusinessOperatorControls {
  fixtureSecretFile: string;
  publicBaseUrl: string;
}

export interface ApiResult {
  status: number;
  body: Record<string, unknown>;
  headers: Headers;
}

export interface OperatorApiClient {
  request(
    operation: string,
    path: string,
    init: RequestInit,
    expectedStatuses: readonly number[],
  ): Promise<ApiResult>;
}

interface AuthSessionProjection {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

interface FlowSummary {
  fixtureState: 'CREATED' | 'VERIFIED';
  enrollmentState: 'QR_JOIN_EXECUTED' | 'VERIFIED_EXISTING';
  closureSessionState: 'CREATED' | 'VERIFIED';
  mediaState: 'REAL_COS_UPLOAD_EXECUTED' | 'RESUMED' | 'VERIFIED_EXISTING';
  recordState: 'CREATED' | 'RESUMED' | 'VERIFIED_EXISTING';
  reviewState: 'EXECUTED' | 'RESUMED' | 'VERIFIED_EXISTING';
  totalValidDurationSeconds: number;
  auditActionCount: number;
}

interface MediaState {
  id: string;
  uploadStatus: string;
  version: number;
  verifiedContentSha256: string | null;
}

interface RecordState {
  id: string;
  status: string;
  version: number;
  currentReview: Record<string, unknown> | null;
}

interface OperatorApiDependencies {
  fetch?: typeof fetch;
}

const STAGING_BUCKET = 'sports-staging-media-1443273655';
const STAGING_REGION = 'ap-guangzhou';
const STAGING_COS_ENDPOINT = 'https://cos.ap-guangzhou.myqcloud.com';
const STAGING_COS_HOST = `${STAGING_BUCKET}.cos.${STAGING_REGION}.myqcloud.com`;
const STAGING_DATABASE_HOST = '10.0.0.10';
const STAGING_DATABASE_NAME = 'sports_staging_pg_01';
const STAGING_DATABASE_USER = 'sports_staging_app';
const STAGING_DATABASE_CA_FILE = '/run/secrets/tencentdb-ca-chain.pem';
const STAGING_CORS_ORIGINS = new Set(['https://admin.verityai.cn', 'https://www.verityai.cn']);
const HTTP_BODY_LIMIT_BYTES = 2 * 1024 * 1024;
const MEDIA_POLL_TIMEOUT_MS = 120_000;
const RECORD_CLIENT_REQUEST_ID = 'staging-business-closure-v1';
const LEGACY_SESSION_SMOKE_START_REQUEST_ID = 'staging-business-session-smoke-start-v1';
const QR_RECOVERY_MAX_INVITES = 3;
const QR_INVITE_TTL_MS = 15 * 60 * 1_000;

interface QrInviteRecoveryRow {
  id: string;
  organizationId: string;
  classSectionId: string;
  createdBy: string;
  versionNumber: number;
  status: string;
  replacedByInviteId: string | null;
}

interface QrJoinCapabilityEvidenceRow {
  classSectionId: string;
  status: string;
  createdRequestId: string;
}

export function nextQrInviteRecoveryAttempt(
  rows: QrInviteRecoveryRow[],
  state: Pick<BusinessFixtureState, 'organizationId' | 'classSectionId' | 'teacherUserId'>,
): number {
  const ordered = rows.toSorted((left, right) => left.versionNumber - right.versionNumber);
  if (
    ordered.some(
      (row, index) =>
        row.organizationId !== state.organizationId ||
        row.classSectionId !== state.classSectionId ||
        row.createdBy !== state.teacherUserId ||
        row.versionNumber !== index + 1 ||
        (index < ordered.length - 1 &&
          (row.status !== 'REVOKED' || row.replacedByInviteId !== ordered[index + 1]?.id)) ||
        (index === ordered.length - 1 &&
          (row.status !== 'ACTIVE' || row.replacedByInviteId !== null)),
    )
  ) {
    throw new StagingBusinessOperatorFailure('QR_RECOVERY_HISTORY_CONFLICT');
  }
  if (ordered.length >= QR_RECOVERY_MAX_INVITES) {
    throw new StagingBusinessOperatorFailure('QR_RECOVERY_ATTEMPTS_EXHAUSTED');
  }
  return ordered.length + 1;
}

export function validateQrJoinCapabilityDatabaseEvidence(
  rows: readonly QrJoinCapabilityEvidenceRow[],
  expectedClassSectionId: string,
  expectedRequestId: string,
): void {
  if (
    rows.length !== 1 ||
    rows[0]?.classSectionId !== expectedClassSectionId ||
    rows[0]?.status !== 'ACTIVE' ||
    rows[0]?.createdRequestId !== expectedRequestId
  ) {
    throw new StagingBusinessOperatorFailure('QR_CAPABILITY_DATABASE_EVIDENCE_INVALID');
  }
}

export function validateStagingBusinessOperatorControls(
  environment: NodeJS.ProcessEnv,
  command: OperatorCommand,
): StagingBusinessOperatorControls {
  if (environment.APP_ENV?.trim() !== 'staging') {
    throw new StagingBusinessOperatorFailure('APP_ENV_NOT_STAGING');
  }
  if (environment.STAGING_BUSINESS_CONFIRMATION?.trim() !== STAGING_BUSINESS_CONFIRMATION) {
    throw new StagingBusinessOperatorFailure('BUSINESS_CONFIRMATION_MISMATCH');
  }
  const fixtureSecretFile = environment.STAGING_BUSINESS_FIXTURE_SECRET_FILE?.trim();
  if (
    fixtureSecretFile === undefined ||
    fixtureSecretFile.length === 0 ||
    fixtureSecretFile.includes('CHANGE_ME') ||
    !isAbsolute(fixtureSecretFile)
  ) {
    throw new StagingBusinessOperatorFailure('BUSINESS_FIXTURE_SECRET_PATH_INVALID');
  }
  const publicBaseUrl =
    environment.STAGING_BUSINESS_PUBLIC_BASE_URL?.trim() ?? STAGING_BUSINESS_PUBLIC_BASE_URL;
  if (publicBaseUrl !== STAGING_BUSINESS_PUBLIC_BASE_URL) {
    throw new StagingBusinessOperatorFailure('BUSINESS_PUBLIC_BASE_URL_MISMATCH');
  }
  if (command === 'run') {
    if (
      environment.STAGING_QR_PATH_LOG_REDACTION_CONFIRMED?.trim() !==
      STAGING_QR_PATH_LOG_REDACTION_CONFIRMATION
    ) {
      throw new StagingBusinessOperatorFailure('QR_PATH_LOG_REDACTION_NOT_CONFIRMED');
    }
    const parsed = new URL(publicBaseUrl);
    if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '') {
      throw new StagingBusinessOperatorFailure('BUSINESS_PUBLIC_HTTPS_REQUIRED');
    }
  }
  return { fixtureSecretFile, publicBaseUrl };
}

export function safeOperatorCommandLabel(value: string | undefined): OperatorCommand | 'INVALID' {
  return value === 'bootstrap' || value === 'run' ? value : 'INVALID';
}

export function validateStagingBusinessRuntimeBoundary(config: RuntimeConfig): void {
  if (config.appEnvironment !== 'staging') {
    throw new StagingBusinessOperatorFailure('RUNTIME_NOT_STAGING');
  }
  validateStagingDatabaseTarget(config);
  if (
    config.corsAllowlist.size !== STAGING_CORS_ORIGINS.size ||
    [...STAGING_CORS_ORIGINS].some((origin) => !config.corsAllowlist.has(origin))
  ) {
    throw new StagingBusinessOperatorFailure('STAGING_CORS_BOUNDARY_MISMATCH');
  }
  if (
    config.objectStorage?.endpoint !== STAGING_COS_ENDPOINT ||
    config.objectStorage?.bucket !== STAGING_BUCKET ||
    config.objectStorage?.region !== STAGING_REGION ||
    config.objectStorage?.forcePathStyle !== false ||
    config.objectStorage?.credentials.provider !== 'TENCENT_CVM_ROLE'
  ) {
    throw new StagingBusinessOperatorFailure('STAGING_OBJECT_STORAGE_BOUNDARY_MISMATCH');
  }
  if (
    config.media?.storage.endpoint !== STAGING_COS_ENDPOINT ||
    config.media?.storage.bucket !== STAGING_BUCKET ||
    config.media?.storage.region !== STAGING_REGION ||
    config.media?.storage.forcePathStyle !== false ||
    config.media?.storage.credentials.provider !== 'TENCENT_CVM_ROLE' ||
    config.media?.scannerMode !== 'TEST_SIGNATURE' ||
    !config.media?.workerEnabled
  ) {
    throw new StagingBusinessOperatorFailure('STAGING_MEDIA_BOUNDARY_MISMATCH');
  }
  if (
    config.emailDelivery?.provider !== 'TENCENT_SES' ||
    config.emailDelivery?.region !== STAGING_REGION ||
    config.emailDelivery?.fromAddress !== 'no-reply@verityai.cn' ||
    config.emailDelivery?.templateId !== 56_852 ||
    config.emailDelivery?.templateVariables.code !== 'code'
  ) {
    throw new StagingBusinessOperatorFailure('STAGING_EMAIL_BOUNDARY_MISMATCH');
  }
  if (config.joinCapabilityTtlSeconds !== 600) {
    throw new StagingBusinessOperatorFailure('STAGING_QR_TTL_BOUNDARY_MISMATCH');
  }
}

export function validateStagingDatabaseTarget(config: RuntimeConfig): void {
  let parsed: URL;
  let username: string;
  let database: string;
  try {
    parsed = new URL(config.databaseUrl);
    username = decodeURIComponent(parsed.username);
    database = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    throw new StagingBusinessOperatorFailure('STAGING_DATABASE_BOUNDARY_MISMATCH');
  }
  const port = parsed.port === '' ? 5432 : Number.parseInt(parsed.port, 10);
  const allowedQueryNames = new Set(['schema', 'application_name', 'sslmode', 'sslaccept']);
  const sslMode = parsed.searchParams.get('sslmode');
  const sslAccept = parsed.searchParams.get('sslaccept');
  if (
    (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') ||
    parsed.hostname !== STAGING_DATABASE_HOST ||
    port !== 5432 ||
    username !== STAGING_DATABASE_USER ||
    parsed.password.length === 0 ||
    database !== STAGING_DATABASE_NAME ||
    (parsed.searchParams.get('schema') ?? 'public') !== 'public' ||
    [...parsed.searchParams.keys()].some((name) => !allowedQueryNames.has(name)) ||
    ['disable', 'allow', 'prefer', 'no-verify'].includes(sslMode ?? '') ||
    (sslAccept !== null && sslAccept !== 'strict') ||
    parsed.hash !== '' ||
    config.tencentDbCaFile !== STAGING_DATABASE_CA_FILE
  ) {
    throw new StagingBusinessOperatorFailure('STAGING_DATABASE_BOUNDARY_MISMATCH');
  }
}

export async function readHiddenOtp(
  dependencies: { readFromTty?: () => Promise<string> } = {},
): Promise<string> {
  const code = await (dependencies.readFromTty ?? defaultReadFromTty)();
  if (!/^\d{4,10}$/u.test(code)) {
    throw new StagingBusinessOperatorFailure('CONTROLLED_MAILBOX_OTP_INVALID');
  }
  return code;
}

export function syntheticPng(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAC0lEQVR4nGNgwAIAABUAAapll8QAAAAASUVORK5CYII=',
    'base64',
  );
}

class StagingApi {
  private readonly fetchImplementation: typeof fetch;

  constructor(
    private readonly baseUrl: string,
    dependencies: OperatorApiDependencies = {},
  ) {
    this.fetchImplementation = dependencies.fetch ?? fetch;
  }

  async request(
    operation: string,
    path: string,
    init: RequestInit,
    expectedStatuses: readonly number[],
  ): Promise<ApiResult> {
    let response: Response;
    try {
      response = await this.fetchImplementation(`${this.baseUrl}${path}`, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new StagingBusinessOperatorFailure(`${operation}_HTTP_REQUEST_FAILED`);
    }
    const length = response.headers.get('content-length');
    if (length !== null && Number(length) > HTTP_BODY_LIMIT_BYTES) {
      throw new StagingBusinessOperatorFailure(`${operation}_HTTP_RESPONSE_TOO_LARGE`);
    }
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > HTTP_BODY_LIMIT_BYTES) {
      throw new StagingBusinessOperatorFailure(`${operation}_HTTP_RESPONSE_TOO_LARGE`);
    }
    let body: Record<string, unknown> = {};
    if (text.length > 0) {
      try {
        const parsed: unknown = JSON.parse(text);
        if (!isRecord(parsed)) throw new Error('invalid');
        body = parsed;
      } catch {
        throw new StagingBusinessOperatorFailure(`${operation}_HTTP_RESPONSE_INVALID`);
      }
    }
    if (!expectedStatuses.includes(response.status)) {
      throw new StagingBusinessOperatorFailure(`${operation}_HTTP_STATUS`);
    }
    return { status: response.status, body, headers: response.headers };
  }
}

export async function runStagingBusinessClosure(
  prisma: PrismaClient,
  config: RuntimeConfig,
  secret: StagingBusinessFixtureSecret,
  publicBaseUrl: string,
  dependencies: OperatorApiDependencies & { readOtp?: () => Promise<string> } = {},
): Promise<FlowSummary> {
  validateStagingBusinessRuntimeBoundary(config);
  const fixture = await ensureStagingBusinessFixture(prisma, secret);
  const state = fixture.state;
  const api = new StagingApi(publicBaseUrl, dependencies);
  const auditRequestIds = new Set<string>();

  await verifyAdminAuthAndHealth(api, secret.adminPassword, auditRequestIds);
  const teacher = await establishTeacherSession(api, secret.teacherPassword, auditRequestIds);
  let student: AuthSessionProjection;
  try {
    student = await establishStudentSession(
      api,
      secret.studentEmail,
      dependencies.readOtp ?? ((): Promise<string> => readHiddenOtp()),
      auditRequestIds,
    );
  } catch (error: unknown) {
    await bestEffortLogout(api, teacher);
    throw error;
  }

  let studentSessionClosed = false;
  let teacherSessionClosed = false;
  try {
    const enrollment = await ensureQrEnrollment(api, prisma, state, teacher, auditRequestIds);
    await verifyExerciseSessionApi(api, prisma, state, enrollment.id, student, auditRequestIds);
    const closureSession = await ensureCompletedClosureSession(prisma, state, student.sessionId);

    const existingRecord = await prisma.exerciseRecord.findUnique({
      where: { sessionId: closureSession.sessionId },
    });
    const mediaResult = await ensureMedia(
      api,
      prisma,
      state,
      closureSession.sessionId,
      student,
      auditRequestIds,
      existingRecord !== null,
    );
    const recordResult = await ensureRecord(
      api,
      prisma,
      closureSession.sessionId,
      mediaResult.mediaId,
      student,
      auditRequestIds,
    );
    const reviewResult = await ensureReviewFlow(
      api,
      prisma,
      recordResult.recordId,
      teacher,
      student,
      auditRequestIds,
    );
    const score = await verifyAndPublishScore(
      api,
      enrollment.id,
      teacher,
      student,
      auditRequestIds,
    );

    await verifyAuditEvidence(prisma, state, auditRequestIds);
    await verifyStudentRefreshReuse(api, student, auditRequestIds);
    studentSessionClosed = true;
    await logoutReplay(api, teacher, 'TEACHER_LOGOUT', auditRequestIds);
    teacherSessionClosed = true;

    const auditActionCount = await prisma.auditLog.count({
      where: { organizationId: state.organizationId },
    });
    return {
      fixtureState: fixture.status,
      enrollmentState: enrollment.state,
      closureSessionState: closureSession.status,
      mediaState: mediaResult.state,
      recordState: recordResult.state,
      reviewState: reviewResult,
      totalValidDurationSeconds: score.totalValidDurationSeconds,
      auditActionCount,
    };
  } finally {
    if (!studentSessionClosed) await bestEffortLogout(api, student);
    if (!teacherSessionClosed) await bestEffortLogout(api, teacher);
  }
}

async function verifyAdminAuthAndHealth(
  api: StagingApi,
  password: string,
  auditRequestIds: Set<string>,
): Promise<void> {
  const admin = await passwordLogin(
    api,
    'ADMIN_LOGIN',
    STAGING_BUSINESS_ADMIN_EMAIL,
    password,
    'ADMIN',
    auditRequestIds,
  );
  let sessionClosed = false;
  try {
    const healthRequestId = requestId('ah');
    const health = await api.request(
      'ADMIN_HEALTH',
      '/health/admin',
      {
        headers: { authorization: `Bearer ${admin.accessToken}`, 'x-request-id': healthRequestId },
      },
      [200],
    );
    const meta = objectField(health.body, 'meta', 'ADMIN_HEALTH_RESPONSE_INVALID');
    if (meta.requestId !== healthRequestId) {
      throw new StagingBusinessOperatorFailure('ADMIN_HEALTH_REQUEST_ID_MISMATCH');
    }
    const data = dataObject(health, 'ADMIN_HEALTH_RESPONSE_INVALID');
    const dependencies = objectField(data, 'dependencies', 'ADMIN_HEALTH_RESPONSE_INVALID');
    if (
      data.status !== 'UP' ||
      ['database', 'notificationQueue', 'objectStorage', 'mediaStorage'].some(
        (name) => objectField(dependencies, name, 'ADMIN_HEALTH_RESPONSE_INVALID').status !== 'UP',
      )
    ) {
      throw new StagingBusinessOperatorFailure('ADMIN_HEALTH_NOT_UP');
    }
    await logoutReplay(api, admin, 'ADMIN_LOGOUT', auditRequestIds);
    sessionClosed = true;
  } finally {
    if (!sessionClosed) await bestEffortLogout(api, admin);
  }
}

async function establishTeacherSession(
  api: StagingApi,
  password: string,
  auditRequestIds: Set<string>,
): Promise<AuthSessionProjection> {
  const initial = await passwordLogin(
    api,
    'TEACHER_LOGIN_REFRESH',
    STAGING_BUSINESS_TEACHER_EMAIL,
    password,
    'TEACHER',
    auditRequestIds,
  );
  let active = initial;
  let sessionClosed = false;
  try {
    const refreshRequestId = requestId('tr');
    auditRequestIds.add(refreshRequestId);
    const rotatedResult = await api.request(
      'TEACHER_REFRESH',
      '/auth/refresh',
      jsonMutation({ refreshToken: initial.refreshToken }, refreshRequestId),
      [200],
    );
    active = authProjection(rotatedResult, 'TEACHER_REFRESH_RESPONSE_INVALID', 'TEACHER');

    const reuseRequestId = requestId('tu');
    auditRequestIds.add(reuseRequestId);
    const reuse = await api.request(
      'TEACHER_REFRESH_REUSE',
      '/auth/refresh',
      jsonMutation({ refreshToken: initial.refreshToken }, reuseRequestId),
      [401],
    );
    assertErrorCode(reuse.body, 'AUTH_SESSION_REVOKED', 'TEACHER_REFRESH_REUSE_CODE');
    sessionClosed = true;
  } finally {
    if (!sessionClosed) await bestEffortLogout(api, active);
  }

  return passwordLogin(
    api,
    'TEACHER_LOGIN_OPERATIONAL',
    STAGING_BUSINESS_TEACHER_EMAIL,
    password,
    'TEACHER',
    auditRequestIds,
  );
}

async function establishStudentSession(
  api: StagingApi,
  studentEmail: string,
  readOtp: () => Promise<string>,
  auditRequestIds: Set<string>,
): Promise<AuthSessionProjection> {
  const requestCodeRequestId = requestId('sc');
  auditRequestIds.add(requestCodeRequestId);
  const requested = await api.request(
    'STUDENT_CODE_REQUEST',
    '/auth/student-sign-in-codes',
    jsonMutation(
      {
        organizationCode: STAGING_BUSINESS_ORGANIZATION_CODE,
        account: studentEmail,
        channel: 'EMAIL',
        locale: 'zh-CN',
      },
      requestCodeRequestId,
    ),
    [202],
  );
  const challengeId = stringField(
    dataObject(requested, 'STUDENT_CODE_REQUEST_RESPONSE_INVALID'),
    'challengeId',
    'STUDENT_CODE_REQUEST_RESPONSE_INVALID',
  );
  const code = await readOtp();
  if (!/^\d{4,10}$/u.test(code)) {
    throw new StagingBusinessOperatorFailure('CONTROLLED_MAILBOX_OTP_INVALID');
  }
  const verifyRequestId = requestId('sv');
  auditRequestIds.add(verifyRequestId);
  const verified = await api.request(
    'STUDENT_CODE_VERIFY',
    '/auth/student-sign-in-codes/verify',
    jsonMutation(
      {
        challengeId,
        code,
        deviceId: 'staging-business-closure-operator-v1',
      },
      verifyRequestId,
    ),
    [200],
  );
  return authProjection(verified, 'STUDENT_CODE_VERIFY_RESPONSE_INVALID', 'STUDENT');
}

async function ensureQrEnrollment(
  api: StagingApi,
  prisma: PrismaClient,
  state: BusinessFixtureState,
  teacher: AuthSessionProjection,
  auditRequestIds: Set<string>,
): Promise<{ id: string; state: 'QR_JOIN_EXECUTED' | 'VERIFIED_EXISTING' }> {
  const existing = await prisma.enrollment.findUnique({
    where: {
      classSectionId_studentId: {
        classSectionId: state.classSectionId,
        studentId: state.studentProfileId,
      },
    },
  });
  if (existing !== null) {
    if (
      existing.organizationId !== state.organizationId ||
      existing.semesterId !== state.semesterId ||
      existing.status !== 'ACTIVE' ||
      existing.source !== 'QR_CODE'
    ) {
      throw new StagingBusinessOperatorFailure('BUSINESS_EXISTING_ENROLLMENT_CONFLICT');
    }
    return { id: existing.id, state: 'VERIFIED_EXISTING' };
  }

  const priorInvites = await prisma.courseInvite.findMany({
    where: {
      organizationId: state.organizationId,
      classSectionId: state.classSectionId,
    },
    orderBy: { versionNumber: 'asc' },
    select: {
      id: true,
      organizationId: true,
      classSectionId: true,
      createdBy: true,
      versionNumber: true,
      status: true,
      replacedByInviteId: true,
    },
  });
  const inviteAttempt = nextQrInviteRecoveryAttempt(priorInvites, state);

  const inviteRequestId = requestId('qi');
  auditRequestIds.add(inviteRequestId);
  const inviteKey = `staging-business-v2-course-invite-${inviteAttempt}-${uuidv7()}`;
  const inviteBody = { expiresAt: new Date(Date.now() + QR_INVITE_TTL_MS).toISOString() };
  const invite = await api.request(
    'QR_INVITE_CREATE',
    `/class-sections/${state.classSectionId}/course-invites`,
    jsonMutation(inviteBody, inviteRequestId, teacher.accessToken, inviteKey),
    [201],
  );
  const inviteData = dataObject(invite, 'QR_INVITE_RESPONSE_INVALID');
  const inviteToken = stringField(inviteData, 'inviteToken', 'QR_INVITE_RESPONSE_INVALID');
  if (
    stringField(inviteData, 'classSectionId', 'QR_INVITE_RESPONSE_INVALID') !== state.classSectionId
  ) {
    throw new StagingBusinessOperatorFailure('QR_INVITE_CLASS_SECTION_MISMATCH');
  }
  const activeInvite = await prisma.courseInvite.findFirst({
    where: {
      organizationId: state.organizationId,
      classSectionId: state.classSectionId,
      status: 'ACTIVE',
    },
  });
  if (
    activeInvite?.createdBy !== state.teacherUserId ||
    activeInvite.versionNumber !== inviteAttempt ||
    activeInvite.replacedByInviteId !== null
  ) {
    throw new StagingBusinessOperatorFailure('QR_INVITE_DATABASE_EVIDENCE_INVALID');
  }
  const encodedInvite = encodeURIComponent(inviteToken);
  const preview = await api.request(
    'QR_INVITE_PREVIEW',
    `/course-invites/${encodedInvite}/preview`,
    { headers: { 'x-request-id': requestId('qp') } },
    [200],
  );
  if (
    stringField(
      dataObject(preview, 'QR_PREVIEW_RESPONSE_INVALID'),
      'classSectionId',
      'QR_PREVIEW_RESPONSE_INVALID',
    ) !== state.classSectionId
  ) {
    throw new StagingBusinessOperatorFailure('QR_PREVIEW_CLASS_SECTION_MISMATCH');
  }

  const identity = {
    fullName: STAGING_BUSINESS_STUDENT_NAME,
    studentNumber: STAGING_BUSINESS_STUDENT_NUMBER,
    gender: 'FEMALE',
    gradeYear: 2026,
  };
  const capabilityKey = `staging-business-v2-join-capability-${inviteAttempt}-${uuidv7()}`;
  const capabilityRequestId = requestId('qc');
  auditRequestIds.add(capabilityRequestId);
  const capability = await api.request(
    'QR_CAPABILITY_CREATE',
    `/course-invites/${encodedInvite}/join-capabilities`,
    jsonMutation(identity, capabilityRequestId, undefined, capabilityKey),
    [201],
  );
  const capabilityReplay = await api.request(
    'QR_CAPABILITY_REPLAY',
    `/course-invites/${encodedInvite}/join-capabilities`,
    jsonMutation(identity, requestId('qcr'), undefined, capabilityKey),
    [201],
  );
  const capabilityToken = stringField(
    dataObject(capability, 'QR_CAPABILITY_RESPONSE_INVALID'),
    'joinCapability',
    'QR_CAPABILITY_RESPONSE_INVALID',
  );
  if (
    stringField(
      dataObject(capabilityReplay, 'QR_CAPABILITY_REPLAY_INVALID'),
      'joinCapability',
      'QR_CAPABILITY_REPLAY_INVALID',
    ) !== capabilityToken
  ) {
    throw new StagingBusinessOperatorFailure('QR_CAPABILITY_REPLAY_MISMATCH');
  }
  const capabilities = await prisma.joinCapability.findMany({
    where: {
      organizationId: state.organizationId,
      courseInviteId: activeInvite.id,
    },
  });
  validateQrJoinCapabilityDatabaseEvidence(capabilities, state.classSectionId, capabilityRequestId);

  const joinKey = `staging-business-v2-qr-join-${inviteAttempt}-${uuidv7()}`;
  const joinRequestId = requestId('qj');
  auditRequestIds.add(joinRequestId);
  const join = await api.request(
    'QR_JOIN',
    `/course-invites/${encodedInvite}/join`,
    jsonMutation(undefined, joinRequestId, undefined, joinKey, {
      'x-join-capability': capabilityToken,
    }),
    [201],
  );
  const joinReplay = await api.request(
    'QR_JOIN_REPLAY',
    `/course-invites/${encodedInvite}/join`,
    jsonMutation(undefined, requestId('qjr'), undefined, joinKey, {
      'x-join-capability': capabilityToken,
    }),
    [201],
  );
  const joinData = dataObject(join, 'QR_JOIN_RESPONSE_INVALID');
  const replayData = dataObject(joinReplay, 'QR_JOIN_REPLAY_INVALID');
  const enrollment = objectField(joinData, 'enrollment', 'QR_JOIN_RESPONSE_INVALID');
  const replayEnrollment = objectField(replayData, 'enrollment', 'QR_JOIN_REPLAY_INVALID');
  const enrollmentId = stringField(enrollment, 'id', 'QR_JOIN_RESPONSE_INVALID');
  if (
    stringField(replayEnrollment, 'id', 'QR_JOIN_REPLAY_INVALID') !== enrollmentId ||
    stringField(enrollment, 'status', 'QR_JOIN_RESPONSE_INVALID') !== 'ACTIVE'
  ) {
    throw new StagingBusinessOperatorFailure('QR_JOIN_REPLAY_MISMATCH');
  }
  const joinAuth = authProjectionFromObject(
    objectField(joinData, 'authSession', 'QR_JOIN_RESPONSE_INVALID'),
    'QR_JOIN_RESPONSE_INVALID',
    'STUDENT',
  );
  await logoutReplay(api, joinAuth, 'QR_JOIN_SESSION_LOGOUT', auditRequestIds);
  return { id: enrollmentId, state: 'QR_JOIN_EXECUTED' };
}

export async function verifyExerciseSessionApi(
  api: OperatorApiClient,
  prisma: PrismaClient,
  state: BusinessFixtureState,
  enrollmentId: string,
  student: AuthSessionProjection,
  auditRequestIds: Set<string>,
): Promise<void> {
  const activeSessions = await prisma.exerciseSession.findMany({
    where: {
      organizationId: state.organizationId,
      studentId: state.studentProfileId,
      enrollmentId,
      classSectionId: state.classSectionId,
      semesterId: state.semesterId,
      status: { in: ['IN_PROGRESS', 'PAUSED'] },
    },
    include: { events: { orderBy: { eventVersion: 'asc' } } },
  });
  if (activeSessions.length > 1) {
    throw new StagingBusinessOperatorFailure('SESSION_SMOKE_ACTIVE_SESSION_AMBIGUOUS');
  }
  const existing = activeSessions[0];
  if (existing !== undefined) {
    const priorStartRequestId = existing.events[0]?.requestId;
    if (
      existing.organizationId !== state.organizationId ||
      existing.studentId !== state.studentProfileId ||
      existing.enrollmentId !== enrollmentId ||
      existing.classSectionId !== state.classSectionId ||
      existing.semesterId !== state.semesterId ||
      existing.startedByAuthSessionId !== existing.events[0]?.authSessionId ||
      existing.events[0]?.eventVersion !== 1 ||
      existing.events[0]?.eventType !== 'STARTED' ||
      existing.events[0]?.fromStatus !== null ||
      existing.events[0]?.toStatus !== 'IN_PROGRESS' ||
      existing.events[0]?.actorUserId !== state.studentUserId ||
      (priorStartRequestId !== LEGACY_SESSION_SMOKE_START_REQUEST_ID &&
        !priorStartRequestId?.startsWith('sb-ss-'))
    ) {
      throw new StagingBusinessOperatorFailure('SESSION_SMOKE_EXISTING_CONFLICT');
    }
    if (
      existing.status !== 'IN_PROGRESS' ||
      existing.version !== 1 ||
      existing.events.length !== 1
    ) {
      throw new StagingBusinessOperatorFailure('SESSION_SMOKE_PARTIAL_STATE_INVALID');
    }
    const recoveryCancelRequestId = requestId('src');
    auditRequestIds.add(recoveryCancelRequestId);
    await cancelSessionSmoke(api, existing.id, existing.version, student, recoveryCancelRequestId);
  }

  const body = { enrollmentId, clientObservedAt: new Date().toISOString() };
  const key = `staging-business-v1-session-smoke-start-${uuidv7()}`;
  const startRequestId = requestId('ss');
  const cancelRequestId = requestId('sc');
  auditRequestIds.add(startRequestId);
  auditRequestIds.add(cancelRequestId);
  const started = await api.request(
    'SESSION_START',
    '/exercise-sessions',
    jsonMutation(body, startRequestId, student.accessToken, key),
    [201],
  );
  const replay = await api.request(
    'SESSION_START_REPLAY',
    '/exercise-sessions',
    jsonMutation(body, startRequestId, student.accessToken, key),
    [201],
  );
  const session = dataObject(started, 'SESSION_START_RESPONSE_INVALID');
  const sessionId = stringField(session, 'id', 'SESSION_START_RESPONSE_INVALID');
  const version = numberField(session, 'version', 'SESSION_START_RESPONSE_INVALID');
  if (
    stringField(
      dataObject(replay, 'SESSION_START_REPLAY_INVALID'),
      'id',
      'SESSION_START_REPLAY_INVALID',
    ) !== sessionId
  ) {
    throw new StagingBusinessOperatorFailure('SESSION_START_REPLAY_MISMATCH');
  }

  const stale = await api.request(
    'SESSION_STALE_VERSION',
    `/exercise-sessions/${sessionId}/pause`,
    jsonMutation(
      { expectedVersion: version + 99, clientObservedAt: new Date().toISOString() },
      requestId('xst'),
      student.accessToken,
    ),
    [409],
  );
  assertErrorCode(stale.body, 'CONFLICT_VERSION_MISMATCH', 'SESSION_STALE_VERSION_CODE');

  await cancelSessionSmoke(api, sessionId, version, student, cancelRequestId);
}

async function cancelSessionSmoke(
  api: OperatorApiClient,
  sessionId: string,
  version: number,
  student: AuthSessionProjection,
  cancelRequestId: string,
): Promise<void> {
  const cancelled = await api.request(
    'SESSION_CANCEL',
    `/exercise-sessions/${sessionId}/cancel`,
    jsonMutation(
      { reason: 'Synthetic Phase 12 API session smoke', expectedVersion: version },
      cancelRequestId,
      student.accessToken,
      `staging-business-v2-session-smoke-cancel-${uuidv7()}`,
    ),
    [200],
  );
  if (
    stringField(
      dataObject(cancelled, 'SESSION_CANCEL_RESPONSE_INVALID'),
      'status',
      'SESSION_CANCEL_RESPONSE_INVALID',
    ) !== 'CANCELLED'
  ) {
    throw new StagingBusinessOperatorFailure('SESSION_CANCEL_STATE_INVALID');
  }
}

async function ensureMedia(
  api: StagingApi,
  prisma: PrismaClient,
  state: BusinessFixtureState,
  sessionId: string,
  student: AuthSessionProjection,
  auditRequestIds: Set<string>,
  recordExists: boolean,
): Promise<{
  mediaId: string;
  state: 'REAL_COS_UPLOAD_EXECUTED' | 'RESUMED' | 'VERIFIED_EXISTING';
}> {
  const existing = await prisma.mediaEvidence.findMany({
    where: {
      organizationId: state.organizationId,
      ownerStudentId: state.studentProfileId,
      sessionId,
      businessPurpose: 'EXERCISE_RECORD',
    },
    orderBy: { createdAt: 'asc' },
    include: { uploadSession: true },
  });
  const active = existing.filter((item) =>
    ['PENDING_UPLOAD', 'UPLOADED', 'BOUND', 'PROCESSING', 'AVAILABLE'].includes(item.uploadStatus),
  );
  const available = active.filter((item) => item.uploadStatus === 'AVAILABLE');
  if (
    active.length > 1 ||
    (active.length === 1 && existing.at(-1)?.id !== active[0]?.id) ||
    existing.some(
      (item) =>
        !['PENDING_UPLOAD', 'UPLOADED', 'BOUND', 'PROCESSING', 'AVAILABLE', 'FAILED'].includes(
          item.uploadStatus,
        ),
    )
  ) {
    throw new StagingBusinessOperatorFailure('BUSINESS_CLOSURE_MEDIA_STATE_CONFLICT');
  }
  if (recordExists) {
    if (available.length !== 1 || active.length !== 1) {
      throw new StagingBusinessOperatorFailure('BUSINESS_EXISTING_RECORD_MEDIA_CONFLICT');
    }
    return { mediaId: available[0]!.id, state: 'VERIFIED_EXISTING' };
  }

  const body = syntheticPng();
  const digest = createHash('sha256').update(body).digest('hex');
  let media: MediaState;
  let mediaState: 'REAL_COS_UPLOAD_EXECUTED' | 'RESUMED' = 'RESUMED';
  const current = active[0];
  let attemptNumber =
    current === undefined
      ? existing.length + 1
      : existing.findIndex((item) => item.id === current.id) + 1;
  if (attemptNumber < 1 || attemptNumber > 3) {
    throw new StagingBusinessOperatorFailure('PARTIAL_MEDIA_ATTEMPT_LIMIT_REACHED');
  }
  if (current?.uploadStatus === 'PENDING_UPLOAD') {
    if (
      current.uploadSession?.status !== 'ACTIVE' ||
      current.uploadSession.capabilityExpiresAt <= current.createdAt
    ) {
      throw new StagingBusinessOperatorFailure('PARTIAL_MEDIA_UPLOAD_STATE_INVALID');
    }
    if (current.uploadSession.capabilityExpiresAt > new Date()) {
      throw new StagingBusinessOperatorFailure('PARTIAL_MEDIA_UPLOAD_STILL_ACTIVE');
    }
  }
  const initiateNewAttempt = current === undefined || current.uploadStatus === 'PENDING_UPLOAD';
  if (initiateNewAttempt) {
    if (existing.length >= 3) {
      throw new StagingBusinessOperatorFailure('PARTIAL_MEDIA_ATTEMPT_LIMIT_REACHED');
    }
    const initiateBody = {
      sessionId,
      businessPurpose: 'EXERCISE_RECORD',
      mediaType: 'IMAGE',
      mimeType: 'image/png',
      fileSizeBytes: body.length,
      captureSource: 'IN_APP_CAMERA',
      declaredContentSha256: digest,
      durationSeconds: null,
    };
    attemptNumber = existing.length + 1;
    const key = `staging-business-v1-media-initiate-attempt-${attemptNumber}`;
    const initiateRequestId = requestId('mi');
    auditRequestIds.add(initiateRequestId);
    const initiated = await api.request(
      'MEDIA_INITIATE',
      '/media-uploads',
      jsonMutation(initiateBody, initiateRequestId, student.accessToken, key),
      [201],
    );
    const replay = await api.request(
      'MEDIA_INITIATE_REPLAY',
      '/media-uploads',
      jsonMutation(initiateBody, requestId('mir'), student.accessToken, key),
      [201],
    );
    const capability = dataObject(initiated, 'MEDIA_INITIATE_RESPONSE_INVALID');
    const replayCapability = dataObject(replay, 'MEDIA_INITIATE_REPLAY_INVALID');
    const mediaId = stringField(capability, 'mediaId', 'MEDIA_INITIATE_RESPONSE_INVALID');
    const uploadSessionId = stringField(
      capability,
      'uploadSessionId',
      'MEDIA_INITIATE_RESPONSE_INVALID',
    );
    const uploadUrl = stringField(capability, 'uploadUrl', 'MEDIA_INITIATE_RESPONSE_INVALID');
    const uploadExpiresAt = Date.parse(
      stringField(capability, 'expiresAt', 'MEDIA_INITIATE_RESPONSE_INVALID'),
    );
    if (
      stringField(replayCapability, 'mediaId', 'MEDIA_INITIATE_REPLAY_INVALID') !== mediaId ||
      stringField(replayCapability, 'uploadSessionId', 'MEDIA_INITIATE_REPLAY_INVALID') !==
        uploadSessionId ||
      stringField(capability, 'uploadMethod', 'MEDIA_INITIATE_RESPONSE_INVALID') !== 'PUT' ||
      stringField(replayCapability, 'uploadMethod', 'MEDIA_INITIATE_REPLAY_INVALID') !== 'PUT' ||
      stringField(replayCapability, 'uploadUrl', 'MEDIA_INITIATE_REPLAY_INVALID') !== uploadUrl ||
      !Number.isFinite(uploadExpiresAt) ||
      uploadExpiresAt <= Date.now()
    ) {
      throw new StagingBusinessOperatorFailure('MEDIA_INITIATE_REPLAY_MISMATCH');
    }
    validateCosUploadUrl(uploadUrl, state.organizationId, mediaId);
    const requiredHeaders = objectField(
      capability,
      'requiredHeaders',
      'MEDIA_INITIATE_RESPONSE_INVALID',
    );
    const uploadResponse = await uploadToCos(uploadUrl, requiredHeaders, body);
    const etag = uploadResponse.headers.get('etag')?.trim().replaceAll('"', '') ?? '';
    if (!/^[A-Za-z0-9._:+\-/=]+$/u.test(etag)) {
      throw new StagingBusinessOperatorFailure('COS_UPLOAD_ETAG_INVALID');
    }
    const confirmRequestId = requestId('mc');
    auditRequestIds.add(confirmRequestId);
    const confirmed = await api.request(
      'MEDIA_CONFIRM',
      `/media-uploads/${uploadSessionId}/confirm`,
      jsonMutation(
        { etag },
        confirmRequestId,
        student.accessToken,
        `staging-business-v1-media-confirm-attempt-${attemptNumber}`,
      ),
      [200],
    );
    media = mediaProjection(confirmed, 'MEDIA_CONFIRM_RESPONSE_INVALID');
    if (media.id !== mediaId || media.uploadStatus !== 'UPLOADED') {
      throw new StagingBusinessOperatorFailure('MEDIA_CONFIRM_STATE_INVALID');
    }
    mediaState = 'REAL_COS_UPLOAD_EXECUTED';
  } else {
    media = {
      id: current.id,
      uploadStatus: current.uploadStatus,
      version: current.version,
      verifiedContentSha256: current.verifiedContentSha256,
    };
  }

  if (media.uploadStatus === 'UPLOADED') {
    const bindRequestId = requestId('mb');
    auditRequestIds.add(bindRequestId);
    const bound = await api.request(
      'MEDIA_BIND',
      `/media/${media.id}/bind`,
      jsonMutation(
        { sessionId, expectedVersion: media.version },
        bindRequestId,
        student.accessToken,
        `staging-business-v1-media-bind-attempt-${attemptNumber}`,
      ),
      [200],
    );
    media = mediaProjection(bound, 'MEDIA_BIND_RESPONSE_INVALID');
    if (media.uploadStatus !== 'BOUND') {
      throw new StagingBusinessOperatorFailure('MEDIA_BIND_STATE_INVALID');
    }
  }
  media = await pollMediaAvailable(api, media.id, student.accessToken);
  if (media.verifiedContentSha256 !== digest) {
    throw new StagingBusinessOperatorFailure('MEDIA_VERIFIED_DIGEST_MISMATCH');
  }
  return { mediaId: media.id, state: mediaState };
}

async function ensureRecord(
  api: StagingApi,
  prisma: PrismaClient,
  sessionId: string,
  mediaId: string,
  student: AuthSessionProjection,
  auditRequestIds: Set<string>,
): Promise<{ recordId: string; state: 'CREATED' | 'RESUMED' | 'VERIFIED_EXISTING' }> {
  const existing = await prisma.exerciseRecord.findUnique({
    where: { sessionId },
    include: { media: true },
  });
  let record: RecordState;
  let state: 'CREATED' | 'RESUMED' | 'VERIFIED_EXISTING';
  if (existing === null) {
    const createBody = {
      sessionId,
      creditType: 'GENERAL',
      sportType: 'RUNNING',
      description: 'Synthetic staging Phase 12 closure',
      clientRequestId: RECORD_CLIENT_REQUEST_ID,
    };
    const createRequestId = requestId('rc');
    auditRequestIds.add(createRequestId);
    const created = await api.request(
      'RECORD_CREATE',
      '/exercise-records',
      jsonMutation(
        createBody,
        createRequestId,
        student.accessToken,
        'staging-business-v1-record-create',
      ),
      [201],
    );
    const replay = await api.request(
      'RECORD_CREATE_REPLAY',
      '/exercise-records',
      jsonMutation(
        createBody,
        requestId('rcr'),
        student.accessToken,
        'staging-business-v1-record-create',
      ),
      [201],
    );
    record = recordProjection(created, 'RECORD_CREATE_RESPONSE_INVALID');
    if (
      record.id !==
      stringField(
        dataObject(replay, 'RECORD_CREATE_REPLAY_INVALID'),
        'id',
        'RECORD_CREATE_REPLAY_INVALID',
      )
    ) {
      throw new StagingBusinessOperatorFailure('RECORD_CREATE_REPLAY_MISMATCH');
    }
    state = 'CREATED';
  } else {
    if (
      existing.clientRequestId !== RECORD_CLIENT_REQUEST_ID ||
      (existing.status !== 'DRAFT' &&
        (existing.media.length !== 1 || existing.media[0]?.mediaId !== mediaId))
    ) {
      throw new StagingBusinessOperatorFailure('BUSINESS_CLOSURE_RECORD_CONFLICT');
    }
    record = {
      id: existing.id,
      status: existing.status,
      version: existing.version,
      currentReview: null,
    };
    state = existing.status === 'DRAFT' ? 'RESUMED' : 'VERIFIED_EXISTING';
  }

  if (record.status === 'DRAFT') {
    const submitBody = { mediaIds: [mediaId], expectedVersion: record.version };
    const submitRequestId = requestId('rs');
    auditRequestIds.add(submitRequestId);
    const submitted = await api.request(
      'RECORD_SUBMIT',
      `/exercise-records/${record.id}/submit`,
      jsonMutation(
        submitBody,
        submitRequestId,
        student.accessToken,
        'staging-business-v1-record-submit',
      ),
      [200],
    );
    const replay = await api.request(
      'RECORD_SUBMIT_REPLAY',
      `/exercise-records/${record.id}/submit`,
      jsonMutation(
        submitBody,
        requestId('rsr'),
        student.accessToken,
        'staging-business-v1-record-submit',
      ),
      [200],
    );
    record = recordProjection(submitted, 'RECORD_SUBMIT_RESPONSE_INVALID');
    if (
      record.id !==
        stringField(
          dataObject(replay, 'RECORD_SUBMIT_REPLAY_INVALID'),
          'id',
          'RECORD_SUBMIT_REPLAY_INVALID',
        ) ||
      record.status !== 'REVIEWED'
    ) {
      throw new StagingBusinessOperatorFailure('RECORD_SUBMIT_REPLAY_MISMATCH');
    }
  }
  if (!['SUBMITTED', 'REVIEWED'].includes(record.status)) {
    throw new StagingBusinessOperatorFailure('BUSINESS_CLOSURE_RECORD_STATE_INVALID');
  }
  return { recordId: record.id, state };
}

async function ensureReviewFlow(
  api: StagingApi,
  prisma: PrismaClient,
  recordId: string,
  teacher: AuthSessionProjection,
  student: AuthSessionProjection,
  auditRequestIds: Set<string>,
): Promise<'EXECUTED' | 'RESUMED' | 'VERIFIED_EXISTING'> {
  let reviews = await prisma.reviewRecord.findMany({
    where: { recordId },
    orderBy: { reviewVersion: 'asc' },
  });
  if (reviews.length < 1 || reviews[0]?.result !== 'VALID') {
    throw new StagingBusinessOperatorFailure('BUSINESS_REVIEW_BASELINE_INVALID');
  }
  const initialCount = reviews.length;

  if (reviews.length === 1) {
    const record = await prisma.exerciseRecord.findUniqueOrThrow({ where: { id: recordId } });
    const invalidBody = {
      result: 'INVALID',
      reasonCode: 'INVALID_MEDIA',
      reason: 'Synthetic Phase 12 invalid decision',
      publicComment: 'Synthetic evidence rejected for closure validation',
      internalNote: 'Synthetic teacher-only Phase 12 invalid note',
      creditedDurationOverrideSeconds: null,
      expectedReviewVersion: 1,
      expectedVersion: record.version,
    };
    const invalidRequestId = requestId('ri');
    auditRequestIds.add(invalidRequestId);
    const invalid = await api.request(
      'REVIEW_INVALID',
      `/exercise-records/${recordId}/reviews`,
      jsonMutation(
        invalidBody,
        invalidRequestId,
        teacher.accessToken,
        'staging-business-v1-review-invalid',
      ),
      [201],
    );
    const replay = await api.request(
      'REVIEW_INVALID_REPLAY',
      `/exercise-records/${recordId}/reviews`,
      jsonMutation(
        invalidBody,
        requestId('rir'),
        teacher.accessToken,
        'staging-business-v1-review-invalid',
      ),
      [201],
    );
    if (
      stringField(
        dataObject(invalid, 'REVIEW_INVALID_RESPONSE_INVALID'),
        'id',
        'REVIEW_INVALID_RESPONSE_INVALID',
      ) !==
      stringField(
        dataObject(replay, 'REVIEW_INVALID_REPLAY_INVALID'),
        'id',
        'REVIEW_INVALID_REPLAY_INVALID',
      )
    ) {
      throw new StagingBusinessOperatorFailure('REVIEW_INVALID_REPLAY_MISMATCH');
    }
    await verifyStudentRecordProjection(api, recordId, student.accessToken, 'INVALID');
    reviews = await prisma.reviewRecord.findMany({
      where: { recordId },
      orderBy: { reviewVersion: 'asc' },
    });
  }

  if (reviews.length === 2 && reviews[1]?.result === 'INVALID') {
    const record = await prisma.exerciseRecord.findUniqueOrThrow({ where: { id: recordId } });
    const reopenRequestId = requestId('rr');
    auditRequestIds.add(reopenRequestId);
    await api.request(
      'REVIEW_REOPEN',
      `/exercise-records/${recordId}/reviews/reopen`,
      jsonMutation(
        {
          reason: 'Synthetic Phase 12 correction path',
          expectedReviewVersion: 2,
          expectedVersion: record.version,
        },
        reopenRequestId,
        teacher.accessToken,
        'staging-business-v1-review-reopen',
      ),
      [201],
    );
    reviews = await prisma.reviewRecord.findMany({
      where: { recordId },
      orderBy: { reviewVersion: 'asc' },
    });
  }

  if (reviews.length === 3 && reviews[2]?.result === 'PENDING') {
    const record = await prisma.exerciseRecord.findUniqueOrThrow({ where: { id: recordId } });
    const validRequestId = requestId('rv');
    auditRequestIds.add(validRequestId);
    await api.request(
      'REVIEW_VALID',
      `/exercise-records/${recordId}/reviews`,
      jsonMutation(
        {
          result: 'VALID',
          reasonCode: null,
          reason: null,
          publicComment: 'Synthetic evidence accepted for closure validation',
          internalNote: 'Synthetic teacher-only Phase 12 valid note',
          creditedDurationOverrideSeconds: null,
          expectedReviewVersion: 3,
          expectedVersion: record.version,
        },
        validRequestId,
        teacher.accessToken,
        'staging-business-v1-review-valid',
      ),
      [201],
    );
    reviews = await prisma.reviewRecord.findMany({
      where: { recordId },
      orderBy: { reviewVersion: 'asc' },
    });
  }

  if (
    reviews.length !== 4 ||
    reviews.map((review) => review.result).join(',') !== 'VALID,INVALID,PENDING,VALID'
  ) {
    throw new StagingBusinessOperatorFailure('BUSINESS_REVIEW_HISTORY_INVALID');
  }
  await verifyStudentRecordProjection(api, recordId, student.accessToken, 'VALID');

  const record = await prisma.exerciseRecord.findUniqueOrThrow({ where: { id: recordId } });
  const beforeStaleCount = reviews.length;
  const staleKey = 'staging-business-v1-review-stale';
  const staleBody = {
    result: 'INVALID',
    reasonCode: 'INVALID_MEDIA',
    expectedReviewVersion: 3,
    expectedVersion: record.version - 1,
  };
  const stale = await api.request(
    'REVIEW_STALE_VERSION',
    `/exercise-records/${recordId}/reviews`,
    jsonMutation(staleBody, requestId('rst'), teacher.accessToken, staleKey),
    [409],
  );
  assertErrorCode(stale.body, 'CONFLICT_VERSION_MISMATCH', 'REVIEW_STALE_VERSION_CODE');
  const staleReplay = await api.request(
    'REVIEW_STALE_VERSION_REPLAY',
    `/exercise-records/${recordId}/reviews`,
    jsonMutation(staleBody, requestId('rstr'), teacher.accessToken, staleKey),
    [409],
  );
  assertErrorCode(
    staleReplay.body,
    'CONFLICT_VERSION_MISMATCH',
    'REVIEW_STALE_VERSION_REPLAY_CODE',
  );
  if ((await prisma.reviewRecord.count({ where: { recordId } })) !== beforeStaleCount) {
    throw new StagingBusinessOperatorFailure('REVIEW_STALE_VERSION_MUTATED_STATE');
  }
  return initialCount === 1 ? 'EXECUTED' : initialCount === 4 ? 'VERIFIED_EXISTING' : 'RESUMED';
}

async function verifyAndPublishScore(
  api: StagingApi,
  enrollmentId: string,
  teacher: AuthSessionProjection,
  student: AuthSessionProjection,
  auditRequestIds: Set<string>,
): Promise<{ totalValidDurationSeconds: number }> {
  const listed = await api.request(
    'SCORE_LIST_TEACHER',
    `/student-scores?enrollmentId=${encodeURIComponent(enrollmentId)}&limit=10`,
    {
      headers: { authorization: `Bearer ${teacher.accessToken}`, 'x-request-id': requestId('sl') },
    },
    [200],
  );
  const scores = dataArray(listed, 'SCORE_LIST_RESPONSE_INVALID');
  if (scores.length !== 1 || !isRecord(scores[0])) {
    throw new StagingBusinessOperatorFailure('SCORE_LIST_RESPONSE_INVALID');
  }
  let score = scores[0];
  const scoreId = stringField(score, 'id', 'SCORE_LIST_RESPONSE_INVALID');
  if (numberField(score, 'totalValidDurationSeconds', 'SCORE_LIST_RESPONSE_INVALID') !== 3600) {
    throw new StagingBusinessOperatorFailure('SCORE_VALID_DURATION_MISMATCH');
  }
  if (score.status !== 'PUBLISHED') {
    const publishRequestId = requestId('sp');
    auditRequestIds.add(publishRequestId);
    const published = await api.request(
      'SCORE_PUBLISH',
      `/student-scores/${scoreId}/publish`,
      jsonMutation(
        { expectedVersion: numberField(score, 'version', 'SCORE_LIST_RESPONSE_INVALID') },
        publishRequestId,
        teacher.accessToken,
        'staging-business-v1-score-publish',
      ),
      [200],
    );
    score = dataObject(published, 'SCORE_PUBLISH_RESPONSE_INVALID');
  }
  if (
    score.status !== 'PUBLISHED' ||
    numberField(score, 'totalValidDurationSeconds', 'SCORE_PUBLISH_RESPONSE_INVALID') !== 3600
  ) {
    throw new StagingBusinessOperatorFailure('SCORE_PUBLISHED_STATE_INVALID');
  }

  const studentScore = await api.request(
    'SCORE_READ_STUDENT',
    `/student-scores/${scoreId}`,
    {
      headers: { authorization: `Bearer ${student.accessToken}`, 'x-request-id': requestId('ss') },
    },
    [200],
  );
  const studentData = dataObject(studentScore, 'SCORE_STUDENT_RESPONSE_INVALID');
  if (
    studentData.status !== 'PUBLISHED' ||
    numberField(studentData, 'totalValidDurationSeconds', 'SCORE_STUDENT_RESPONSE_INVALID') !== 3600
  ) {
    throw new StagingBusinessOperatorFailure('SCORE_STUDENT_PROJECTION_INVALID');
  }
  return { totalValidDurationSeconds: 3600 };
}

async function verifyAuditEvidence(
  prisma: PrismaClient,
  state: BusinessFixtureState,
  requestIds: Set<string>,
): Promise<void> {
  const currentRun = await prisma.auditLog.findMany({
    where: {
      organizationId: state.organizationId,
      requestId: { in: [...requestIds] },
    },
    select: { requestId: true, actionType: true, outcome: true },
  });
  if (
    currentRun.length === 0 ||
    !currentRun.some(
      (row) => row.actionType === 'AUTHENTICATION_SUCCEEDED' && row.outcome === 'SUCCEEDED',
    ) ||
    !currentRun.some(
      (row) => row.actionType === 'AUTH_SESSION_REVOKED' && row.outcome === 'REJECTED',
    ) ||
    !currentRun.some(
      (row) => row.actionType === 'EXERCISE_SESSION_STARTED' && row.outcome === 'SUCCEEDED',
    ) ||
    !currentRun.some(
      (row) => row.actionType === 'EXERCISE_SESSION_CANCELLED' && row.outcome === 'SUCCEEDED',
    )
  ) {
    throw new StagingBusinessOperatorFailure('CURRENT_RUN_AUDIT_EVIDENCE_INCOMPLETE');
  }
  const requiredActions = [
    'COURSE_INVITE_CHANGED',
    'ENROLLMENT_CREATED',
    'MEDIA_UPLOAD_INITIATED',
    'MEDIA_UPLOAD_CONFIRMED',
    'MEDIA_BOUND',
    'MEDIA_PROCESSING_CHANGED',
    'EXERCISE_RECORD_DRAFT_CREATED',
    'EXERCISE_RECORD_SUBMITTED',
    'REVIEW_RESULT_CHANGED',
    'SCORE_PUBLISHED',
  ];
  const grouped = await prisma.auditLog.groupBy({
    by: ['actionType'],
    where: { organizationId: state.organizationId, actionType: { in: requiredActions } },
    _count: { _all: true },
  });
  const available = new Set(
    grouped.filter((row) => row._count._all > 0).map((row) => row.actionType),
  );
  if (requiredActions.some((action) => !available.has(action))) {
    throw new StagingBusinessOperatorFailure('BUSINESS_AUDIT_ACTIONS_INCOMPLETE');
  }
  const idempotencyOperations = [
    'createCourseInvite',
    'issueJoinCapability',
    'joinClassSectionWithInvite',
    'startExerciseSession',
    'initiateMediaUpload',
    'createExerciseRecordDraft',
    'submitExerciseRecord',
    'reviewExerciseRecord',
  ];
  const idempotencyEvidence = await prisma.idempotencyRecord.groupBy({
    by: ['operationId'],
    where: {
      organizationId: state.organizationId,
      operationId: { in: idempotencyOperations },
      status: 'COMPLETED',
    },
    _count: { _all: true },
  });
  const idempotentOperations = new Set(
    idempotencyEvidence.filter((row) => row._count._all > 0).map((row) => row.operationId),
  );
  if (idempotencyOperations.some((operation) => !idempotentOperations.has(operation))) {
    throw new StagingBusinessOperatorFailure('BUSINESS_IDEMPOTENCY_EVIDENCE_INCOMPLETE');
  }
}

async function verifyStudentRefreshReuse(
  api: StagingApi,
  student: AuthSessionProjection,
  auditRequestIds: Set<string>,
): Promise<void> {
  const rotateRequestId = requestId('sr');
  auditRequestIds.add(rotateRequestId);
  const rotatedResult = await api.request(
    'STUDENT_REFRESH',
    '/auth/refresh',
    jsonMutation({ refreshToken: student.refreshToken }, rotateRequestId),
    [200],
  );
  const rotated = authProjection(rotatedResult, 'STUDENT_REFRESH_RESPONSE_INVALID', 'STUDENT');
  let sessionClosed = false;
  try {
    const reuseRequestId = requestId('su');
    auditRequestIds.add(reuseRequestId);
    const reuse = await api.request(
      'STUDENT_REFRESH_REUSE',
      '/auth/refresh',
      jsonMutation({ refreshToken: student.refreshToken }, reuseRequestId),
      [401],
    );
    assertErrorCode(reuse.body, 'AUTH_SESSION_REVOKED', 'STUDENT_REFRESH_REUSE_CODE');
    sessionClosed = true;
  } finally {
    if (!sessionClosed) await bestEffortLogout(api, rotated);
  }
}

async function passwordLogin(
  api: StagingApi,
  operation: string,
  account: string,
  password: string,
  expectedRole: 'ADMIN' | 'TEACHER',
  auditRequestIds: Set<string>,
): Promise<AuthSessionProjection> {
  const loginRequestId = requestId('pl');
  auditRequestIds.add(loginRequestId);
  const result = await api.request(
    operation,
    '/auth/password-login',
    jsonMutation({ account, password }, loginRequestId),
    [200],
  );
  return authProjection(result, `${operation}_RESPONSE_INVALID`, expectedRole);
}

async function logoutReplay(
  api: StagingApi,
  auth: AuthSessionProjection,
  operation: string,
  auditRequestIds: Set<string>,
): Promise<void> {
  const key = `staging-business-logout-${uuidv7()}`;
  const logoutRequestId = requestId('lo');
  auditRequestIds.add(logoutRequestId);
  const init = jsonMutation(
    { refreshToken: auth.refreshToken },
    logoutRequestId,
    auth.accessToken,
    key,
  );
  await api.request(operation, '/auth/logout', init, [200]);
  await api.request(`${operation}_REPLAY`, '/auth/logout', init, [200]);
}

async function bestEffortLogout(api: StagingApi, auth: AuthSessionProjection): Promise<void> {
  try {
    await api.request(
      'SESSION_CLEANUP',
      '/auth/logout',
      jsonMutation(
        { refreshToken: auth.refreshToken },
        requestId('cl'),
        auth.accessToken,
        `staging-business-cleanup-${uuidv7()}`,
      ),
      [200],
    );
  } catch {
    // Preserve the original fixed failure code; the session also expires under the runtime policy.
  }
}

async function uploadToCos(
  uploadUrl: string,
  requiredHeaders: Record<string, unknown>,
  body: Buffer,
): Promise<Response> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(requiredHeaders)) {
    if (
      typeof value !== 'string' ||
      !['content-type', 'content-length'].includes(name.toLowerCase())
    ) {
      throw new StagingBusinessOperatorFailure('COS_REQUIRED_HEADERS_INVALID');
    }
    headers.set(name, value);
  }
  if (
    headers.get('content-type') !== 'image/png' ||
    headers.get('content-length') !== String(body.length)
  ) {
    throw new StagingBusinessOperatorFailure('COS_REQUIRED_HEADERS_MISMATCH');
  }
  let response: Response;
  try {
    response = await fetch(uploadUrl, {
      method: 'PUT',
      headers,
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new StagingBusinessOperatorFailure('COS_UPLOAD_REQUEST_FAILED');
  }
  if (response.status !== 200) {
    throw new StagingBusinessOperatorFailure('COS_UPLOAD_HTTP_STATUS');
  }
  return response;
}

async function pollMediaAvailable(
  api: StagingApi,
  mediaId: string,
  accessToken: string,
): Promise<MediaState> {
  const deadline = Date.now() + MEDIA_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await api.request(
      'MEDIA_STATUS',
      `/media/${mediaId}`,
      { headers: { authorization: `Bearer ${accessToken}`, 'x-request-id': requestId('mg') } },
      [200],
    );
    const media = mediaProjection(result, 'MEDIA_STATUS_RESPONSE_INVALID');
    if (media.uploadStatus === 'AVAILABLE') return media;
    if (media.uploadStatus === 'FAILED') {
      throw new StagingBusinessOperatorFailure('MEDIA_WORKER_REPORTED_FAILED');
    }
    if (!['BOUND', 'PROCESSING'].includes(media.uploadStatus)) {
      throw new StagingBusinessOperatorFailure('MEDIA_WORKER_STATE_INVALID');
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
  }
  throw new StagingBusinessOperatorFailure('MEDIA_WORKER_TIMEOUT');
}

async function verifyStudentRecordProjection(
  api: StagingApi,
  recordId: string,
  accessToken: string,
  expectedResult: 'INVALID' | 'VALID',
): Promise<void> {
  const result = await api.request(
    'RECORD_READ_STUDENT',
    `/exercise-records/${recordId}`,
    { headers: { authorization: `Bearer ${accessToken}`, 'x-request-id': requestId('rg') } },
    [200],
  );
  const record = dataObject(result, 'RECORD_STUDENT_RESPONSE_INVALID');
  const review = objectField(record, 'currentReview', 'RECORD_STUDENT_RESPONSE_INVALID');
  const reviewKeys = Object.keys(review).sort();
  if (
    review.result !== expectedResult ||
    reviewKeys.length !== 3 ||
    reviewKeys[0] !== 'publicComment' ||
    reviewKeys[1] !== 'reasonCode' ||
    reviewKeys[2] !== 'result' ||
    (review.reasonCode !== null && typeof review.reasonCode !== 'string') ||
    (review.publicComment !== null && typeof review.publicComment !== 'string') ||
    containsForbiddenProjectionField(record)
  ) {
    throw new StagingBusinessOperatorFailure('RECORD_STUDENT_PROJECTION_LEAK');
  }
}

function authProjection(
  result: ApiResult,
  failureCode: string,
  expectedRole: 'ADMIN' | 'TEACHER' | 'STUDENT',
): AuthSessionProjection {
  return authProjectionFromObject(dataObject(result, failureCode), failureCode, expectedRole);
}

function authProjectionFromObject(
  data: Record<string, unknown>,
  failureCode: string,
  expectedRole: 'ADMIN' | 'TEACHER' | 'STUDENT',
): AuthSessionProjection {
  const user = objectField(data, 'user', failureCode);
  if (user.role !== expectedRole) throw new StagingBusinessOperatorFailure(failureCode);
  return {
    accessToken: stringField(data, 'accessToken', failureCode),
    refreshToken: stringField(data, 'refreshToken', failureCode),
    sessionId: stringField(data, 'sessionId', failureCode),
  };
}

function mediaProjection(result: ApiResult, failureCode: string): MediaState {
  const data = dataObject(result, failureCode);
  if (Object.hasOwn(data, 'storageKey')) {
    throw new StagingBusinessOperatorFailure('MEDIA_PROJECTION_STORAGE_KEY_LEAK');
  }
  return {
    id: stringField(data, 'id', failureCode),
    uploadStatus: stringField(data, 'uploadStatus', failureCode),
    version: numberField(data, 'version', failureCode),
    verifiedContentSha256:
      data.verifiedContentSha256 === null
        ? null
        : stringField(data, 'verifiedContentSha256', failureCode),
  };
}

function recordProjection(result: ApiResult, failureCode: string): RecordState {
  const data = dataObject(result, failureCode);
  return {
    id: stringField(data, 'id', failureCode),
    status: stringField(data, 'status', failureCode),
    version: numberField(data, 'version', failureCode),
    currentReview:
      data.currentReview === null ? null : objectField(data, 'currentReview', failureCode),
  };
}

function jsonMutation(
  body: unknown,
  requestIdentifier: string,
  accessToken?: string,
  idempotencyKey = uuidv7(),
  extraHeaders: Record<string, string> = {},
): RequestInit {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
      'x-request-id': requestIdentifier,
      ...(accessToken === undefined ? {} : { authorization: `Bearer ${accessToken}` }),
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

function dataObject(result: ApiResult, failureCode: string): Record<string, unknown> {
  return objectField(result.body, 'data', failureCode);
}

function dataArray(result: ApiResult, failureCode: string): unknown[] {
  const data = result.body.data;
  if (!Array.isArray(data)) throw new StagingBusinessOperatorFailure(failureCode);
  return data;
}

function objectField(
  value: Record<string, unknown>,
  name: string,
  failureCode: string,
): Record<string, unknown> {
  const field = value[name];
  if (!isRecord(field)) throw new StagingBusinessOperatorFailure(failureCode);
  return field;
}

function stringField(value: Record<string, unknown>, name: string, failureCode: string): string {
  const field = value[name];
  if (typeof field !== 'string' || field.length === 0) {
    throw new StagingBusinessOperatorFailure(failureCode);
  }
  return field;
}

function numberField(value: Record<string, unknown>, name: string, failureCode: string): number {
  const field = value[name];
  if (typeof field !== 'number' || !Number.isSafeInteger(field)) {
    throw new StagingBusinessOperatorFailure(failureCode);
  }
  return field;
}

function assertErrorCode(
  body: Record<string, unknown>,
  expected: string,
  failureCode: string,
): void {
  if (body.code !== expected) throw new StagingBusinessOperatorFailure(failureCode);
}

export function validateCosUploadUrl(
  value: string,
  expectedOrganizationId: string,
  expectedMediaId: string,
): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new StagingBusinessOperatorFailure('COS_UPLOAD_URL_INVALID');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== STAGING_COS_HOST ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.port !== '' ||
    parsed.pathname !== `/media/${expectedOrganizationId}/${expectedMediaId}/image`
  ) {
    throw new StagingBusinessOperatorFailure('COS_UPLOAD_URL_BOUNDARY_MISMATCH');
  }
}

function containsForbiddenProjectionField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenProjectionField);
  if (!isRecord(value)) return false;
  if (Object.hasOwn(value, 'internalNote') || Object.hasOwn(value, 'storageKey')) return true;
  return Object.values(value).some(containsForbiddenProjectionField);
}

function requestId(label: string): string {
  return `sb-${label}-${uuidv7()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function defaultReadFromTty(): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    throw new StagingBusinessOperatorFailure('CONTROLLED_MAILBOX_OTP_TTY_REQUIRED');
  }
  process.stdout.write('Controlled mailbox OTP (input hidden): ');
  const input = process.stdin;
  const priorRaw = input.isRaw;
  input.setRawMode(true);
  input.resume();
  return new Promise<string>((resolvePromise, reject) => {
    let code = '';
    const restore = (): void => {
      input.off('data', onData);
      input.setRawMode(priorRaw ?? false);
      input.pause();
      process.stdout.write('\n');
    };
    const onData = (chunk: Buffer): void => {
      for (const byte of chunk) {
        if (byte === 3) {
          restore();
          reject(new StagingBusinessOperatorFailure('CONTROLLED_MAILBOX_OTP_CANCELLED'));
          return;
        }
        if (byte === 13 || byte === 10) {
          restore();
          resolvePromise(code);
          return;
        }
        if (byte === 8 || byte === 127) {
          code = code.slice(0, -1);
          continue;
        }
        const character = String.fromCharCode(byte);
        if (/^\d$/u.test(character) && code.length < 10) code += character;
      }
    };
    input.on('data', onData);
  });
}

function writeSafeResult(result: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  try {
    if (command !== 'bootstrap' && command !== 'run') {
      throw new StagingBusinessOperatorFailure('COMMAND_INVALID');
    }
    const controls = validateStagingBusinessOperatorControls(process.env, command);
    try {
      await loadRuntimeSecrets(process.env);
    } catch {
      throw new StagingBusinessOperatorFailure('RUNTIME_SECRET_LOAD_FAILED');
    }
    let config: RuntimeConfig;
    try {
      config = validateEnvironment(process.env).RUNTIME_CONFIG as RuntimeConfig;
    } catch {
      throw new StagingBusinessOperatorFailure('RUNTIME_CONFIGURATION_INVALID');
    }
    validateStagingBusinessRuntimeBoundary(config);
    const secret = await loadStagingBusinessFixtureSecret(controls.fixtureSecretFile);
    const prisma = new PrismaService(config);
    try {
      await prisma.$connect();
      if (command === 'bootstrap') {
        const outcome = await ensureStagingBusinessFixture(prisma, secret);
        writeSafeResult({
          tool: 'STAGING_BUSINESS_CLOSURE_OPERATOR',
          command,
          status: 'PASS',
          fixtureState: outcome.status,
          createdComponents: outcome.createdComponents,
          sensitiveOutput: 'REDACTED',
        });
      } else {
        const summary = await runStagingBusinessClosure(
          prisma,
          config,
          secret,
          controls.publicBaseUrl,
        );
        writeSafeResult({
          tool: 'STAGING_BUSINESS_CLOSURE_OPERATOR',
          command,
          status: 'PASS',
          ...summary,
          gates: {
            stagingOnly: 'PASS',
            publicHttps: 'PASS',
            controlledMailboxOtp: 'PASS',
            realCosPresignedUpload: 'PASS',
            mediaScannerMode: 'TEST_SIGNATURE_STAGING_ONLY',
          },
          manualEvidenceStillRequired: [
            'REAL_DEVICE_CAMERA_AND_QR_SCAN',
            'ANDROID_IOS_PERMISSION_DIALOGS',
            'REAL_15_SECOND_AUDIBLE_VIDEO_CAPTURE',
            'PRODUCTION_MEDIA_SCANNER',
          ],
          sensitiveOutput: 'REDACTED',
        });
      }
    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    writeSafeResult({
      tool: 'STAGING_BUSINESS_CLOSURE_OPERATOR',
      command: safeOperatorCommandLabel(command),
      status: 'FAIL',
      failureCode:
        error instanceof StagingBusinessOperatorFailure ? error.code : 'UNEXPECTED_FAILURE',
      sensitiveOutput: 'REDACTED',
    });
    process.exitCode = 1;
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] !== undefined && currentFile === resolve(process.argv[1])) {
  await main();
}
