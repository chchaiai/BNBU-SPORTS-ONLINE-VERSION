import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const cloud=process.env.BNBU_CASCADE_CLOUD==='1';
const f=JSON.parse(fs.readFileSync(cloud?'.local/course-delete-cloud-private.json':'.local/v81-browser-state/course-delete-private.json'));
const base=cloud?'https://www.student.bnbusports.cn/api/v1':'http://127.0.0.1:3199/api/v1';
const sql=text=>execFileSync('docker',['exec','-i','bnbu-v81-local-validation-sql-postgres-1','psql','-U','v81_probe','-d','v81_browser_test','-At','-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8'}).trim();
async function api(path,token,body,key=randomUUID()){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','idempotency-key':key,...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,value:await r.json()};}


const token=(await api('/auth/password-login',null,{account:f.teacherLogin.email,password:f.teacherLogin.password})).value.data.accessToken;
const id=f.fixture.teacherAClosedSectionId,section=(await api('/class-sections/'+id,token)).value.data;
assert.equal(section.status,'CLOSED');
assert.equal((await api('/class-sections/'+id+'/delete',token,{expectedVersion:section.version,confirmationCourseName:section.displayName,reason:'Synthetic closed course erasure acceptance',confirmCourseErasure:true})).status,201);
assert.equal((await api('/class-sections/'+id,token)).status,404);
console.log(JSON.stringify({check:'CLOSED_COURSE_ERASURE',result:'PASS',environment:cloud?'cloud':'local'}));
