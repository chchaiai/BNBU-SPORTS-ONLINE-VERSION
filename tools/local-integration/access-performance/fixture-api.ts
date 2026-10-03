export * from '../../../BNBU-Sports-Web-new/portal-teacher-admin/app/api-client';
import { ApiError } from '../../../BNBU-Sports-Web-new/portal-teacher-admin/app/api-client';
const semester={id:'semester-test',displayName:'2026-2027 第一学期',academicYear:'2026-2027',termCode:'FIRST',status:'CURRENT',startsOn:'2026-09-01',endsOn:'2027-01-31',version:1};
const section={id:'section-test',courseId:'course-test',semesterId:semester.id,classCode:'TEST-01',displayName:'性能验证课程',status:'ACTIVE',version:1,checkInStartDate:'2026-09-01',checkInEndDate:'2027-01-31'};
const records=Array.from({length:25},(_,i)=>({id:`record-${i}`,studentId:`student-${i%9}`,enrollmentId:`enrollment-${i%9}`,classSectionId:section.id,courseId:section.courseId,
  businessDate:'2026-09-30',sportType:'RUNNING',description:'本地合成运动记录',actualDurationSeconds:3600,creditedDurationSeconds:1800,
  status:'REVIEWED',workflowStage:'VALID',currentReview:{result:'VALID',publicComment:'合成审核通过',reasonCode:null},submittedAt:'2026-09-30T02:00:00Z',version:1}));
export async function request<T>(route:string,options?:{method?:string}):Promise<T>{
  if(options?.method && options.method!=='GET')throw new Error('Fixture blocks business writes');
  document.dispatchEvent(new CustomEvent('fixture-request',{detail:route}));
  await new Promise(resolve=>setTimeout(resolve,40));
  let value:unknown;
  if(route==='/semesters/current')value=semester;
  else if(route.startsWith('/teacher/semesters'))value={items:[semester],nextCursor:null};
  else if(route.includes('/progress-target'))value={courseTargetSeconds:7200,generalTargetSeconds:7200,version:1};
  else if(route.startsWith('/class-sections?'))value=[section];
  else if(route.startsWith('/courses?'))value=[{id:section.courseId,courseName:section.displayName,courseCode:'TEST'}];
  else if(route.startsWith('/enrollments?'))value=Array.from({length:9},(_,i)=>({id:`enrollment-${i}`,studentId:`student-${i}`,classSectionId:section.id,status:'ACTIVE',joinedAt:'2026-09-01T02:00:00Z',source:'INVITE',version:1}));
  else if(route.startsWith('/students/')){const id=route.split('/')[2];value={id,fullName:`合成学生 ${id.split('-')[1]}`,studentNumber:`TEST-${id}`,gender:'MALE',gradeYear:2026};}
  else if(route.startsWith('/exercise-records?'))value=records;
  else if(route.includes('/evidence-context')){
    if(document.querySelector<HTMLInputElement>('#fail-evidence')?.checked)throw new ApiError(503,{code:'SERVICE_UNAVAILABLE',requestId:'local-evidence-failure'});
    value={recordId:route.split('/')[2],startedAt:'2026-09-30T01:00:00Z',endedAt:'2026-09-30T02:00:00Z',mediaIds:[]};
  }else if(route.includes('/reviews?'))value=[{reviewVersion:2}];
  else if(route.startsWith('/exercise-records/'))value=records.find(record=>record.id===route.split('/')[2]);
  else if(route.startsWith('/teacher-progress'))value=Array.from({length:9},(_,i)=>({enrollmentId:`enrollment-${i}`,courseRelated:{effectiveSeconds:1800},general:{effectiveSeconds:0},totalEffectiveSeconds:1800,status:'IN_PROGRESS'}));
  else if(route.includes('/physical-results')||route.includes('/final-grades'))value={items:[],nextCursor:null};
  else if(route.startsWith('/exemption-'))value=[];
  else throw new Error('Unhandled fixture route: '+route);
  return value as T;
}
export async function requestWithMeta<T>(route:string){return {data:await request<T>(route),meta:{pagination:{hasMore:false,nextCursor:null}}};}
