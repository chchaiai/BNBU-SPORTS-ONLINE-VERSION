import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { permitsInviteCompletion, resolveInviteExpiry } from '../../src/modules/course-invites/domain/invite-timing.js';

const now = new Date('2026-09-13T00:00:00Z'), end = new Date('2027-01-31T00:00:00Z');
describe('V8.1 invitation timing', () => {
  it('uses server-relative 30 minute default and accepts exact 5 and 120 minute choices', () => {
    assert.equal(resolveInviteExpiry({}, now, end).getTime() - now.getTime(), 1_800_000);
    for (const minutes of [5, 30, 120]) assert.equal(resolveInviteExpiry({expiresInMinutes:minutes}, now, end).getTime() - now.getTime(), minutes * 60_000);
  });
  it('rejects out-of-range, ambiguous, malformed and semester-crossing expiry', () => {
    for (const minutes of [4, 121, 5.5, NaN]) assert.throws(() => resolveInviteExpiry({expiresInMinutes:minutes}, now, end));
    assert.throws(() => resolveInviteExpiry({expiresAt:'invalid'}, now, end));
    assert.throws(() => resolveInviteExpiry({expiresAt:new Date(now.getTime()+1_800_000).toISOString(),expiresInMinutes:30}, now, end));
    for(const minutes of [4, 121]) assert.throws(() => resolveInviteExpiry({expiresAt:new Date(now.getTime()+minutes*60_000).toISOString()}, now, end));
    assert.throws(() => resolveInviteExpiry({expiresInMinutes:30}, new Date('2026-09-13T23:50:00Z'), now));
  });
  it('allows only pre-expiry registration until a fixed ten-minute deadline and rejects revocation', () => {
    const invite={status:'ACTIVE',expiresAt:new Date(now.getTime()+300_000)};
    assert.equal(permitsInviteCompletion(invite,now,new Date(invite.expiresAt.getTime()+599_999)),true);
    assert.equal(permitsInviteCompletion(invite,now,new Date(invite.expiresAt.getTime()+600_000)),false);
    assert.equal(permitsInviteCompletion(invite,invite.expiresAt,invite.expiresAt),false);
    assert.equal(permitsInviteCompletion({...invite,status:'REVOKED'},now,invite.expiresAt),false);
    assert.equal(permitsInviteCompletion({...invite,status:'EXPIRED'},now,invite.expiresAt),true);
    assert.equal(permitsInviteCompletion({...invite,status:'EXPIRED'},now,now),false);
  });
});
