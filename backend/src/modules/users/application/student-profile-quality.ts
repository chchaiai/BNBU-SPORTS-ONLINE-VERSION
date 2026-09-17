import { Prisma } from '../../../generated/prisma/client.js';
import { ApplicationError } from '../../../common/errors/application-error.js';
import { STUDENT_REGION_CODES } from './student-identity-normalizer.js';
import { validAcademicDetails, isConfirmedMajor } from './student-academics.js';

export interface QualityProfile {
  id: string; organizationId: string; version: number; studentNumber: string;
  fullName: string; gender: string; gradeYear: number;
  collegeName: string | null; majorName: string | null;
  dateOfBirth?: Date | string | null; regionCode?: string | null; otherRegionName?: string | null;
}
export interface ProfileQuality {
  profileQualityStatus: 'NORMAL' | 'REQUIRES_PROFILE_UPDATE' | 'PENDING_REVIEW';
  profileQualityReasons: string[];
  profileConfirmedAt: string | null;
  majorConfirmationLocked?: boolean;
}
export function inspectProfile(profile: QualityProfile, confirmed = false): ProfileQuality {
  const reasons: string[] = [];
  if (!/^2\d{9}$/.test(profile.studentNumber)) reasons.push('studentNumber');
  const name = profile.fullName.trim();
  if (!name || name.length > 100 || (!/^[\p{L}\p{M} .·'’-]+$/u.test(name) || !/\p{L}/u.test(name))) reasons.push('fullName');
  if (!['MALE', 'FEMALE', 'OTHER'].includes(profile.gender)) reasons.push('gender');
  if (!Number.isInteger(profile.gradeYear) || profile.gradeYear < 1900 || profile.gradeYear > new Date().getUTCFullYear() + 1) reasons.push('gradeYear');
  if (!validAcademicDetails(profile.collegeName ?? '', profile.majorName ?? '')) reasons.push('collegeName', 'majorName');
  const birth = profile.dateOfBirth instanceof Date ? profile.dateOfBirth.toISOString().slice(0,10) : profile.dateOfBirth;
  const at = birth ? new Date(birth + 'T00:00:00Z') : null;
  if (!birth || !/^\d{4}-\d{2}-\d{2}$/.test(birth) || !at || !Number.isFinite(at.getTime()) || at.toISOString().slice(0,10) !== birth || birth < '1900-01-01' || at > new Date()) reasons.push('dateOfBirth');
  if (!STUDENT_REGION_CODES.has(profile.regionCode ?? '') || (profile.regionCode === 'OTHER' && !profile.otherRegionName?.trim())) reasons.push('regionCode');
  const suspicious = !confirmed && (Array.from(name).length < 2 || (!/^[\p{L}\p{M} .·'’-]+$/u.test(name) || !/\p{L}/u.test(name)) || /^(学生|同学|测试|昵称|匿名|student|test|admin)$/iu.test(name));
  return { profileQualityStatus: reasons.length ? 'REQUIRES_PROFILE_UPDATE' : suspicious ? 'PENDING_REVIEW' : 'NORMAL',
    profileQualityReasons: reasons.length ? reasons : suspicious ? ['fullName.review'] : [], profileConfirmedAt: null };
}
type QualityDb = Pick<Prisma.TransactionClient, '$queryRaw' | 'studentProfile'>;
export async function readProfileQualities(db: QualityDb, profiles: QualityProfile[]): Promise<Map<string, ProfileQuality>> {
  if (!profiles.length) return new Map();
  const events = await db.$queryRaw<{ resource_id: string; event_type: string; version: number; occurred_at: Date; confirmed_at: Date | null; facts: { reason?: string } }[]>(Prisma.sql`
    SELECT DISTINCT ON (resource_id) resource_id,event_type,version,occurred_at,facts,
      MAX(CASE WHEN event_type='PROFILE_QUALITY_CONFIRMED' THEN occurred_at END) OVER (PARTITION BY resource_id) AS confirmed_at FROM v81_events
    WHERE organization_id=${profiles[0]!.organizationId}::uuid AND resource_type='STUDENT_PROFILE'
      AND resource_id IN (${Prisma.join(profiles.map(p=>Prisma.sql`${p.id}::uuid`))})
      AND event_type IN ('PROFILE_QUALITY_CONFIRMED','PROFILE_UPDATE_REQUIRED')
    ORDER BY resource_id,version DESC,occurred_at DESC,id DESC`);
  const byId = new Map(events.map(e=>[e.resource_id,e]));
  const lockedMajors = await db.$queryRaw<{resource_id:string}[]>(Prisma.sql`
    SELECT DISTINCT resource_id FROM v81_events WHERE organization_id=${profiles[0]!.organizationId}::uuid
      AND resource_type='STUDENT_MAJOR' AND event_type IN ('MAJOR_CONFIRMED','MAJOR_CORRECTED')
      AND facts->>'locked'='true'
      AND resource_id IN (${Prisma.join(profiles.map(p=>Prisma.sql`${p.id}::uuid`))})`);
  const lockedIds = new Set(lockedMajors.map(row=>row.resource_id));
  return new Map(profiles.map(profile=>{
    const event=byId.get(profile.id);
    const quality=inspectProfile(profile,event?.event_type==='PROFILE_QUALITY_CONFIRMED' && event.version===profile.version);
    if(event?.event_type==='PROFILE_UPDATE_REQUIRED') {
      quality.profileQualityStatus='REQUIRES_PROFILE_UPDATE';
      quality.profileQualityReasons.push('manual:' + (event.facts.reason ?? '请确认个人资料'));
    }
    quality.profileConfirmedAt=event?.confirmed_at?.toISOString() ?? null;
    quality.majorConfirmationLocked=lockedIds.has(profile.id) || isConfirmedMajor(profile.collegeName,profile.majorName);
    return [profile.id,quality];
  }));
}
export async function assertProfileReady(db: QualityDb, organizationId: string, userId: string) {
  const profile=await db.studentProfile.findFirst({where:{organizationId,userId,deletedAt:null}});
  if(!profile) throw new ApplicationError('USER_NOT_FOUND',404);
  const quality=(await readProfileQualities(db,[profile])).get(profile.id)!;
  if(quality.profileQualityStatus==='REQUIRES_PROFILE_UPDATE') throw new ApplicationError('USER_PROFILE_INVALID',422,{reason:'REQUIRES_PROFILE_UPDATE',fieldErrors:quality.profileQualityReasons.map(field=>({field,code:'INVALID',i18nKey:'error.user.profileInvalid',params:{}}))});
}
