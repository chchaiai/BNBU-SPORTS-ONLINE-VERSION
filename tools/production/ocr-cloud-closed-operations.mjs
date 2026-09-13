// Bounded probes of the 34 operations explicitly disabled in the runtime registry.
// 400/404/422 do not prove the disabled-operation gate and are recorded as unproven.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import yaml from '../../backend/node_modules/yaml/dist/index.js';
const staff=JSON.parse(fs.readFileSync('.local/ocr-triplatform-20260913-private.json')),beta=JSON.parse(fs.readFileSync('.local/ocr-beta-private.json'));
const registry=JSON.parse(fs.readFileSync('backend/runtime-coverage.manifest.json')),doc=yaml.parse(fs.readFileSync('docs/backend-contracts/openapi.yaml','utf8')),checks=[];
const tokens={ADMIN:staff.adminToken,TEACHER:staff.teacherToken,STUDENT:beta.session.accessToken};
const ids={studentId:beta.studentId,courseId:staff.fixture.activeCourseId,classSectionId:staff.fixture.teacherAActiveSectionId};
try{
 for(const [template,item]of Object.entries(doc.paths))for(const [method,op]of Object.entries(item))if(registry.implementedDefaultDeny.includes(op.operationId)){
  const roles=op['x-access-policy'].allowedRoles,role=['ADMIN','TEACHER','STUDENT'].find(r=>roles.includes(r));assert.ok(role);
  const path=template.replace(/\{([^}]+)\}/g,(_,key)=>ids[key]??randomUUID());
  const r=await fetch('https://www.teacher.bnbusports.cn/api/v1'+path,{method:method.toUpperCase(),headers:{authorization:`Bearer ${tokens[role]}`,'content-type':'application/json','idempotency-key':randomUUID()},...(method==='get'?{}:{body:'{}'}),signal:AbortSignal.timeout(15000)});
  const value=await r.json();checks.push({operationId:op.operationId,method:method.toUpperCase(),path:template,role,status:r.status,code:value.code,requestId:value.requestId,disabledGateObserved:[403,503].includes(r.status)});
  assert.ok(!r.ok,'Disabled operation unexpectedly succeeded: '+op.operationId);if(r.status===401)throw new Error('Session expired; stop rather than miscount auth rejection');
 }
}finally{const result={check:'CLOUD_EXPLICITLY_DISABLED_OPERATIONS',observedAt:new Date().toISOString(),organizationId:beta.organizationId,total:checks.length,disabledGateObserved:checks.filter(c=>c.disabledGateObserved).length,checks};fs.writeFileSync('evidence/ocr-triplatform-20260913/cloud-closed-operations.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({total:result.total,disabledGateObserved:result.disabledGateObserved,unproven:checks.filter(c=>!c.disabledGateObserved)}));}
