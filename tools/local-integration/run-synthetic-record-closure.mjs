import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..', '..');
const backendPackagePath = resolve(repositoryRoot, 'backend', 'package.json');
const backendRequire = createRequire(pathToFileURL(backendPackagePath));
const { config: loadEnvironment } = backendRequire('dotenv');
const { Client } = backendRequire('pg');

const backendOrigin = 'http://127.0.0.1:3000';
const mailpitOrigin = 'http://127.0.0.1:8025';
const studentNumber = 'SYNTH-CLOSURE-0001';
const studentEmail = 'student.closure.local.synthetic@bnbu.invalid';
const teacherEmail = 'teacher.a.local.synthetic@bnbu.invalid';
const classCode = 'SYNTH-A-01';

loadEnvironment({
  path: resolve(repositoryRoot, 'backend', '.env'),
  override: false,
  quiet: true,
});

if (process.env.APP_ENV !== 'local') fail('REFUSED_NON_LOCAL_ENV', 2);

let databaseUrl;
try {
  databaseUrl = new URL(process.env.DATABASE_URL);
} catch {
  fail('INVALID_DATABASE_URL', 3);
}
if (
  !['127.0.0.1', 'localhost'].includes(databaseUrl.hostname) ||
  databaseUrl.port !== '5433' ||
  databaseUrl.pathname !== '/bnbu_sports'
) {
  fail('REFUSED_NON_LOCAL_DATABASE', 4);
}
const teacherPassword = process.env.LOCAL_SEED_TEACHER_PASSWORD;
if (typeof teacherPassword !== 'string' || teacherPassword.length < 12) {
  fail('INVALID_LOCAL_TEACHER_CREDENTIAL', 5);
}

const database = new Client({ connectionString: databaseUrl.toString() });

try {
  await expectApi('/api/v1/health/ready', { expected: [200] });
  await database.connect();
  const fixture = await loadFixture();
  const studentToken = await loginStudent();

  let record = await loadLatestRecord(studentToken);
  if (record === null) {
    const session = await obtainCompletedSession(studentToken, fixture.enrollment_id);
    const mediaIds = await obtainAvailableMedia(studentToken, session.id);
    const created = await expectApi('/api/v1/exercise-records', {
      method: 'POST',
      token: studentToken,
      idempotencyKey: randomUUID(),
      expected: [201],
      body: {
        sessionId: session.id,
        creditType: 'GENERAL',
        sportType: 'RUNNING',
        description: 'Synthetic Android-Web review closure',
        clientRequestId: `closure-${randomUUID()}`,
      },
    });
    record = created.data;
  }
  if (record.status === 'DRAFT') {
    const mediaIds = await obtainAvailableMedia(studentToken, record.sessionId);
    const submitted = await expectApi(`/api/v1/exercise-records/${record.id}/submit`, {
      method: 'POST',
      token: studentToken,
      idempotencyKey: randomUUID(),
      expected: [200],
      body: { mediaIds, expectedVersion: record.version },
    });
    record = submitted.data;
  }

  const teacherToken = await loginTeacher(teacherPassword);
  if (record.status === 'SUBMITTED') {
    const reviews = await expectApi(
      `/api/v1/exercise-records/${record.id}/reviews?limit=20&sort=-reviewVersion`,
      { token: teacherToken, expected: [200] },
    );
    const pending = reviews.data.find((review) => review.result === 'PENDING');
    if (pending === undefined) throw new Error('submitted record has no PENDING review');
    const current = await expectApi(`/api/v1/exercise-records/${record.id}`, {
      token: teacherToken,
      expected: [200],
    });
    await expectApi(`/api/v1/exercise-records/${record.id}/reviews`, {
      method: 'POST',
      token: teacherToken,
      idempotencyKey: randomUUID(),
      expected: [201],
      body: {
        result: 'VALID',
        publicComment: 'Synthetic cross-client closure verified',
        expectedReviewVersion: pending.reviewVersion,
        expectedVersion: current.data.version,
      },
    });
    record = (
      await expectApi(`/api/v1/exercise-records/${record.id}`, {
        token: teacherToken,
        expected: [200],
      })
    ).data;
  }
  if (record.status !== 'REVIEWED' || record.currentReview?.result !== 'VALID') {
    throw new Error(`record is not VALID and REVIEWED (status=${String(record.status)})`);
  }

  let score = await loadScore(teacherToken, fixture.enrollment_id, fixture.class_section_id);
  if (score.status !== 'PUBLISHED') {
    score = (
      await expectApi(`/api/v1/student-scores/${score.id}/publish`, {
        method: 'POST',
        token: teacherToken,
        idempotencyKey: randomUUID(),
        expected: [200],
        body: { expectedVersion: score.version },
      })
    ).data;
  }

  const studentRecord = (
    await expectApi(`/api/v1/exercise-records/${record.id}`, {
      token: studentToken,
      expected: [200],
    })
  ).data;
  const studentScore = await loadScore(studentToken, fixture.enrollment_id, fixture.class_section_id);
  if (
    studentRecord.id !== record.id ||
    studentRecord.currentReview?.result !== 'VALID' ||
    studentScore.status !== 'PUBLISHED'
  ) {
    throw new Error('student re-read did not observe the reviewed record and published score');
  }

  const evidence = await verifyDatabaseClosure(record.id);
  console.log('SYNTHETIC_RECORD_CLOSURE=PASS');
  console.log(`recordId=${record.id}`);
  console.log(
    `media=${evidence.media_count} review=VALID score=PUBLISHED studentReread=true`,
  );
} catch (error) {
  console.error('SYNTHETIC_RECORD_CLOSURE=FAILED');
  console.error(error instanceof Error ? error.message : 'Unknown local closure error');
  process.exitCode = 10;
} finally {
  await database.end().catch(() => undefined);
}

function fail(code, exitCode) {
  console.error(`SYNTHETIC_RECORD_CLOSURE=${code}`);
  process.exit(exitCode);
}

async function expectApi(
  path,
  { method = 'GET', token, idempotencyKey, body, expected, timeoutMs = 15_000 },
) {
  const response = await fetch(`${backendOrigin}${path}`, {
    method,
    headers: {
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(idempotencyKey === undefined ? {} : { 'idempotency-key': idempotencyKey }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let payload = {};
  if (text.length > 0) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`${method} ${path} returned non-JSON status=${response.status}`);
    }
  }
  if (!expected.includes(response.status)) {
    const code = typeof payload.code === 'string' ? payload.code : 'UNKNOWN';
    const requestId = typeof payload.requestId === 'string' ? payload.requestId : 'unavailable';
    throw new Error(
      `${method} ${path} failed status=${response.status} code=${code} requestId=${requestId}`,
    );
  }
  return payload;
}

async function loadFixture() {
  const result = await database.query(
    `SELECT e.id AS enrollment_id,
            cs.id AS class_section_id
       FROM student_profiles AS sp
       JOIN enrollments AS e
         ON e.student_id = sp.id
        AND e.organization_id = sp.organization_id
       JOIN class_sections AS cs
         ON cs.id = e.class_section_id
        AND cs.organization_id = e.organization_id
      WHERE sp.student_number = $1
        AND cs.class_code = $2
        AND e.status = 'ACTIVE'
        AND sp.status = 'ACTIVE'
      ORDER BY e.created_at DESC`,
    [studentNumber, classCode],
  );
  if (result.rowCount !== 1) {
    throw new Error(
      `synthetic closure fixture count=${result.rowCount}; run npm --prefix backend run db:seed:local`,
    );
  }
  return result.rows[0];
}

async function loginStudent() {
  const requestedAt = Date.now();
  const challenge = await expectApi('/api/v1/auth/student-sign-in-codes', {
    method: 'POST',
    idempotencyKey: randomUUID(),
    expected: [202],
    body: {
      organizationCode: 'BNBU',
      account: studentEmail,
      channel: 'EMAIL',
      locale: 'en',
    },
  });
  const code = await waitForMailpitCode(requestedAt);
  const verified = await expectApi('/api/v1/auth/student-sign-in-codes/verify', {
    method: 'POST',
    idempotencyKey: randomUUID(),
    expected: [200],
    body: {
      challengeId: challenge.data.challengeId,
      code,
      deviceId: 'synthetic-closure-runner',
    },
  });
  return verified.data.accessToken;
}

async function loginTeacher(password) {
  const login = await expectApi('/api/v1/auth/password-login', {
    method: 'POST',
    idempotencyKey: randomUUID(),
    expected: [200],
    body: { account: teacherEmail, password },
  });
  return login.data.accessToken;
}

async function waitForMailpitCode(requestedAt) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${mailpitOrigin}/api/v1/messages?limit=50`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (response.ok) {
      const list = await response.json();
      const messages = Array.isArray(list.messages) ? list.messages : [];
      for (const message of messages) {
        const createdAt = Date.parse(String(message.Created ?? ''));
        const recipients = JSON.stringify(message.To ?? []).toLowerCase();
        if (createdAt + 2_000 < requestedAt || !recipients.includes(studentEmail)) continue;
        const detail = await (
          await fetch(`${mailpitOrigin}/api/v1/message/${encodeURIComponent(message.ID)}`, {
            signal: AbortSignal.timeout(3_000),
          })
        ).json();
        const match = String(detail.Text ?? '').match(/(?:code is|验证码是)\s*(\d{4,10})/u);
        if (match !== null) return match[1];
      }
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error('Mailpit did not receive the synthetic student sign-in code');
}

async function loadLatestRecord(token) {
  const result = await database.query(
    `SELECT er.id, er.status
       FROM exercise_records AS er
       JOIN student_profiles AS sp
         ON sp.id = er.student_id
        AND sp.organization_id = er.organization_id
      WHERE sp.student_number = $1
      ORDER BY er.created_at DESC
      LIMIT 1`,
    [studentNumber],
  );
  if (result.rowCount === 0) return null;
  const recordId = result.rows[0].id;
  const record = await expectApi(`/api/v1/exercise-records/${recordId}`, {
    token,
    expected: [200],
  });
  return record.data;
}

async function obtainCompletedSession(token, enrollmentId) {
  const existing = await database.query(
    `SELECT es.id, es.status, es.version
       FROM exercise_sessions AS es
       JOIN student_profiles AS sp
         ON sp.id = es.student_id
        AND sp.organization_id = es.organization_id
       LEFT JOIN exercise_records AS er
         ON er.session_id = es.id
      WHERE sp.student_number = $1
        AND er.id IS NULL
        AND es.status = 'COMPLETED'
      ORDER BY es.created_at DESC
      LIMIT 1`,
    [studentNumber],
  );
  if (existing.rowCount === 1) return existing.rows[0];

  let session = (
    await expectApi(
      `/api/v1/exercise-sessions/active?enrollmentId=${encodeURIComponent(enrollmentId)}`,
      { token, expected: [200] },
    )
  ).data;
  if (session === null) {
    session = (
      await expectApi('/api/v1/exercise-sessions', {
        method: 'POST',
        token,
        idempotencyKey: randomUUID(),
        expected: [201],
        body: { enrollmentId, clientObservedAt: new Date().toISOString() },
      })
    ).data;
  }
  if (session.status !== 'IN_PROGRESS') {
    throw new Error(`synthetic session cannot be completed from ${String(session.status)}`);
  }
  const elapsed = await database.query(
    `SELECT EXTRACT(EPOCH FROM (clock_timestamp() - current_interval_started_at)) AS seconds
       FROM exercise_sessions
      WHERE id = $1`,
    [session.id],
  );
  if (Number(elapsed.rows[0]?.seconds ?? 0) < 3_600) {
    const advanced = spawnSync(
      process.execPath,
      [
        resolve(scriptDirectory, 'advance-synthetic-exercise-session.mjs'),
        '--student-number',
        studentNumber,
        '--seconds',
        '3600',
        '--apply',
      ],
      { cwd: repositoryRoot, encoding: 'utf8' },
    );
    if (advanced.status !== 0) throw new Error('synthetic session time advance failed');
  }
  session = (
    await expectApi(`/api/v1/exercise-sessions/${session.id}`, {
      token,
      expected: [200],
    })
  ).data;
  return (
    await expectApi(`/api/v1/exercise-sessions/${session.id}/finish`, {
      method: 'POST',
      token,
      idempotencyKey: randomUUID(),
      expected: [200],
      body: { expectedVersion: session.version, clientObservedAt: new Date().toISOString() },
    })
  ).data;
}

async function obtainAvailableMedia(token, sessionId) {
  let mediaIds = await availableMediaIds(sessionId);
  if (mediaIds.length > 0) return mediaIds;

  const body = syntheticPng();
  const digest = createHash('sha256').update(body).digest('hex');
  const initiated = await expectApi('/api/v1/media-uploads', {
    method: 'POST',
    token,
    idempotencyKey: randomUUID(),
    expected: [201],
    body: {
      sessionId,
      businessPurpose: 'EXERCISE_RECORD',
      mediaType: 'IMAGE',
      mimeType: 'image/png',
      fileSizeBytes: body.length,
      captureSource: 'IN_APP_CAMERA',
      declaredContentSha256: digest,
    },
  });
  const capability = initiated.data;
  const uploaded = await fetch(capability.uploadUrl, {
    method: capability.uploadMethod,
    headers: capability.requiredHeaders,
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!uploaded.ok) throw new Error(`synthetic media PUT failed status=${uploaded.status}`);
  const etag = uploaded.headers.get('etag')?.replace(/^"|"$/gu, '');
  if (etag === undefined || etag.length === 0) throw new Error('synthetic media PUT lacks ETag');
  const confirmed = await expectApi(
    `/api/v1/media-uploads/${capability.uploadSessionId}/confirm`,
    {
      method: 'POST',
      token,
      idempotencyKey: randomUUID(),
      expected: [200],
      body: { etag },
    },
  );
  await expectApi(`/api/v1/media/${capability.mediaId}/bind`, {
    method: 'POST',
    token,
    idempotencyKey: randomUUID(),
    expected: [200],
    body: { sessionId, expectedVersion: confirmed.data.version },
  });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const media = await expectApi(`/api/v1/media/${capability.mediaId}`, {
      token,
      expected: [200],
    });
    if (media.data.uploadStatus === 'AVAILABLE') break;
    if (media.data.uploadStatus === 'FAILED') {
      throw new Error('synthetic media validation failed');
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  mediaIds = await availableMediaIds(sessionId);
  if (mediaIds.length === 0) {
    throw new Error('synthetic media did not become AVAILABLE; verify MEDIA_WORKER_ENABLED');
  }
  return mediaIds;
}

async function availableMediaIds(sessionId) {
  const result = await database.query(
    `SELECT me.id
       FROM media_evidence AS me
       JOIN student_profiles AS sp
         ON sp.id = me.owner_student_id
        AND sp.organization_id = me.organization_id
      WHERE sp.student_number = $1
        AND me.session_id = $2
        AND me.business_purpose = 'EXERCISE_RECORD'
        AND me.upload_status = 'AVAILABLE'
      ORDER BY me.created_at, me.id`,
    [studentNumber, sessionId],
  );
  return result.rows.map((row) => row.id);
}

function syntheticPng() {
  const header = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(2, 16);
  header.writeUInt32BE(3, 20);
  header[24] = 8;
  header[25] = 2;
  return Buffer.concat([header, Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0])]);
}

async function loadScore(token, enrollmentId, classSectionId) {
  const scores = await expectApi(
    `/api/v1/student-scores?limit=100&classSectionId=${encodeURIComponent(classSectionId)}&enrollmentId=${encodeURIComponent(enrollmentId)}`,
    { token, expected: [200] },
  );
  const matching = scores.data.filter((candidate) => candidate.enrollmentId === enrollmentId);
  if (matching.length !== 1) throw new Error(`synthetic score count=${matching.length}`);
  return matching[0];
}

async function verifyDatabaseClosure(recordId) {
  const result = await database.query(
    `SELECT er.status,
            latest.result AS review_result,
            COUNT(DISTINCT erm.media_id)::integer AS media_count,
            COUNT(DISTINCT sc.id)::integer AS contribution_count,
            ss.published_revision_id IS NOT NULL AS score_published
       FROM exercise_records AS er
       JOIN student_profiles AS sp
         ON sp.id = er.student_id
        AND sp.organization_id = er.organization_id
       JOIN LATERAL (
         SELECT rr.result, rr.id
           FROM review_records AS rr
          WHERE rr.record_id = er.id
          ORDER BY rr.review_version DESC
          LIMIT 1
       ) AS latest ON TRUE
       LEFT JOIN exercise_record_media AS erm ON erm.record_id = er.id
       LEFT JOIN score_contributions AS sc
         ON sc.record_id = er.id
        AND sc.review_id = latest.id
       LEFT JOIN student_scores AS ss ON ss.enrollment_id = er.enrollment_id
      WHERE er.id = $1
        AND sp.student_number LIKE 'SYNTH-%'
      GROUP BY er.status, latest.result, ss.published_revision_id`,
    [recordId],
  );
  if (result.rowCount !== 1) throw new Error('synthetic closure record was not found');
  const row = result.rows[0];
  if (
    row.status !== 'REVIEWED' ||
    row.review_result !== 'VALID' ||
    row.media_count < 1 ||
    row.contribution_count < 1 ||
    row.score_published !== true
  ) {
    throw new Error('database closure invariant failed');
  }
  return row;
}
