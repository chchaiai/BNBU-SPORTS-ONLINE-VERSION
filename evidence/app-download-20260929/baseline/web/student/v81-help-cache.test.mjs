import test from 'node:test';
import assert from 'node:assert/strict';
import {localStore} from './js/store.js';

test('Help cache separates users and languages and ignores unscoped legacy data',()=>{
  const entries=new Map();
  globalThis.localStorage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)};
  try {
    entries.set('bnbu.student.web.helpArticles.zh-CN',JSON.stringify([{id:'legacy-other-organization'}]));
    assert.deepEqual(localStore.getHelpArticles('zh-CN','user-b'),[]);
    localStore.setHelpArticles('zh-CN',[{id:'a-chinese'}],'user-a');
    localStore.setHelpArticles('en',[{id:'a-english'}],'user-a');
    assert.deepEqual(localStore.getHelpArticles('zh-CN','user-b'),[]);
    localStore.setHelpArticles('zh-CN',[{id:'b-chinese'}],'user-b');
    assert.deepEqual(localStore.getHelpArticles('zh-CN','user-a'),[{id:'a-chinese'}]);
    assert.deepEqual(localStore.getHelpArticles('en-US','user-a'),[{id:'a-english'}]);
    assert.deepEqual(localStore.getHelpArticles('zh','user-b'),[{id:'b-chinese'}]);
    assert.deepEqual(localStore.getHelpArticles('zh-CN',null),[]);
    localStore.setHelpArticles('zh-CN',[{id:'anonymous'}],null);
    assert.deepEqual(localStore.getHelpArticles('zh-CN','user-a'),[{id:'a-chinese'}]);
    entries.set('bnbu.student.web.helpArticles.user-b.zh-CN','corrupted');
    assert.deepEqual(localStore.getHelpArticles('zh-CN','user-b'),[]);
    assert.deepEqual(localStore.getHelpArticles('zh-CN','user-a'),[{id:'a-chinese'}]);
  } finally {delete globalThis.localStorage;}
});
