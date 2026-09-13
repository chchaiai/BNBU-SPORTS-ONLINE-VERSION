import assert from 'node:assert/strict';
import test from 'node:test';
import {joinWithInvite,clearApiSession} from './js/api.js';

test('a lost registration response retries the same issue key and cannot renew the flow',async()=>{
  const original=globalThis.fetch,keys=[];clearApiSession();
  globalThis.fetch=async(url,input)=>{
    if(String(url).endsWith('/join-capabilities')) {
      keys.push(input.headers['Idempotency-Key']);
      if(keys.length===1)throw new TypeError('Synthetic registration response lost');
      return Response.json({data:{joinCapability:'same-registered-capability'}});
    }
    return Response.json({data:{authSession:{accessToken:'synthetic-access',refreshToken:'synthetic-refresh'},enrollment:{id:'enrollment'}}});
  };
  try {
    const profile={fullName:'Synthetic Issue Retry',studentNumber:'99990002',gender:'MALE',gradeYear:2026};
    await assert.rejects(joinWithInvite('synthetic-issue-invite',profile));
    await joinWithInvite('synthetic-issue-invite',profile);
    assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);
  } finally {clearApiSession();globalThis.fetch=original;}
});

test('an uncertain join retries the registered capability with the original consumption key',async()=>{
  const original=globalThis.fetch,calls=[];let failures=1;
  clearApiSession();
  globalThis.fetch=async(url,input)=>{
    const path=String(url);calls.push({path,headers:input.headers});
    if(path.endsWith('/join-capabilities')) return Response.json({data:{joinCapability:'synthetic-capability',expiresAt:'2027-01-01T00:00:00Z'}});
    if(path.endsWith('/join')) {
      if(failures-- > 0)throw new TypeError('Synthetic response lost after consumption');
      return Response.json({data:{authSession:{accessToken:'synthetic-access',refreshToken:'synthetic-refresh'},enrollment:{id:'synthetic-enrollment'}}});
    }
    return Response.json({data:{}});
  };
  try {
    const profile={fullName:'Synthetic Retry',studentNumber:'99990001',gender:'MALE',gradeYear:2026};
    await assert.rejects(joinWithInvite('synthetic-invite',profile));
    assert.equal((await joinWithInvite('synthetic-invite',profile)).enrollment.id,'synthetic-enrollment');
    assert.equal(calls.filter(c=>c.path.endsWith('/join-capabilities')).length,1);
    const joins=calls.filter(c=>c.path.endsWith('/join'));assert.equal(joins.length,2);
    assert.equal(joins[0].headers['Idempotency-Key'],joins[1].headers['Idempotency-Key']);
    assert.equal(joins[0].headers['X-Join-Capability'],joins[1].headers['X-Join-Capability']);
  } finally {clearApiSession();globalThis.fetch=original;}
});
