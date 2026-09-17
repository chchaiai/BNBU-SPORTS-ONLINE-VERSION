import assert from 'node:assert/strict';
import test from 'node:test';
import { listOwnProofTodos, submitRecordSupplement, uploadMediaDraft, uploadExemptionApplicationMediaDraft } from './js/api.js';

for (const [name, upload] of [['check-in', uploadMediaDraft], ['exemption', uploadExemptionApplicationMediaDraft]]) {
  test(`${name} retries an expired object URL with fresh authorization and the same evidence bytes`, async () => {
    const original = globalThis.fetch, keys = [], uploaded = [];
    const blob = new Blob([new Uint8Array([137,80,78,71,13,10,26,10])], {type:'image/png'});
    const draft = {type:'image'};
    globalThis.fetch = async (url, input) => {
      const path = String(url);
      if (path.endsWith('/media-uploads')) {
        keys.push(input.headers['Idempotency-Key']);
        return Response.json({data:{mediaId:'media',uploadSessionId:'upload',uploadUrl:`https://storage.example.test/${keys.length}`,uploadMethod:'PUT'}});
      }
      if (path.startsWith('https://storage.example.test/')) {
        uploaded.push(input.body);
        return new Response(null,{status:keys.length===1?403:200,headers:{ETag:'"etag"'}});
      }
      if (path.endsWith('/confirm')) return Response.json({data:{version:1}});
      if (path.endsWith('/bind')) return Response.json({data:{}});
      if (path.endsWith('/media/media')) return Response.json({data:{id:'media',uploadStatus:'AVAILABLE'}});
      throw new Error('Unexpected test request');
    };
    try {
      await assert.rejects(upload('owner',draft,blob),error=>error.code==='MEDIA_UPLOAD_FAILED'&&error.status===403);
      assert.equal(draft.pendingUpload,null);
      assert.equal((await upload('owner',draft,blob)).mediaId,'media');
      assert.equal(keys.length,2);assert.notEqual(keys[0],keys[1]);
      assert.deepEqual(uploaded,[blob,blob]);
    } finally { globalThis.fetch = original; }
  });
}

test('proof todos read every backend page through the normal API envelope', async () => {
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return Response.json({ data: calls.length === 1
      ? { items: [{ recordId: 'first' }], nextCursor: 'next-page' }
      : { items: [{ recordId: 'second' }], nextCursor: null }, meta: {} });
  };
  try {
    assert.deepEqual(await listOwnProofTodos(), { items: [{ recordId: 'first' }, { recordId: 'second' }] });
    assert.match(calls[0], /\/api\/v1\/student\/proof-todos\?limit=100$/);
    assert.match(calls[1], /cursor=next-page$/);
  } finally { globalThis.fetch = original; }
});
test('proof todo pagination rejects a repeated cursor instead of looping', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ data: { items: [], nextCursor: 'same' }, meta: {} });
  try { await assert.rejects(listOwnProofTodos(), /API_PAGINATION_CURSOR_REPEATED/); }
  finally { globalThis.fetch = original; }
});
test('a supplement retry preserves its original media, workflow version and idempotency key', async () => {
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, input) => {
    calls.push({ url: String(url), method: input.method, headers: input.headers, body: JSON.parse(input.body) });
    return Response.json({ data: { stage: 'PENDING_TEACHER' }, meta: {} });
  };
  try {
    await submitRecordSupplement('record', ['original', 'new'], 4, 'one-intent');
    await submitRecordSupplement('record', ['original', 'new'], 4, 'one-intent');
    assert.notEqual(calls[0].headers['X-Request-ID'], calls[1].headers['X-Request-ID']);
    const intent = call => ({...call,headers:{...call.headers,'X-Request-ID':undefined}});
    assert.deepEqual(intent(calls[0]), intent(calls[1]));
    assert.match(calls[0].url, /exercise-records\/record\/supplements$/);
    assert.equal(calls[0].headers['Idempotency-Key'], 'one-intent');
    assert.deepEqual(calls[0].body, { mediaIds: ['original', 'new'], expectedVersion: 4 });
  } finally { globalThis.fetch = original; }
});
