import assert from 'node:assert/strict';
export async function switchThroughPortal({baseUrl,adminToken,targetId,key}) {
  const nativeFetch=globalThis.fetch,requests=[];let lose=true;
  globalThis.fetch=async(url,options)=>{
    const headers=new Headers(options?.headers);headers.set('authorization',`Bearer ${adminToken}`);
    const response=await nativeFetch(new URL(url,baseUrl),{...options,headers});
    if(String(url).includes('/switch')&&options?.method==='POST') {
      requests.push({key:headers.get('Idempotency-Key'),body:options.body});
      if(lose&&response.ok){lose=false;await response.arrayBuffer();throw new TypeError('Synthetic lost semester switch response');}
    }
    return response;
  };
  try {
    const api=await import('../../BNBU-Sports-Web-new/portal-teacher-admin/app/semester-api.ts');
    assert.ok((await api.listSemesters()).some(item=>item.id===targetId));
    const preview=await api.getSemesterSwitchCheck(targetId);
    assert.equal(preview.ready,true);
    const intent=api.createSemesterSwitchIntent(preview,key);
    const original=JSON.stringify(intent.body);
    preview.target.version+=10; // Later state must not mutate the confirmed request.
    await assert.rejects(intent.run());
    const first=intent.run(),second=intent.run();assert.equal(first,second);
    const result=await first;
    assert.equal(result.current.id,targetId);
    assert.equal(requests.length,2);assert.ok(requests.every(item=>item.key===key&&item.body===original));
    assert.equal((await api.listSemesters()).find(item=>item.id===targetId).status,'CURRENT');
    console.log(JSON.stringify({check:'PORTAL_SEMESTER_API_LIST_PREFLIGHT_LOST_RESPONSE_FROZEN_VERSION_SAME_KEY_REPLAY',result:'PASS'}));
    return result;
  } finally {globalThis.fetch=nativeFetch;}
}
