import { ApiError, request } from './api-client';
export function createTeacherCourse(displayName:string,key:string){return request('/teacher/courses',{method:'POST',body:{displayName},headers:{'Idempotency-Key':key}});}
export function revokeCourseInvite(classSectionId:string,inviteToken:string,key:string){return request(`/class-sections/${encodeURIComponent(classSectionId)}/course-invites/revocations`,{method:'POST',body:{inviteToken},headers:{'Idempotency-Key':key}});}
export function createCoursePublicationIntent<T>(fingerprint:string,writeWindow:(key:string)=>Promise<T>,writeRules:(key:string)=>Promise<unknown>){
  const windowKey=globalThis.crypto.randomUUID(),rulesKey=globalThis.crypto.randomUUID();
  let windowResult:T|undefined,windowDone=false,running:Promise<T>|null=null;
  return {fingerprint,run():Promise<T>{
    if(running)return running;
    running=(async()=>{if(!windowDone){windowResult=await writeWindow(windowKey);windowDone=true;}await writeRules(rulesKey);return windowResult as T;})()
      .finally(()=>{running=null;});
    return running;
  }};
}
export type CourseTemplate = {id:string;version:number;displayName:string;rules:{totalTargetMinutes:number;minimumMinutesOptions:number[];weeklyLimitOptions:number[];defaultMinimumMinutes:number;defaultWeeklyLimit:number};publishedAt:string};
export type CourseRules = {version:number;template_id:string|null;published_at:string|null;minimum_minutes:number;weekly_limit:number;course_target:number;general_target:number};
export function publishCourseRules(id:string,input:{templateId:string;minimumMinutes:number;weeklyLimit:number;courseTarget:number;generalTarget:number;
  regularDeadline:string;closingDeadline:string;settlementPlannedAt:string;expectedVersion:number},key:string){
  return request(`/class-sections/${encodeURIComponent(id)}/v81-rules`,{method:'POST',body:{...input,publish:true},headers:{'Idempotency-Key':key}});
}
export async function loadCourseRuleSettings(id:string) {
  const templates:CourseTemplate[]=[];
  let before:number|null=null;
  const seen=new Set<number>();
  do {
    const page:{items:CourseTemplate[];nextBeforeVersion:number|null}=await request('/rule-templates?limit=100'+(before?`&beforeVersion=${before}`:''));
    templates.push(...page.items);before=page.nextBeforeVersion;
    if(before!==null&&seen.has(before))throw new Error('TEMPLATE_PAGINATION_REPEATED');
    if(before!==null)seen.add(before);
  }while(before!==null);
  let rules:CourseRules|null;
  try{rules=await request(`/class-sections/${encodeURIComponent(id)}/v81-rules`);}
  catch(error){if(error instanceof ApiError&&error.status===404)rules=null;else throw error;}
  return {templates,rules};
}
