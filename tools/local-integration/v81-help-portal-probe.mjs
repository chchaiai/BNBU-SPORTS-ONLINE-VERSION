import assert from 'node:assert/strict';
export async function probeHelpPortal({request,baseUrl,adminToken}) {
  const body={titleZh:'分页帮助',titleEn:'Paged help',bodyZh:'中文正文',bodyEn:'English body',keywords:['test'],category:'login',status:'published',sortWeight:0,expectedVersion:0};
  const created=[];
  for(let index=0;index<6;index++)created.push(await request('/admin/help-articles',adminToken,{...body,titleZh:body.titleZh+index,titleEn:body.titleEn+index}));
  const nativeFetch=globalThis.fetch,paths=[];
  globalThis.fetch=(url,options)=>{
    paths.push(String(url));const headers=new Headers(options?.headers);headers.set('authorization',`Bearer ${adminToken}`);
    return nativeFetch(new URL(url,baseUrl),{...options,headers});
  };
  try {
    const {listPublishedAdminHelp}=await import('../../BNBU-Sports-Web-new/portal-teacher-admin/app/help-api.ts');
    for(const locale of ['zh-CN','en']) {
      const items=await listPublishedAdminHelp(locale);
      for(const article of created)assert.deepEqual(items.find(item=>item.id===article.id),{
        id:article.id,category:article.category,title:locale==='en'?article.titleEn:article.titleZh,
        bodyMarkdown:locale==='en'?article.bodyEn:article.bodyZh,updatedAt:article.updatedAt});
    }
    assert.ok(paths.some(path=>path.includes('page=2')));
    assert.ok(paths.every(path=>path.startsWith('/api/v1/admin/help-articles?status=published&page=')));
    console.log(JSON.stringify({check:'PORTAL_ADMIN_HELP_REAL_API_BILINGUAL_ALL_PAGES',result:'PASS'}));
    const {createHelpSaveIntent,getAdminHelp,listAdminHelp}=await import('../../BNBU-Sports-Web-new/portal-teacher-admin/app/help-api.ts');
    let lose=true;const writes=[];
    globalThis.fetch=async(url,options)=>{
      const headers=new Headers(options?.headers);headers.set('authorization',`Bearer ${adminToken}`);
      const response=await nativeFetch(new URL(url,baseUrl),{...options,headers});
      if(options?.method==='POST') {
        writes.push({key:headers.get('Idempotency-Key'),body:options.body});
        if(lose&&response.ok){lose=false;await response.arrayBuffer();throw new TypeError('Synthetic lost help save response');}
      }
      return response;
    };
    const input={...body,keywords:['original'],status:'draft'};
    const intent=createHelpSaveIntent(null,input);
    input.titleZh='Changed after confirmation';input.keywords.push('changed');
    await assert.rejects(intent.run());
    const first=intent.run(),second=intent.run();assert.equal(first,second);
    let article=await first;
    assert.equal(article.version,1);assert.equal(article.titleZh,body.titleZh);assert.deepEqual(article.keywords,['original']);
    assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);
    assert.deepEqual(await getAdminHelp(article.id),article);
    assert.deepEqual((await listAdminHelp()).find(item=>item.id===article.id),article);
    for(const status of ['published','archived','published']) {
      const previous=article;
      article=await createHelpSaveIntent(article.id,{...body,status,expectedVersion:article.version}).run();
      assert.equal(article.version,previous.version+1);assert.equal(article.status,status);
      assert.deepEqual(await getAdminHelp(article.id),article);
      assert.deepEqual((await listAdminHelp()).find(item=>item.id===article.id),article);
      const publicItems=await listPublishedAdminHelp('en');
      assert.equal(publicItems.some(item=>item.id===article.id),status==='published');
    }
    await assert.rejects(createHelpSaveIntent(article.id,{...body,expectedVersion:1}).run());
    assert.deepEqual(await getAdminHelp(article.id),article);
    console.log(JSON.stringify({check:'PORTAL_HELP_SAVE_FROZEN_INPUT_LOST_RESPONSE_SAME_KEY_LIFECYCLE_STALE_VERSION',result:'PASS'}));
  } finally {globalThis.fetch=nativeFetch;}
}
