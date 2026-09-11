export type OfficialRegistrationRow = { id: string; studentNumber: string; fullName: string };
export type PlatformRegistrationRow = { studentId: string; enrollmentId: string; studentNumber: string;
  fullName: string; emailVerified: boolean; enrolledInSection: boolean };
export type RegistrationStatus = 'MATCHED' | 'PENDING_REGISTRATION' | 'IDENTITY_CONFLICT' | 'EXTRA_IN_PLATFORM';
const numberKey = (value: string) => value.trim().normalize('NFC').toUpperCase();
const nameKey = (value: string) => value.trim().normalize('NFC');

/** Read-only registration facts; never merges identities or creates/removes memberships. */
export function projectRosterRegistration(official: readonly OfficialRegistrationRow[], platform: readonly PlatformRegistrationRow[]) {
  const officialGroups = new Map<string, OfficialRegistrationRow[]>();
  const platformGroups = new Map<string, PlatformRegistrationRow[]>();
  for (const row of official) {
    const key = numberKey(row.studentNumber);
    officialGroups.set(key, [...(officialGroups.get(key) ?? []), row]);
  }
  for (const row of platform) {
    const key = numberKey(row.studentNumber);
    platformGroups.set(key, [...(platformGroups.get(key) ?? []), row]);
  }
  let denominatorConfirmed = true;
  const rows = official.map(row => {
    const key = numberKey(row.studentNumber), candidates = platformGroups.get(key) ?? [];
    const ambiguousOfficial = !key || !nameKey(row.fullName) || officialGroups.get(key)!.length !== 1;
    if (ambiguousOfficial) denominatorConfirmed = false;
    const candidate = candidates.length === 1 ? candidates[0]! : null;
    let status: RegistrationStatus;
    if (ambiguousOfficial || candidates.length > 1 || (candidate && nameKey(candidate.fullName) !== nameKey(row.fullName)))
      status = 'IDENTITY_CONFLICT';
    else if (!candidate || !candidate.emailVerified || !candidate.enrolledInSection) status = 'PENDING_REGISTRATION';
    else status = 'MATCHED';
    return { rosterEntryId: row.id, studentNumber: row.studentNumber, fullName: row.fullName, status,
      studentId: status === 'IDENTITY_CONFLICT' ? null : candidate?.studentId ?? null,
      enrollmentId: status === 'IDENTITY_CONFLICT' ? null : candidate?.enrollmentId ?? null };
  });
  const extras = platform.filter(row => row.enrolledInSection && !officialGroups.has(numberKey(row.studentNumber)))
    .map(row => ({ rosterEntryId: null, studentNumber: row.studentNumber, fullName: row.fullName,
      studentId: row.studentId, enrollmentId: row.enrollmentId, status: 'EXTRA_IN_PLATFORM' as const }));
  const matchedCount = rows.filter(row => row.status === 'MATCHED').length;
  return { rows, extras, sourceRowCount: official.length,
    denominator: denominatorConfirmed ? officialGroups.size : null,
    denominatorConfirmed, matchedCount, unresolvedRowCount: rows.length - matchedCount,
    registrationComplete: denominatorConfirmed && official.length > 0 && matchedCount === officialGroups.size };
}
