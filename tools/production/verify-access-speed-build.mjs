import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
const root=process.cwd(),work=path.join(root,'.local/access-speed-20260928');
const require=createRequire(path.join(root,'BNBU-Sports-Web-new/portal-teacher-admin/package.json'));
const {init,parse}=require('es-module-lexer');await init;
async function student(dir) {
  const seen=new Set(),sources=[];
  async function visit(name){if(seen.has(name))return;seen.add(name);const b=await readFile(path.join(dir,name));sources.push(b);
    for(const imp of parse(b.toString())[0])if(imp.d===-1&&imp.n?.startsWith('.'))await visit(path.posix.join(path.posix.dirname(name),imp.n.split('?')[0]));}
  await visit('js/app.js');await visit('js/emblem.js');
  return {modules:seen.size,bytes:sources.reduce((s,b)=>s+b.length,0),gzipBytes:sources.reduce((s,b)=>s+gzipSync(b,{level:5}).length,0),paths:[...seen]};
}
async function portal(dir,extra=[]){
  const manifest=JSON.parse(await readFile(path.join(dir,'.vite/manifest.json'))),seen=new Set();
  function visit(key){if(seen.has(key))return;assert.ok(manifest[key],key);seen.add(key);for(const imp of manifest[key].imports||[])visit(imp);}
  visit('virtual:vinext-app-browser-entry');visit('virtual:vite-rsc/client-references/group/facade:virtual:cloudflare/worker-entry');
  for(const key of extra)visit(key);
  const files=[...seen].map(key=>manifest[key].file),buffers=await Promise.all(files.map(file=>readFile(path.join(dir,file))));
  return {modules:seen.size,bytes:buffers.reduce((s,b)=>s+b.length,0),gzipBytes:buffers.reduce((s,b)=>s+gzipSync(b,{level:5}).length,0),files};
}
const sManifest=JSON.parse(await readFile(path.join(work,'student-built/asset-manifest.json')));
const beforeStudent=await student(path.join(work,'baseline/student'));
const afterStudent=await student(path.join(work,'student-built/_assets',sManifest.version));
assert.ok(!afterStudent.paths.some(p=>/screens\/(support|services)\.js/.test(p)));
assert.ok(afterStudent.bytes<beforeStudent.bytes);
const portalDir=path.join(root,'BNBU-Sports-Web-new/portal-teacher-admin/dist/client');
const beforePortal=await portal(path.join(work,'portal-baseline/dist/client'));
const afterPortal=await portal(portalDir);
assert.ok(afterPortal.bytes<beforePortal.bytes*0.8);
assert.ok(!afterPortal.files.some(p=>/(teacher|admin)-workspace/.test(p)));
const teacher=await portal(portalDir,['app/teacher-workspace.tsx']);
const admin=await portal(portalDir,['app/admin-workspace.tsx','app/admin-overview.tsx']);
assert.ok(!teacher.files.some(p=>p.includes('admin-workspace')));
assert.ok(!admin.files.some(p=>p.includes('teacher-workspace')));
const failures=text=>[...new Set([...text.matchAll(/^✖ (.+?) \([\d.]+ms\)$/gm)].map(m=>m[1]))].sort();
const oldFailures=failures(await readFile(path.join(root,'.local/course-roster-20260928/portal-tests.log'),'utf8'));
const newFailures=failures(await readFile(path.join(work,'portal-tests.log'),'utf8'));
assert.deepEqual(newFailures,oldFailures);
const smokeFailures=text=>text.split('\n').filter(line=>line.startsWith('FAIL -')).sort();
assert.deepEqual(smokeFailures(await readFile(path.join(work,'student-baseline-smoke.log'),'utf8')),smokeFailures(await readFile(path.join(work,'student-livecandidate-smoke.log'),'utf8')));
assert.match(await readFile(path.join(work,'student-candidate-tests.log'),'utf8'),/ℹ pass 111/);
const report={result:'PASS',student:{before:beforeStudent,after:afterStudent},portal:{before:beforePortal,login:afterPortal,teacher,admin},existingPortalFailures:newFailures,newPortalFailures:[],newStudentSmokeFailures:[]};
await writeFile(path.join(root,'evidence/access-speed-20260928/build-verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,student:{before:{...beforeStudent,paths:undefined},after:{...afterStudent,paths:undefined}}}));
