import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..', '..');
const backendPackagePath = resolve(repositoryRoot, 'backend', 'package.json');
const backendRequire = createRequire(pathToFileURL(backendPackagePath));
const { config: loadEnvironment } = backendRequire('dotenv');
const { Client } = backendRequire('pg');

const argumentsByName = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === '--apply') {
    argumentsByName.set('apply', true);
    continue;
  }
  if (!argument.startsWith('--') || index + 1 >= process.argv.length) {
    console.error('SYNTHETIC_SESSION_ADVANCE=INVALID_ARGUMENTS');
    process.exit(2);
  }
  argumentsByName.set(argument.slice(2), process.argv[index + 1]);
  index += 1;
}

const studentNumber = argumentsByName.get('student-number');
const seconds = Number(argumentsByName.get('seconds') ?? '3600');
const apply = argumentsByName.get('apply') === true;

if (typeof studentNumber !== 'string' || !/^SYNTH-[A-Z0-9-]{1,26}$/.test(studentNumber)) {
  console.error('SYNTHETIC_SESSION_ADVANCE=REFUSED_NON_SYNTHETIC_STUDENT');
  process.exit(3);
}
if (seconds !== 3600) {
  console.error('SYNTHETIC_SESSION_ADVANCE=REFUSED_DURATION seconds_must_equal=3600');
  process.exit(4);
}

loadEnvironment({
  path: resolve(repositoryRoot, 'backend', '.env'),
  override: false,
  quiet: true,
});

if (process.env.APP_ENV !== 'local') {
  console.error('SYNTHETIC_SESSION_ADVANCE=REFUSED_NON_LOCAL_ENV');
  process.exit(5);
}

let databaseUrl;
try {
  databaseUrl = new URL(process.env.DATABASE_URL);
} catch {
  console.error('SYNTHETIC_SESSION_ADVANCE=INVALID_DATABASE_URL');
  process.exit(6);
}

if (
  !['127.0.0.1', 'localhost'].includes(databaseUrl.hostname) ||
  databaseUrl.port !== '5433' ||
  databaseUrl.pathname !== '/bnbu_sports'
) {
  console.error('SYNTHETIC_SESSION_ADVANCE=REFUSED_NON_LOCAL_DATABASE');
  process.exit(7);
}

const bootstrapUser = process.env.POSTGRES_BOOTSTRAP_USER;
const bootstrapPassword = process.env.POSTGRES_BOOTSTRAP_PASSWORD;
if (
  typeof bootstrapUser !== 'string' ||
  !/^bnbu_bootstrap$/.test(bootstrapUser) ||
  typeof bootstrapPassword !== 'string' ||
  bootstrapPassword.length < 16
) {
  console.error('SYNTHETIC_SESSION_ADVANCE=INVALID_LOCAL_BOOTSTRAP_CREDENTIALS');
  process.exit(8);
}

const bootstrapUrl = new URL(databaseUrl);
bootstrapUrl.username = bootstrapUser;
bootstrapUrl.password = bootstrapPassword;
const client = new Client({ connectionString: bootstrapUrl.toString() });

try {
  await client.connect();
  await client.query('BEGIN');
  const active = await client.query(
    `SELECT es.id AS session_id,
            es.current_interval_started_at,
            seg.id AS segment_id,
            seg.started_at AS segment_started_at,
            seg.segment_type
       FROM exercise_sessions AS es
       JOIN student_profiles AS sp
         ON sp.id = es.student_id
        AND sp.organization_id = es.organization_id
       JOIN exercise_session_segments AS seg
         ON seg.exercise_session_id = es.id
        AND seg.organization_id = es.organization_id
        AND seg.ended_at IS NULL
      WHERE sp.student_number = $1
        AND es.status = 'IN_PROGRESS'
      ORDER BY es.created_at DESC
      FOR UPDATE OF es, seg`,
    [studentNumber],
  );

  if (active.rowCount !== 1) {
    await client.query('ROLLBACK');
    console.error(`SYNTHETIC_SESSION_ADVANCE=REFUSED_ACTIVE_SESSION_COUNT count=${active.rowCount}`);
    process.exit(8);
  }

  const session = active.rows[0];
  if (
    session.segment_type !== 'RUNNING' ||
    session.current_interval_started_at === null ||
    session.segment_started_at.getTime() !== session.current_interval_started_at.getTime()
  ) {
    await client.query('ROLLBACK');
    console.error('SYNTHETIC_SESSION_ADVANCE=REFUSED_INVALID_TIMELINE');
    process.exit(9);
  }

  if (!apply) {
    await client.query('ROLLBACK');
    console.log('SYNTHETIC_SESSION_ADVANCE=DRY_RUN_PASS');
    console.log('eligibleActiveSessions=1 seconds=3600 mutation=false');
    process.exit(0);
  }

  // The normal mutation guard intentionally forbids same-state timeline rewrites.
  // This superuser-only setting is transaction-local and is used solely to shift
  // the two already-locked timestamps; the real finish API still owns the
  // version, domain event, audit log, outbox, and terminal state transition.
  await client.query("SET LOCAL session_replication_role = 'replica'");
  await client.query(
    `UPDATE exercise_sessions
        SET current_interval_started_at = current_interval_started_at - ($2::integer * INTERVAL '1 second')
      WHERE id = $1`,
    [session.session_id, seconds],
  );
  await client.query(
    `UPDATE exercise_session_segments
        SET started_at = started_at - ($2::integer * INTERVAL '1 second')
      WHERE id = $1`,
    [session.segment_id, seconds],
  );
  await client.query('COMMIT');
  console.log('SYNTHETIC_SESSION_ADVANCE=PASS');
  console.log('eligibleActiveSessions=1 seconds=3600 mutation=true');
} catch (error) {
  try {
    await client.query('ROLLBACK');
  } catch {
    // The connection may have failed before a transaction was opened.
  }
  console.error('SYNTHETIC_SESSION_ADVANCE=FAILED');
  console.error(error instanceof Error ? error.message : 'Unknown database error');
  process.exitCode = 10;
} finally {
  await client.end().catch(() => undefined);
}
