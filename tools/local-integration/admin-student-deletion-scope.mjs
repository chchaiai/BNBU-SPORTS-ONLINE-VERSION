import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {SignJWT,decodeJwt,importPKCS8} from '../../backend/node_modules/jose/dist/webapi/index.js';
const state=JSON.parse(fs.readFileSync('.local/v81-browser-state/state.json'));
const student=JSON.parse(fs.readFileSync('.local/mobile-original-student-private.json')).membership.studentProfile;
const ids={user:randomUUID(),profile:randomUUID(),session:randomUUID(),family:randomUUID()};
const sql=text=>execFileSync('docker',['exec','-i','bnbu-v81-local-validation-sql-postgres-1','psql','-U','v81_probe','-d','v81_browser_test','-At','-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8'}).trim();
const org=state.fixture.organizationId;
const api=async(path,token,body)=>{const response=await fetch('http://127.0.0.1:3199/api/v1'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','idempotency-key':randomUUID(),...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,value:await response.json()};};
const login=(await api('/auth/password-login',null,{account:state.accounts.admin.email,password:state.accounts.admin.password})).value.data;
sql(`BEGIN;
 INSERT INTO users(id,organization_id,role,status,created_at,updated_at) VALUES('${ids.user}','${org}','ADMIN','ACTIVE',now(),now());
 INSERT INTO admin_profiles(id,organization_id,user_id,employee_number,full_name,department_name,status,created_at,updated_at)
 VALUES('${ids.profile}','${org}','${ids.user}','ERASURE-${ids.user.slice(0,8)}','Synthetic erasure scope','Synthetic','ACTIVE',now(),now());
 INSERT INTO v81_admin_access(user_id,organization_id,kind,permissions,must_change_password) VALUES('${ids.user}','${org}','SUB','["AUDIT_QUERY"]',false);
 INSERT INTO v81_account_security(user_id,organization_id,login_account,must_change_password,password_changed_at) VALUES('${ids.user}','${org}','erasure-${ids.user}',false,now());
 INSERT INTO auth_sessions(id,organization_id,user_id,status,token_family_id,created_at,last_seen_at,absolute_expires_at,idle_expires_at)
 VALUES('${ids.session}','${org}','${ids.user}','ACTIVE','${ids.family}',now(),now(),now()+interval '1 hour',now()+interval '1 hour'); COMMIT;`);
try {
 const claims=decodeJwt(login.accessToken),key=await importPKCS8(state.secrets.TOKEN_SIGNING_KEY,'EdDSA');
 const token=await new SignJWT({...claims,sub:ids.user,sessionId:ids.session,tokenVersion:0,jti:randomUUID()}).setProtectedHeader({alg:'EdDSA',typ:'JWT'}).sign(key);
 const path='/admin/students/'+student.id+'/delete',body={expectedVersion:student.version,confirmationStudentNumber:'WRONG',reason:'Synthetic scope test'};
 assert.equal((await api(path,token,body)).status,403);
 sql(`UPDATE v81_admin_access SET permissions='["USER_ACCOUNTS"]',version=version+1 WHERE user_id='${ids.user}';`);
 const current=(await api('/students/'+student.id,login.accessToken)).value.data;
 body.expectedVersion=current.version;
 const granted=await api(path,token,body);assert.equal(granted.status,422,JSON.stringify(granted.value));
 const foreign=JSON.parse(sql(`SELECT row_to_json(s) FROM (SELECT id,version,student_number FROM student_profiles WHERE organization_id<>'${org}' LIMIT 1) s;`));
 assert.equal((await api('/admin/students/'+foreign.id+'/delete',token,{...body,expectedVersion:foreign.version,confirmationStudentNumber:foreign.student_number})).status,404);
 sql(`UPDATE v81_admin_access SET permissions='["AUDIT_QUERY"]',version=version+1 WHERE user_id='${ids.user}';`);
 assert.equal((await api(path,token,body)).status,403);
 console.log(JSON.stringify({check:'STUDENT_ERASURE_ADMIN_SCOPE',result:'PASS',missingPermissionDenied:true,grantEffective:true,crossOrganizationDenied:true,revocationEffectiveOnExistingToken:true}));
} finally {sql(`UPDATE users SET status='DISABLED',token_version=token_version+1,version=version+1,updated_at=now() WHERE id='${ids.user}';`);}
