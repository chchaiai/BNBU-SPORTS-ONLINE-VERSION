import fs from 'node:fs';
import {parse,stringify} from 'yaml';
export function addTeacherSemestersContract(api){
 const operation=structuredClone(api.paths['/admin/semesters'].get);
 operation.operationId='listV81TeacherSemesters';operation.summary='List semesters belonging to the responsible teacher';
 operation.description='Only semesters containing a section owned by the authenticated teacher in the same organization. Includes current, upcoming and archived semesters. No counts, other teachers, student facts or administrative fields.';
 operation['x-access-policy']={...operation['x-access-policy'],policyId:'LIST-V81-TEACHER-SEMESTERS',allowedRoles:['TEACHER']};
 const properties={id:{type:'string',format:'uuid'},academicYear:{type:'string'},termCode:{type:'string'},displayName:{type:'string'},status:{type:'string',enum:['UPCOMING','CURRENT','ARCHIVED']},startDate:{type:'string',format:'date'},endDate:{type:'string',format:'date'},version:{type:'integer',minimum:1}};
 const item={type:'object',additionalProperties:false,required:Object.keys(properties),properties};
 operation.responses['200'].content['application/json'].schema.properties.data={type:'object',additionalProperties:false,required:['items','nextCursor'],properties:{items:{type:'array',items:item},nextCursor:{type:['string','null'],format:'uuid'}}};
 api.paths['/teacher/semesters']={get:operation};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/teacher-semesters-contract.mjs')){
 const file=new URL('../../docs/backend-contracts/openapi.yaml',import.meta.url),api=parse(fs.readFileSync(file,'utf8'));addTeacherSemestersContract(api);fs.writeFileSync(file,stringify(api));
}
