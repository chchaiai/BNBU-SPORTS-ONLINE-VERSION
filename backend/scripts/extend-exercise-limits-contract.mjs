import fs from 'node:fs';
import {parse,parseDocument} from 'yaml';
import {execFileSync} from 'node:child_process';
const file=new URL('../../docs/backend-contracts/openapi.yaml',import.meta.url);
const api=parse(fs.readFileSync(file,'utf8')),schemas=api.components.schemas;
schemas.V81ExerciseGoalInput={type:'object',additionalProperties:false,required:['totalTargetMinutes','expectedVersion'],properties:{
 totalTargetMinutes:{type:'integer',minimum:1,maximum:2147483647},expectedVersion:{type:'integer',minimum:0,maximum:2147483646}}};
schemas.V81ExerciseGoal={type:'object',additionalProperties:false,required:['totalTargetMinutes','version'],properties:{
 totalTargetMinutes:{type:'integer',minimum:1,maximum:2147483647},version:{type:'integer',minimum:0}}};
for(const [method,id] of [['get','getV81ExerciseGoal'],['post','saveV81ExerciseGoal']]) {
 const source=structuredClone(api.paths['/class-sections/{classSectionId}/v81-rules'][method]);
 source.operationId=id;source.summary=method==='get'?'Read organization exercise goal for teacher allocation or superadmin settings':'Set all course targets; pause new check-ins pending teacher allocation';
 source.parameters=source.parameters.filter(p=>p.in!=='path');
 source['x-access-policy'].allowedRoles=method==='get'?['ADMIN','TEACHER']:['ADMIN'];
 source.description=method==='get'?'Read current organization target for teacher allocation or superadmin settings.':'Superadmin only. Versioned and idempotent global target update; new check-ins wait for course allocation.';
 source['x-access-policy'].policyId=id.replace(/([a-z0-9])([A-Z])/g,'$1-$2').toUpperCase();
 if(method==='post')source.requestBody.content['application/json'].schema={$ref:'#/components/schemas/V81ExerciseGoalInput'};
 // Preserve standard error responses and envelope conventions from the existing route.
 for(const [status,response] of Object.entries(source.responses))if(/^2/.test(status)&&response.content?.['application/json']) {
   const envelope={type:'object',required:['data','meta'],properties:{data:{$ref:'#/components/schemas/V81ExerciseGoal'},meta:{type:'object'}}};
   response.content['application/json'].schema=envelope;
 }
 (api.paths['/admin/exercise-goal']??={})[method]=source;
}
schemas.V81CourseRulesInput.properties.maximumMinutes={type:'integer',minimum:1,maximum:1440};
schemas.V81CourseRulesInput.properties.globalTargetVersion={type:'integer',minimum:0};
schemas.ExerciseSession.properties.maximumDurationSeconds={type:['integer','null'],minimum:60,maximum:86400};
const progress=schemas.V81StudentProgress.properties;
progress.maximumMinutes={type:'integer',minimum:1,maximum:1440};
progress.allocationPending={type:'boolean'};
progress.globalTargetVersion={type:'integer',minimum:0};
for(const key of ['totalTargetSeconds','totalEffectiveSeconds','remainingSeconds'])progress[key]={type:'integer',minimum:0};
const todo=api.paths['/student/proof-todos'].get.responses['200'].content['application/json'].schema.properties.data.properties.items.items;
Object.assign(todo.properties,{classSectionId:{type:'string',format:'uuid'},courseName:{type:'string'},startedAt:{type:'string',format:'date-time'},sportType:{type:'string'},sportName:{type:['string','null']},actualDurationSeconds:{type:'integer',minimum:0},source:{const:'TEACHER_REVIEW'}});
for(const schema of Object.values(schemas))for(const [key,property] of Object.entries(schema.properties||{}))
 if(['courseMinutes','generalMinutes'].includes(key)&&property.maximum===1200)property.maximum=2147483647;
function expandAllocations(node){
 if(!node||typeof node!=='object')return;
 for(const [key,value] of Object.entries(node)){
  if(['courseMinutes','generalMinutes','courseTarget','generalTarget'].includes(key)&&value?.maximum===1200)value.maximum=2147483647;
  expandAllocations(value);
 }
}
expandAllocations(api);
const target=api.paths['/class-sections/{id}/progress-target'].get.responses['200'].content['application/json'].schema.properties.data.properties;
for(const key of ['courseTargetSeconds','generalTargetSeconds','totalTargetSeconds'])target[key]={type:'integer',minimum:0};
for(const property of Object.values(schemas.V81ProgressCategory.properties))if(property.maximum===72000)delete property.maximum;
const document=parseDocument(process.argv.includes('--preserve-head-format')
 ?execFileSync('git',['show','HEAD:docs/backend-contracts/openapi.yaml'],{encoding:'utf8'})
 :fs.readFileSync(file,'utf8'));
function patch(before,after,path=[]){
 if(JSON.stringify(before)===JSON.stringify(after))return;
 if(before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after)){
  for(const key of Object.keys(before))if(!(key in after))document.deleteIn([...path,key]);
  for(const key of Object.keys(after))patch(before[key],after[key],[...path,key]);
 }else document.setIn(path,after);
}
patch(document.toJS(),api);
fs.writeFileSync(file,document.toString({lineWidth:100}));
