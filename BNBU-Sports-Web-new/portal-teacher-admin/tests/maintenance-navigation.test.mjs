import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
const source=readFileSync(new URL('../app/portal-app.tsx',import.meta.url),'utf8');
const expression=source.match(/const nav = ([\s\S]*?);/)[1];
for(const mode of ['NORMAL','MAINTENANCE']) {
 test(`administrator sidebar retains all workspace routes in ${mode}`,()=>{
  const adminNav=['overview','courses','semesters','accounts','subadmins','support','rules','system','help','audit'].map(id=>({id}));
  assert.deepEqual(runInNewContext(expression,{role:'admin',adminNav,teacherNav:[],systemModeStatus:{mode}}),adminNav);
 });
}
test('teacher navigation remains role specific',()=>{
 const teacherNav=[{id:'courses'}];
 assert.deepEqual(runInNewContext(expression,{role:'teacher',teacherNav,adminNav:[{id:'system'}],systemModeStatus:{mode:'NORMAL'}}),teacherNav);
});
