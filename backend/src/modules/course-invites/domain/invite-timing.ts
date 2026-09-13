import { ApplicationError } from '../../../common/errors/application-error.js';

export const INVITE_DEFAULT_MINUTES = 30;
export const INVITE_GRACE_MS = 10 * 60_000;

export function resolveInviteExpiry(input: { expiresAt?: string | null; expiresInMinutes?: number }, now: Date, semesterEnd: Date): Date {
  if (input.expiresAt != null && input.expiresInMinutes !== undefined)
    throw new ApplicationError('VALIDATION_FAILED', 422, { field: 'expiresInMinutes' });
  const minutes = input.expiresInMinutes ?? INVITE_DEFAULT_MINUTES;
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 120)
    throw new ApplicationError('VALIDATION_FAILED', 422, { field: 'expiresInMinutes' });
  const expiry = input.expiresAt == null ? new Date(now.getTime() + minutes * 60_000) : new Date(input.expiresAt);
  const duration = expiry.getTime() - now.getTime();
  if (!Number.isFinite(duration) || duration < 5 * 60_000 || duration > 120 * 60_000 ||
      expiry.getTime() > semesterEnd.getTime() + 86_400_000 - 1)
    throw new ApplicationError('VALIDATION_FAILED', 422, { field: 'expiresAt' });
  return expiry;
}

/** A registration issued before natural expiry has one fixed, non-renewable deadline. */
export function permitsInviteCompletion(invite: { status: string; expiresAt: Date }, issuedAt: Date, now: Date): boolean {
  if (issuedAt >= invite.expiresAt || now < issuedAt) return false;
  if (invite.status !== 'ACTIVE' && !(invite.status === 'EXPIRED' && now >= invite.expiresAt)) return false;
  return now.getTime() < invite.expiresAt.getTime() + INVITE_GRACE_MS;
}
