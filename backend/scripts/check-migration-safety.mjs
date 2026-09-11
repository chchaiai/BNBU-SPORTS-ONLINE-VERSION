import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareV81MigrationScan } from './v81-migration-scan.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(scriptDirectory, '..');
const migrationsDirectory = path.join(backendDirectory, 'prisma', 'migrations');
const migrationDirectories = fs
  .readdirSync(migrationsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
import { migrationIds as expectedMigrationDirectories } from './migration-registry.mjs';

if (
  migrationDirectories.length !== expectedMigrationDirectories.length ||
  migrationDirectories.some((directory, index) => directory !== expectedMigrationDirectories[index])
) {
  throw new Error(
    `Expected exactly ${expectedMigrationDirectories.join(', ')}, found: ${migrationDirectories.join(', ')}`,
  );
}

const forbiddenSql = [
  /\bDROP\s+(?:TABLE|SCHEMA|DATABASE)\b/i,
  /\bTRUNCATE\b/i,
  /\bALTER\s+TABLE\b[^;]*?\bDROP\b/i,
  /\bDELETE\s+FROM\b/i,
];

const migrations = expectedMigrationDirectories.map((migrationId) => {
  const migrationDirectory = path.join(migrationsDirectory, migrationId);
  const sql = fs.readFileSync(path.join(migrationDirectory, 'migration.sql'), 'utf8');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(migrationDirectory, 'manifest.json'), 'utf8'),
  );
  const checksum = crypto.createHash('sha256').update(sql).digest('hex');

  if (manifest.migrationId !== migrationId) {
    throw new Error(`${migrationId}: migration ID mismatch`);
  }
  if (manifest.sha256 !== checksum) {
    throw new Error(`${migrationId}: migration checksum mismatch: ${checksum}`);
  }
  if (manifest.destructive !== false) {
    throw new Error(`${migrationId}: migration must declare destructive=false`);
  }
  let destructiveScanSql = [
    '0002_teaching_structure',
    '0005_exercise_session',
    '0006_media_evidence',
    '0007_exercise_record',
    '0010_export_audit_governance',
    '0011_client_capabilities',
    '0012_ios_auth_release_exemption',
    '0020_staging_fixture_audit_action',
    '0058_client_diagnostics_rate_limit',
  ].includes(migrationId)
    ? sql.replace(
        'DROP CONSTRAINT "audit_logs_action_type_check"',
        'REPLACE CONSTRAINT "audit_logs_action_type_check"',
      )
    : sql;
  if (migrationId === '0058_client_diagnostics_rate_limit') {
    destructiveScanSql = destructiveScanSql.replace('DROP CONSTRAINT rate_limit_windows_purpose_check;', 'REPLACE CONSTRAINT rate_limit_windows_purpose_check;');
  }
  if (migrationId === '0012_ios_auth_release_exemption') {
    destructiveScanSql = destructiveScanSql
      .replace(
        'DROP CONSTRAINT "account_recovery_challenges_role_check"',
        'REPLACE CONSTRAINT "account_recovery_challenges_role_check"',
      )
      .replace(
        'DROP CONSTRAINT "media_evidence_session_owner_organization_fkey"',
        'REPLACE CONSTRAINT "media_evidence_session_owner_organization_fkey"',
      )
      .replace(
        'DROP CONSTRAINT "media_evidence_business_purpose_check"',
        'REPLACE CONSTRAINT "media_evidence_business_purpose_check"',
      )
      .replace(
        'DROP CONSTRAINT "media_evidence_capture_source_check"',
        'REPLACE CONSTRAINT "media_evidence_capture_source_check"',
      )
      .replace(
        'ALTER COLUMN "session_id" DROP NOT NULL',
        'ALTER COLUMN "session_id" REMOVE NOT NULL',
      );
  }
  if (migrationId === '0014_email_only_auth') {
    destructiveScanSql = destructiveScanSql.replace(
      'DROP CONSTRAINT "users_status_check"',
      'REPLACE CONSTRAINT "users_status_check"',
    );
  }
  if (migrationId === '0015_email_verification_fk_alignment') {
    destructiveScanSql = destructiveScanSql
      .replace(
        'DROP CONSTRAINT "email_verification_challenges_organization_fkey"',
        'REPLACE CONSTRAINT "email_verification_challenges_organization_fkey"',
      )
      .replace(
        'DROP CONSTRAINT "email_verification_challenges_user_fkey"',
        'REPLACE CONSTRAINT "email_verification_challenges_user_fkey"',
      );
  }
  if (migrationId === '0016_optional_course_exercise_description') {
    destructiveScanSql = destructiveScanSql
      .replace(
        'DROP CONSTRAINT "exercise_records_description_check"',
        'REPLACE CONSTRAINT "exercise_records_description_check"',
      )
      .replace(
        'ALTER COLUMN "description" DROP NOT NULL',
        'ALTER COLUMN "description" REMOVE NOT NULL',
      );
  }
  if (migrationId === '0008_review_core') {
    destructiveScanSql = destructiveScanSql
      .replace(
        'DROP CONSTRAINT "review_records_shape_check"',
        'REPLACE CONSTRAINT "review_records_shape_check"',
      )
      .replace(
        'DROP CONSTRAINT "exercise_record_events_type_check"',
        'REPLACE CONSTRAINT "exercise_record_events_type_check"',
      );
  }
  if (migrationId === '0018_default_valid_exercise_reviews') {
    destructiveScanSql = destructiveScanSql.replace(
      'DROP CONSTRAINT "review_records_shape_check"',
      'REPLACE CONSTRAINT "review_records_shape_check"',
    );
  }
  if (migrationId === '0019_default_valid_initial_review_constraint') {
    destructiveScanSql = destructiveScanSql.replace(
      'DROP CONSTRAINT "review_records_initial_pending_check"',
      'REPLACE CONSTRAINT "review_records_initial_pending_check"',
    );
  }
  if (
    migrationId === '0020_staging_fixture_audit_action' &&
    (!sql.includes('DROP CONSTRAINT "audit_logs_action_type_check"') ||
      !sql.includes("'STAGING_FIXTURE_BOOTSTRAP'") ||
      !sql.includes('VALIDATE CONSTRAINT "audit_logs_action_type_check_v2"'))
  ) {
    throw new Error(
      '0020_staging_fixture_audit_action: validated audit action CHECK expansion is required',
    );
  }
  if (
    migrationId === '0002_teaching_structure' &&
    !sql.includes('DROP CONSTRAINT "audit_logs_action_type_check"')
  ) {
    throw new Error('0002_teaching_structure: audit action CHECK expansion is required');
  }
  if (
    migrationId === '0005_exercise_session' &&
    !sql.includes('DROP CONSTRAINT "audit_logs_action_type_check"')
  ) {
    throw new Error('0005_exercise_session: audit action CHECK expansion is required');
  }
  if (
    migrationId === '0006_media_evidence' &&
    !sql.includes('DROP CONSTRAINT "audit_logs_action_type_check"')
  ) {
    throw new Error('0006_media_evidence: audit action CHECK expansion is required');
  }
  if (
    migrationId === '0007_exercise_record' &&
    !sql.includes('DROP CONSTRAINT "audit_logs_action_type_check"')
  ) {
    throw new Error('0007_exercise_record: audit action CHECK expansion is required');
  }
  if (
    migrationId === '0010_export_audit_governance' &&
    (!sql.includes('DROP CONSTRAINT "audit_logs_action_type_check"') ||
      !sql.includes("'AUDIT_LOG_READ'"))
  ) {
    throw new Error('0010_export_audit_governance: audit read action CHECK expansion is required');
  }
  if (
    migrationId === '0011_client_capabilities' &&
    (!sql.includes('DROP CONSTRAINT "audit_logs_action_type_check"') ||
      !sql.includes("'LOCATION_RETENTION_APPLIED'"))
  ) {
    throw new Error(
      '0011_client_capabilities: client capability audit action expansion is required',
    );
  }
  if (
    migrationId === '0012_ios_auth_release_exemption' &&
    (!sql.includes('account_recovery_challenges_role_check') ||
      !sql.includes('app_release_policies_ios_build_number_required_check') ||
      !sql.includes('media_evidence_target_shape_check') ||
      !sql.includes('exemption_application_media_scope_guard_trigger'))
  ) {
    throw new Error(
      '0012_ios_auth_release_exemption: auth, iOS build, and exemption media invariants are required',
    );
  }
  if (Number(migrationId.slice(0,4)) >= 21) destructiveScanSql = prepareV81MigrationScan(migrationId,destructiveScanSql);
  for (const pattern of forbiddenSql) {
    if (pattern.test(destructiveScanSql)) {
      throw new Error(`${migrationId}: forbidden destructive SQL matched ${pattern}`);
    }
  }
  if (/\b(?:gen_random_uuid|uuid_generate_v\d)\s*\(/i.test(sql)) {
    throw new Error(`${migrationId}: database-generated UUID defaults violate the UUIDv7 baseline`);
  }

  return { migrationId, sql, checksum };
});

const foundation = migrations[0];
const teachingStructure = migrations[1];
const identityEnrollmentQrJoin = migrations[2];
const officialRosterAlignment = migrations[3];
const exerciseSession = migrations[4];
const mediaEvidence = migrations[5];
const exerciseRecord = migrations[6];
const reviewCore = migrations[7];
const scoreCore = migrations[8];
const exportAuditGovernance = migrations[9];
const clientCapabilities = migrations[10];
const iosAuthReleaseExemption = migrations[11];
const productionRateLimits = migrations[12];
const emailOnlyAuth = migrations[13];
const emailVerificationFkAlignment = migrations[14];
const optionalCourseExerciseDescription = migrations[15];
const stagingFixtureAuditAction = migrations[19];
const immutableFoundationChecksum =
  '0573e3d13018e0db103ef4b605eb35278723174507b37379425a489b10e1462d';
if (foundation.checksum !== immutableFoundationChecksum) {
  throw new Error('0001_greenfield_foundation is immutable and its checksum changed');
}
const immutableTeachingStructureChecksum =
  'bc62c8cc42989da02eb5be92c7c68f64a72b90e6a41b3913c169333d5fbfbc41';
if (teachingStructure.checksum !== immutableTeachingStructureChecksum) {
  throw new Error('0002_teaching_structure is immutable and its checksum changed');
}
const immutableIdentityEnrollmentQrJoinChecksum =
  '032b2f001638de63495bdb8d9bd3979ab54679eaaa7802d7526c6e5e24aaa5b7';
if (identityEnrollmentQrJoin.checksum !== immutableIdentityEnrollmentQrJoinChecksum) {
  throw new Error('0003_identity_enrollment_qr_join is immutable and its checksum changed');
}

const foundationTables = [
  'organizations',
  'system_policies',
  'users',
  'student_profiles',
  'teacher_profiles',
  'admin_profiles',
  'auth_sessions',
  'refresh_tokens',
  'semesters',
  'idempotency_records',
  'audit_logs',
  'outbox_events',
];
const teachingStructureTables = ['courses', 'class_sections', 'class_section_excluded_dates'];
const identityEnrollmentQrJoinTables = [
  'course_invites',
  'enrollments',
  'enrollment_status_events',
  'join_capabilities',
];
const officialRosterAlignmentTables = [
  'official_roster_imports',
  'official_roster_entries',
  'roster_alignment_runs',
  'roster_alignment_platform_entries',
  'roster_alignment_results',
  'roster_resolution_events',
];
const exerciseSessionTables = [
  'exercise_sessions',
  'exercise_session_segments',
  'exercise_session_events',
];
const mediaEvidenceTables = [
  'media_evidence',
  'media_upload_sessions',
  'media_status_events',
  'media_processing_attempts',
];
const exerciseRecordTables = [
  'exercise_records',
  'exercise_record_media',
  'exercise_record_daily_slots',
  'exercise_record_events',
  'review_records',
];
const scoreTables = [
  'score_rules',
  'score_rule_approval_events',
  'student_scores',
  'student_score_revisions',
  'score_contributions',
  'score_adjustments',
  'score_adjustment_approval_events',
  'score_publication_events',
  'score_recalculation_attempts',
];
const clientCapabilityTables = [
  'student_sign_in_challenges',
  'account_recovery_challenges',
  'auth_rate_limit_facts',
  'app_release_policies',
  'notifications',
  'notification_events',
  'push_devices',
  'push_device_events',
  'user_preferences',
  'user_preference_events',
  'help_articles',
  'feedback',
  'feedback_events',
  'exemption_applications',
  'exemption_application_events',
  'exemption_review_records',
  'exemption_application_media',
  'sport_catalog_items',
  'location_privacy_policies',
  'location_consents',
  'location_consent_events',
  'location_tracks',
  'location_track_events',
  'location_samples',
  'location_sample_secrets',
  'location_summaries',
  'location_retention_events',
];

function assertExactTables(migration, expectedTables) {
  const createdTables = [...migration.sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map(
    (match) => match[1],
  );
  if (
    createdTables.length !== expectedTables.length ||
    expectedTables.some((table) => !createdTables.includes(table))
  ) {
    throw new Error(
      `${migration.migrationId}: expected exactly ${expectedTables.join(', ')}, found ${createdTables.join(', ')}`,
    );
  }
}

assertExactTables(foundation, foundationTables);
assertExactTables(teachingStructure, teachingStructureTables);
assertExactTables(identityEnrollmentQrJoin, identityEnrollmentQrJoinTables);
assertExactTables(officialRosterAlignment, officialRosterAlignmentTables);
assertExactTables(exerciseSession, exerciseSessionTables);
assertExactTables(mediaEvidence, mediaEvidenceTables);
assertExactTables(exerciseRecord, exerciseRecordTables);
assertExactTables(reviewCore, []);
assertExactTables(scoreCore, scoreTables);
assertExactTables(exportAuditGovernance, []);
assertExactTables(clientCapabilities, clientCapabilityTables);
assertExactTables(iosAuthReleaseExemption, []);
assertExactTables(productionRateLimits, ['rate_limit_windows']);
assertExactTables(stagingFixtureAuditAction, []);

const laterBusinessTables = ['export_jobs'];
for (const table of laterBusinessTables) {
  if (migrations.some(({ sql }) => sql.includes(`CREATE TABLE "${table}"`))) {
    throw new Error(`Later business-gated table must not exist: ${table}`);
  }
}
for (const table of ['score_rules', 'student_scores', 'score_adjustments']) {
  if (migrations.slice(0, 8).some(({ sql }) => sql.includes(`CREATE TABLE "${table}"`))) {
    throw new Error(`Score table appeared before 0009_score: ${table}`);
  }
}

const foundationInvariants = [
  'semesters_one_current_per_organization_idx',
  'refresh_tokens_parent_token_id_organization_id_fkey',
  'refresh_tokens_replaced_by_token_id_organization_id_fkey',
  'users_role_check',
  'student_profiles_grade_year_check',
  'audit_logs_action_type_check',
  'audit_logs_append_only_trigger',
  'student_profiles_role_exclusivity_trigger',
  'outbox_events_state_shape_check',
];
const teachingStructureInvariants = [
  'courses_organization_course_code_key',
  'courses_created_by_organization_id_fkey',
  'courses_status_check',
  'class_sections_semester_course_class_code_key',
  'class_sections_course_id_organization_id_fkey',
  'class_sections_semester_id_organization_id_fkey',
  'class_sections_teacher_id_organization_id_fkey',
  'class_sections_close_shape_check',
  'class_sections_calendar_trigger',
  'class_section_excluded_dates_range_trigger',
  "'COURSE_UPDATED'",
  "'COURSE_STATUS_CHANGED'",
];
const identityEnrollmentQrJoinInvariants = [
  'course_invites_one_active_per_section_idx',
  'course_invites_token_hash_key',
  'join_capabilities_token_hash_key',
  'join_capabilities_consumed_shape_check',
  'enrollments_class_section_student_key',
  'enrollments_one_active_per_semester_student_idx',
  'enrollments_class_section_semester_organization_fkey',
  'enrollment_status_events_append_only_trigger',
  'student_profiles_id_organization_id_key',
  'class_sections_id_semester_organization_key',
];
const officialRosterAlignmentInvariants = [
  'official_roster_imports_one_current_per_section_idx',
  'official_roster_imports_section_version_key',
  'official_roster_imports_mutation_guard_trigger',
  'official_roster_entries_valid_student_number_key',
  'official_roster_entries_append_only_trigger',
  'roster_alignment_runs_one_running_per_section_idx',
  'roster_alignment_runs_one_current_per_section_idx',
  'roster_alignment_runs_mutation_guard_trigger',
  'roster_platform_entries_append_only_trigger',
  'roster_alignment_results_current_section_subject_key',
  'roster_alignment_results_mutation_guard_trigger',
  'roster_resolution_events_evidence_reference_check',
  'roster_resolution_events_append_only_trigger',
  'enrollments_id_semester_section_student_organization_key',
  'enrollment_status_events_id_organization_id_key',
];
const exerciseSessionInvariants = [
  'exercise_sessions_one_active_student_key',
  'exercise_sessions_enrollment_scope_fkey',
  'exercise_sessions_mutation_guard_trigger',
  'exercise_session_segments_one_open_key',
  'exercise_session_segments_session_sequence_key',
  'exercise_session_segments_mutation_guard_trigger',
  'exercise_session_events_session_version_key',
  'exercise_session_events_session_client_event_key',
  'exercise_session_events_append_only_trigger',
  'exercise_sessions_actual_duration_check',
  'exercise_sessions_terminal_shape_check',
];
const mediaEvidenceInvariants = [
  'exercise_sessions_id_student_organization_key',
  'media_evidence_session_owner_organization_fkey',
  'media_evidence_verified_facts_check',
  'media_evidence_verified_complete_check',
  'media_evidence_active_quota_check',
  'media_evidence_mutation_guard_trigger',
  'media_upload_sessions_media_organization_key',
  'media_upload_sessions_mutation_guard_trigger',
  'media_status_events_media_version_key',
  'media_status_events_append_only_trigger',
  'media_processing_attempts_media_attempt_phase_key',
  'media_processing_attempts_append_only_trigger',
  "'MEDIA_UPLOAD_INITIATED'",
  "'MEDIA_UPLOAD_CONFIRMED'",
];
const exerciseRecordInvariants = [
  'exercise_records_session_id_key',
  'exercise_records_enrollment_scope_fkey',
  'exercise_records_session_scope_fkey',
  'exercise_records_mutation_guard_trigger',
  'exercise_records_no_delete_trigger',
  'exercise_record_media_media_id_key',
  'exercise_record_media_insert_guard_trigger',
  'exercise_record_media_append_only_trigger',
  'exercise_record_daily_slots_pkey',
  'exercise_record_daily_slots_append_only_trigger',
  'exercise_record_events_record_version_key',
  'exercise_record_events_append_only_trigger',
  'review_records_record_version_key',
  'review_records_initial_pending_check',
  'review_records_append_only_trigger',
  "'EXERCISE_RECORD_DRAFT_CREATED'",
  "'EXERCISE_RECORD_DRAFT_UPDATED'",
  "'EXERCISE_RECORD_SUBMITTED'",
  "'EXERCISE_RECORD_DISCARDED'",
];

for (const invariant of foundationInvariants) {
  if (!foundation.sql.includes(invariant)) {
    throw new Error(`0001_greenfield_foundation: missing invariant ${invariant}`);
  }
}
for (const invariant of teachingStructureInvariants) {
  if (!teachingStructure.sql.includes(invariant)) {
    throw new Error(`0002_teaching_structure: missing invariant ${invariant}`);
  }
}
for (const invariant of identityEnrollmentQrJoinInvariants) {
  if (!identityEnrollmentQrJoin.sql.includes(invariant)) {
    throw new Error(`0003_identity_enrollment_qr_join: missing invariant ${invariant}`);
  }
}
for (const invariant of officialRosterAlignmentInvariants) {
  if (!officialRosterAlignment.sql.includes(invariant)) {
    throw new Error(`0004_official_roster_alignment: missing invariant ${invariant}`);
  }
}
for (const invariant of exerciseSessionInvariants) {
  if (!exerciseSession.sql.includes(invariant)) {
    throw new Error(`0005_exercise_session: missing invariant ${invariant}`);
  }
}
for (const invariant of mediaEvidenceInvariants) {
  if (!mediaEvidence.sql.includes(invariant)) {
    throw new Error(`0006_media_evidence: missing invariant ${invariant}`);
  }
}
for (const invariant of exerciseRecordInvariants) {
  if (!exerciseRecord.sql.includes(invariant)) {
    throw new Error(`0007_exercise_record: missing invariant ${invariant}`);
  }
}
const reviewCoreInvariants = [
  'review_records_insert_guard_trigger',
  'review_records_previous_version_check',
  "'REVIEWED'",
  "'REOPENED'",
  `(OLD."status" = 'REVIEWED' AND NEW."status" = 'SUBMITTED')`,
];
for (const invariant of reviewCoreInvariants) {
  if (!reviewCore.sql.includes(invariant)) {
    throw new Error(`0008_review_core: missing invariant ${invariant}`);
  }
}

const scoreCoreInvariants = [
  'score_rules_one_active_per_section_key',
  'score_rules_definition_guard_trigger',
  'score_rule_approval_events_append_only_trigger',
  'student_scores_enrollment_scope_fkey',
  'student_score_revisions_source_key',
  'student_score_revisions_append_only_trigger',
  'score_contributions_revision_record_key',
  'score_contributions_append_only_trigger',
  'score_adjustments_values_check',
  'score_adjustments_definition_guard_trigger',
  'score_adjustment_approval_events_append_only_trigger',
  'score_publication_events_append_only_trigger',
  'score_recalculation_attempts_source_key',
];
for (const invariant of scoreCoreInvariants) {
  if (!scoreCore.sql.includes(invariant)) {
    throw new Error(`0009_score: missing invariant ${invariant}`);
  }
}

for (const invariant of ['audit_logs_action_type_check', "'AUDIT_LOG_READ'"]) {
  if (!exportAuditGovernance.sql.includes(invariant)) {
    throw new Error(`0010_export_audit_governance: missing invariant ${invariant}`);
  }
}

const clientCapabilityInvariants = [
  'student_sign_in_challenges_consumed_shape_check',
  'auth_rate_limit_facts_scope_occurred_idx',
  'app_release_policies_platform_version_key',
  'app_release_policies_download_url_check',
  'notifications_recipient_unread_idx',
  'notifications_guard_trigger',
  'push_devices_registration_token_hash_key',
  'push_devices_guard_trigger',
  'notification_events_append_only_trigger',
  'user_preferences_guard_trigger',
  'feedback_guard_trigger',
  'help_articles_active_content_check',
  'exemption_applications_enrollment_id_semester_id_class_sec_fkey',
  'exemption_applications_mutation_guard_trigger',
  'location_privacy_policies_parameter_check',
  'location_consents_mutation_guard_trigger',
  'location_tracks_session_scope_key',
  'location_tracks_mutation_guard_trigger',
  'location_samples_track_sample_key',
  'location_samples_no_update_trigger',
  'location_sample_secrets_no_update_trigger',
  'location_retention_events_append_only_trigger',
  "'IOS'",
  "'LOCATION_RETENTION_APPLIED'",
];
for (const invariant of clientCapabilityInvariants) {
  if (!clientCapabilities.sql.includes(invariant)) {
    throw new Error(`0011_client_capabilities: missing invariant ${invariant}`);
  }
}

const productionRateLimitInvariants = [
  'rate_limit_windows_pkey',
  'rate_limit_windows_purpose_check',
  'rate_limit_windows_scope_digest_check',
  'rate_limit_windows_count_check',
  'rate_limit_windows_time_check',
  'rate_limit_windows_reset_at_idx',
];
for (const invariant of productionRateLimitInvariants) {
  if (!productionRateLimits.sql.includes(invariant)) {
    throw new Error(`0013_production_rate_limits: missing invariant ${invariant}`);
  }
}

const emailOnlyAuthInvariants = [
  'email_verification_challenges_pkey',
  'email_verification_challenges_id_organization_key',
  'email_verification_challenges_organization_fkey',
  'email_verification_challenges_user_fkey',
  'email_verification_challenges_mode_check',
  'email_verification_challenges_mode_code_check',
  'email_verification_challenges_status_check',
  'email_verification_challenges_user_requested_idx',
  'email_verification_challenges_status_expires_idx',
  "'PENDING_CONTACT_BINDING'",
];
for (const invariant of emailOnlyAuthInvariants) {
  if (!emailOnlyAuth.sql.includes(invariant)) {
    throw new Error(`0014_email_only_auth: missing invariant ${invariant}`);
  }
}
if (/"(?:primary_phone|phone_verified_at)"|'PHONE'/i.test(emailOnlyAuth.sql)) {
  throw new Error('0014_email_only_auth: legacy phone data must remain untouched');
}
for (const invariant of [
  'email_verification_challenges_organization_fkey',
  'email_verification_challenges_user_fkey',
  'ON DELETE RESTRICT ON UPDATE CASCADE',
]) {
  if (!emailVerificationFkAlignment.sql.includes(invariant)) {
    throw new Error(`0015_email_verification_fk_alignment: missing invariant ${invariant}`);
  }
}

for (const invariant of [
  'audit_logs_action_type_check_v2',
  'VALIDATE CONSTRAINT "audit_logs_action_type_check_v2"',
  'RENAME CONSTRAINT "audit_logs_action_type_check_v2" TO "audit_logs_action_type_check"',
  "'STAGING_FIXTURE_BOOTSTRAP'",
]) {
  if (!stagingFixtureAuditAction.sql.includes(invariant)) {
    throw new Error(`0020_staging_fixture_audit_action: missing invariant ${invariant}`);
  }
}
const exemptionApplicationDetails = migrations.find(
  ({ migrationId }) => migrationId === '0017_exemption_application_details',
);
if (exemptionApplicationDetails === undefined) {
  throw new Error('0017_exemption_application_details: migration is missing');
}
for (const invariant of [
  'application_subtype',
  'organization_name',
  'exemption_applications_detail_check',
  "'RUN_800M'",
  "'RUN_1000M'",
  "'SCHOOL_TEAM'",
  "'STUDENT_CLUB'",
]) {
  if (!exemptionApplicationDetails.sql.includes(invariant)) {
    throw new Error(`0017_exemption_application_details: missing invariant ${invariant}`);
  }
}
for (const invariant of [
  'exercise_records_description_check',
  'exercise_records_description_by_credit_type_check',
  'ALTER COLUMN "description" DROP NOT NULL',
  '"credit_type" = \'GENERAL\'',
  '"credit_type" = \'COURSE_RELATED\'',
]) {
  if (!optionalCourseExerciseDescription.sql.includes(invariant)) {
    throw new Error(`0016_optional_course_exercise_description: missing invariant ${invariant}`);
  }
}

for (const migration of migrations) {
  const foreignKeyCount = (migration.sql.match(/\bFOREIGN KEY\b/g) ?? []).length;
  const uniqueCount = (migration.sql.match(/CREATE UNIQUE INDEX/g) ?? []).length;
  const checkCount = (migration.sql.match(/CONSTRAINT (?:"[^"]+"|[a-z_][a-z_0-9]*)\s+CHECK/gi) ?? []).length;
  const indexCount = (migration.sql.match(/CREATE(?: UNIQUE)? INDEX/g) ?? []).length;
  process.stdout.write(
    `${migration.migrationId}: PASS (${[...migration.sql.matchAll(/CREATE TABLE (?:"([^"]+)"|([a-z_][a-z_0-9]*))/gi)].length} table declarations, ${foreignKeyCount} foreign keys, ${uniqueCount} unique indexes, ${checkCount} checks, ${indexCount} total indexes, sha256=${migration.checksum})\n`,
  );
}
process.stdout.write(
  `Migration safety: PASS (${migrations.length} registered migrations; static checks do not replace database execution)\n`,
);
