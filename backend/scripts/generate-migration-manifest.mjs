import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(scriptDirectory, '..');
import { migrationIds } from './migration-registry.mjs';
const outputPath = path.join(
  backendDirectory,
  'src',
  'generated',
  'migration-manifest.generated.ts',
);
const checkOnly = process.argv.includes('--check');
const manifests = migrationIds.map((migrationId) => {
  const manifestPath = path.join(
    backendDirectory,
    'prisma',
    'migrations',
    migrationId,
    'manifest.json',
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (
    manifest.migrationId !== migrationId ||
    !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
    manifest.destructive !== false
  ) {
    throw new Error(`${migrationId} manifest is invalid`);
  }
  return manifest;
});

const generated = `// Generated from the authoritative Prisma migration manifests. Do not edit.\n\nexport const foundationMigrations = [\n${manifests
  .map(
    (manifest) =>
      `  {\n    migrationId: '${manifest.migrationId}',\n    sha256: '${manifest.sha256}',\n    destructive: false,\n  },`,
  )
  .join(
    '\n',
  )}\n] as const;\n\nexport const foundationMigration = foundationMigrations[0];\nexport const teachingStructureMigration = foundationMigrations[1];\nexport const identityEnrollmentQrJoinMigration = foundationMigrations[2];\nexport const officialRosterAlignmentMigration = foundationMigrations[3];\nexport const exerciseSessionMigration = foundationMigrations[4];\nexport const mediaEvidenceMigration = foundationMigrations[5];\n`;

const generatedWithExerciseRecord = `${generated}export const exerciseRecordMigration = foundationMigrations[6];\nexport const reviewCoreMigration = foundationMigrations[7];\nexport const scoreCoreMigration = foundationMigrations[8];\nexport const exportAuditGovernanceMigration = foundationMigrations[9];\n`;
const generatedWithClientCapabilities = `${generatedWithExerciseRecord}export const clientCapabilitiesMigration = foundationMigrations[10];\n`;
const generatedWithIosIntegration = `${generatedWithClientCapabilities}export const iosAuthReleaseExemptionMigration = foundationMigrations[11];\n`;
const generatedWithProductionRateLimits = `${generatedWithIosIntegration}export const productionRateLimitsMigration = foundationMigrations[12];\n`;
const generatedWithEmailOnlyAuth = `${generatedWithProductionRateLimits}export const emailOnlyAuthMigration = foundationMigrations[13];\n`;
const generatedWithEmailVerificationFkAlignment = `${generatedWithEmailOnlyAuth}export const emailVerificationFkAlignmentMigration = foundationMigrations[14];\n`;
const generatedWithOptionalCourseExerciseDescription = `${generatedWithEmailVerificationFkAlignment}export const optionalCourseExerciseDescriptionMigration = foundationMigrations[15];\n`;
const generatedWithExemptionApplicationDetails = `${generatedWithOptionalCourseExerciseDescription}export const exemptionApplicationDetailsMigration = foundationMigrations[16];\n`;
const generatedWithDefaultValidExerciseReviews = `${generatedWithExemptionApplicationDetails}export const defaultValidExerciseReviewsMigration = foundationMigrations[17];\n`;
const generatedWithDefaultValidInitialReviewConstraint = `${generatedWithDefaultValidExerciseReviews}export const defaultValidInitialReviewConstraintMigration = foundationMigrations[18];\n`;
const generatedWithStagingFixtureAuditAction = `${generatedWithDefaultValidInitialReviewConstraint}export const stagingFixtureAuditActionMigration = foundationMigrations[19];\n`;

if (checkOnly) {
  if (
    !fs.existsSync(outputPath) ||
    fs.readFileSync(outputPath, 'utf8') !== generatedWithStagingFixtureAuditAction
  ) {
    throw new Error('Generated migration manifest is stale; run npm run db:manifest:generate');
  }
  process.stdout.write('Generated migration manifest: PASS\n');
} else {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, generatedWithStagingFixtureAuditAction, 'utf8');
  process.stdout.write('Generated migration manifest updated.\n');
}
