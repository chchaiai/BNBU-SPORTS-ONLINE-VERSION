import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const privateFixture=JSON.parse(fs.readFileSync('.local/exercise-limits-20260912-private.json'));
assert.match(privateFixture.teacher.email,/synthetic/i);
const base='https://www.teacher.bnbusports.cn/api/v1';let token,sectionId;
const checks=[];
async function req(path,method='GET',body,expected=200,key=randomUUID()){
 const response=await fetch(base+path,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json','idempotency-key':key}:{})},body:body?JSON.stringify(body):undefined});
 const result=await response.json();assert.equal(response.status,expected,JSON.stringify({path,status:response.status,code:result.code,requestId:result.requestId}));return result.data;
}
try{
 const auth=await req('/auth/password-login','POST',{account:privateFixture.teacher.email,password:privateFixture.teacher.password});token=auth.accessToken;
 const templates=await req('/rule-templates?limit=100');const template=templates.items.find(x=>x.publishedAt);assert.ok(template);
 const goal=await req('/admin/exercise-goal');
 const course=process.env.COURSE_SETTINGS_PROBE_ID ? await req('/class-sections/'+process.env.COURSE_SETTINGS_PROBE_ID) : await req('/teacher/courses','POST',{displayName:'Synthetic Course Settings 20260915 '+randomUUID().slice(0,8)},201);sectionId=course.id;assert.match(course.displayName,/^Synthetic Course Settings 20260915 /);
 const section=await req('/class-sections/'+sectionId);const semester=await req('/semesters/current');assert.equal(semester.id,section.semesterId);
 const end=String(semester.endDate??semester.endsOn).slice(0,10),start=String(semester.startDate??semester.startsOn).slice(0,10);assert.match(end,/^\d{4}-\d{2}-\d{2}$/);
 const closing=new Date(end+'T15:59:59Z'),regular=new Date(closing.getTime()-7*86400000);
 const initial=await req('/class-sections/'+sectionId,'PATCH',{expectedVersion:section.version,checkInWindowMode:'AVAILABLE',checkInStartDate:start,checkInEndDate:regular.toISOString().slice(0,10),dailyStartTime:'00:00',dailyEndTime:'23:59',submissionDeadlineAt:regular.toISOString()});
 const rules={templateId:template.id,minimumMinutes:1,maximumMinutes:120,weeklyLimit:7,dailyLimit:2,courseTarget:0,generalTarget:goal.totalTargetMinutes,globalTargetVersion:goal.version,regularDeadline:regular.toISOString(),closingDeadline:closing.toISOString(),settlementPlannedAt:closing.toISOString(),publish:true,expectedVersion:0};
 await req('/class-sections/'+sectionId+'/v81-rules','POST',rules,201);
 const before=await req('/class-sections/'+sectionId),key=randomUUID();const input={expectedVersion:before.version,dailyStartTime:'07:15',dailyEndTime:'21:45',checkInWindowMode:'UNAVAILABLE'};
 const saved=await req('/class-sections/'+sectionId,'PATCH',input,200,key);assert.deepEqual(await req('/class-sections/'+sectionId,'PATCH',input,200,key),saved);await req('/class-sections/'+sectionId,'PATCH',input,409);
 const paused=await req('/class-sections/'+sectionId);assert.equal(paused.dailyStartTime,'07:15:00');assert.equal(paused.dailyEndTime,'21:45:00');assert.equal(paused.checkInWindowMode,'UNAVAILABLE');checks.push('published daily times and pause readback');
 await req('/class-sections/'+sectionId+'/v81-rules','POST',{...rules,expectedVersion:1},201);checks.push('rule save while paused');
 await req('/class-sections/'+sectionId,'PATCH',{expectedVersion:paused.version,checkInStartDate:start},409);checks.push('published dates locked');
 await req('/class-sections/'+sectionId,'PATCH',{expectedVersion:paused.version,checkInWindowMode:'AVAILABLE'});assert.equal((await req('/class-sections/'+sectionId)).checkInWindowMode,'AVAILABLE');checks.push('resume readback');
 fs.writeFileSync('.local/course-settings-cloud-probe.json',JSON.stringify({sectionId,courseName:course.displayName,teacherEmail:privateFixture.teacher.email}));
 const result={result:'PASS',sectionId,checks,scope:'New synthetic course with zero students; real user course not modified'};
 fs.writeFileSync('evidence/course-settings-20260915/cloud-http.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){console.log(JSON.stringify({result:'FAIL',sectionId,error:String(error)}));process.exitCode=1;}
