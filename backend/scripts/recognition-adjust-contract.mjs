import fs from 'node:fs';import {parse,stringify} from 'yaml';
export function addRecognitionAdjustmentContract(api){
 const revoke=api.paths['/activity-certification-applications/{id}/revoke'].post;
 revoke.description='Responsible teacher revokes an approved certification with version and reason. Requires NORMAL mode. A settled or archived course requires its original approval to predate initial settlement; revocation and a new correction report commit atomically while preserving old reports. Archived courses without settlement are rejected.';
 revoke.responses['404']={$ref:'#/components/responses/NotFound'};
 revoke.responses['500']={$ref:'#/components/responses/InternalError'};
 const operation=structuredClone(api.paths['/activity-certification-applications/{id}/revoke'].post);
 operation.operationId='adjustV81Recognition';operation.summary='Adjust recognized minutes on an approved certification';
 operation.description='Responsible teacher adjusts a previously approved certification in the same organization. Requires NORMAL mode, original application version and a reason. For settled or archived courses, the original approval must predate the initial settlement; the same transaction appends a correction report preserving all previous reports. An archived course without a settlement report is rejected. Closed courses retain this existing business. Limits include other active recognitions. Appends review and allocation history, audit and student notification; atomically recomputes progress. Original approval and accepted materials are preserved.';
 operation['x-access-policy'].policyId='ADJUST-V81-RECOGNITION';
 operation.responses['404']={$ref:'#/components/responses/NotFound'};
 operation.requestBody.content['application/json'].schema={type:'object',additionalProperties:false,required:['expectedVersion','reason','courseMinutes','generalMinutes'],properties:{
  expectedVersion:{type:'integer',minimum:1,maximum:2147483646},reason:{type:'string',minLength:1,maxLength:1000,pattern:'\\S'},
  courseMinutes:{type:'integer',minimum:0,maximum:1200},generalMinutes:{type:'integer',minimum:0,maximum:1200}}};
 api.paths['/activity-certification-applications/{id}/recognition-allocation-revisions'].post=operation;
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/recognition-adjust-contract.mjs')){
 const file=new URL('../../docs/backend-contracts/openapi.yaml',import.meta.url),source=fs.readFileSync(file,'utf8'),api=parse(source),path='/activity-certification-applications/{id}/recognition-allocation-revisions';
 const hadPost=Boolean(api.paths[path].post);
 addRecognitionAdjustmentContract(api);
 const position=source.indexOf('  /activity-certification-applications/{id}/revoke:');
 if(position<0)throw new Error('Insertion anchor missing');
 const fragment=stringify({post:api.paths[path].post}).trimEnd().split('\n').map(line=>'    '+line).join('\n')+'\n';
 const start=hadPost?source.indexOf('\n    post:',source.indexOf('  '+path+':'))+1:position;
 if(start<1||start>position)throw new Error('Existing operation anchor missing');
 const tail=source.slice(position),next=tail.indexOf('\n  /',1);
 if(next<0)throw new Error('Revoke end anchor missing');
 const revokeFragment=stringify({'/activity-certification-applications/{id}/revoke':api.paths['/activity-certification-applications/{id}/revoke']}).trimEnd().split('\n').map(line=>'  '+line).join('\n');
 fs.writeFileSync(file,source.slice(0,start)+fragment+revokeFragment+tail.slice(next));
}
