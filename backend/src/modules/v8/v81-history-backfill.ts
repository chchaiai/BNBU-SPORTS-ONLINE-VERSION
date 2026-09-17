import { assertProfileReady } from '../users/application/student-profile-quality.js';
import { Body, Controller, Get, Headers, Injectable, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { IsBoolean, IsInt, IsISO8601, Matches, Max, Min } from 'class-validator';
import { PrismaService } from '../../common/database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import type { AuthenticatedPrincipal, FoundationRequest } from '../../common/http/request-context.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import { OrganizationTimeService } from '../../common/time/organization-time.service.js';
import { requireUnsettledCourse } from './v81-settlement-write-guard.js';

export class HistorySettingsInput {
  @IsBoolean() enabled!: boolean;
  @IsISO8601({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/u) earliestDate!: string;
  @IsISO8601({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/u) latestDate!: string;
  @IsInt() @Min(0) @Max(2147483646) expectedVersion!: number;
}
export class HistorySessionInput {
  @IsISO8601({ strict: true }) @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/u) startedAt!: string;
  @IsInt() @Min(60) @Max(86400) durationSeconds!: number;
}
type Settings = { enabled: boolean; earliest_date: Date; latest_date: Date; version: number };
const day = (value: Date) => value.toISOString().slice(0, 10);
export async function isHistoricalSession(tx: Pick<Prisma.TransactionClient, '$queryRaw'>, sessionId: string) {
  return (await tx.$queryRaw<{ session_id: string }[]>`SELECT session_id FROM v81_history_session_sources WHERE session_id=${sessionId}::uuid`).length > 0;
}
export async function requireHistoricalSubmissionWindow(tx: Prisma.TransactionClient, sessionId: string, _now: Date) {
  const rows = await tx.$queryRaw<{ semester_status: string }[]>`
    SELECT s.status AS semester_status
    FROM v81_history_session_sources h JOIN exercise_sessions x ON x.id=h.session_id
    JOIN semesters s ON s.id=x.semester_id
    WHERE h.session_id=${sessionId}::uuid`;
  // Enrollment and course closure are checked by the shared existing-session guard.
  if (rows[0]?.semester_status === 'ARCHIVED')
    throw new ApplicationError('COURSE_SEMESTER_ARCHIVED', 409);
}
@Injectable()
export class V81HistoryBackfillService {
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService,
    private readonly clock: Clock, private readonly ids: IdGenerator, private readonly time: OrganizationTimeService) {}
  private async course(tx: Prisma.TransactionClient, p: AuthenticatedPrincipal, id: string) {
    const course = await tx.classSection.findFirst({ where: { id, organizationId: p.organizationId,
      ...(p.role === 'TEACHER' ? { teacher: { userId: p.userId } } : { enrollments: { some: { student: { userId: p.userId } } } }) },
      include: { semester: true, organization: true } });
    if (!course || !['TEACHER','STUDENT'].includes(p.role)) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND',404);
    return course;
  }
  private async settings(tx: Prisma.TransactionClient, id: string) {
    return (await tx.$queryRaw<Settings[]>`SELECT * FROM v81_history_settings WHERE class_section_id=${id}::uuid`)[0];
  }
  async read(p: AuthenticatedPrincipal, id: string) {
    return this.prisma.$transaction(async tx => {
      const course = await this.course(tx,p,id), settings = await this.settings(tx,id);
      return { classSectionId:id,enabled:settings?.enabled??false,version:settings?.version??0,
        earliestDate:day(settings?.earliest_date??course.semester.startDate),latestDate:day(settings?.latest_date??course.semester.endDate),
        semesterStartDate:day(course.semester.startDate),semesterEndDate:day(course.semester.endDate),
        today:this.time.businessDate(this.clock.now(),course.organization.timezone) };
    });
  }
  private async writable(tx: Prisma.TransactionClient,p:AuthenticatedPrincipal,id:string) {
    await tx.$queryRaw`SELECT id FROM organizations WHERE id=${p.organizationId}::uuid FOR NO KEY UPDATE`;
    if ((await tx.systemPolicy.findUnique({where:{organizationId:p.organizationId}}))?.systemMode !== 'NORMAL') throw new ApplicationError('SYSTEM_MAINTENANCE',503);
    await tx.$queryRaw`SELECT id FROM class_sections WHERE id=${id}::uuid FOR UPDATE`;
    const course=await this.course(tx,p,id);
    await requireUnsettledCourse(tx,p.organizationId,id);
    if(course.status!=='ACTIVE'||course.retiredAt||course.semester.status!=='CURRENT') throw new ApplicationError('CONFLICT_STATE_TRANSITION',409);
    return course;
  }
  async save(p:AuthenticatedPrincipal,id:string,input:HistorySettingsInput,requestId:string,key?:string) {
    if(p.role!=='TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED',403);
    return this.idempotency.execute({organizationId:p.organizationId,principalId:p.userId,authSessionId:p.sessionId,
      operationId:'saveV81HistorySettings',scope:`${p.organizationId}:${id}`,request:input,requestId,key},async tx=>{
      const course=await this.writable(tx,p,id),current=await this.settings(tx,id);
      if((current?.version??0)!==input.expectedVersion) throw new ApplicationError('CONFLICT_VERSION_MISMATCH',409);
      if(input.earliestDate>input.latestDate||input.earliestDate<day(course.semester.startDate)||input.latestDate>day(course.semester.endDate))
        throw new ApplicationError('VALIDATION_FAILED',422,{reason:'HISTORY_RANGE_OUTSIDE_SEMESTER'});
      const version=input.expectedVersion+1,now=this.clock.now();
      await tx.$executeRaw`INSERT INTO v81_history_settings(class_section_id,enabled,earliest_date,latest_date,version,updated_at)
        VALUES(${id}::uuid,${input.enabled},${input.earliestDate}::date,${input.latestDate}::date,${version},${now})
        ON CONFLICT(class_section_id) DO UPDATE SET enabled=excluded.enabled,earliest_date=excluded.earliest_date,latest_date=excluded.latest_date,version=excluded.version,updated_at=excluded.updated_at`;
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${p.organizationId}::uuid,'HISTORY_SETTINGS',${id}::uuid,'UPDATED',${p.userId}::uuid,${requestId},${version},${JSON.stringify(input)}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success({classSectionId:id,enabled:input.enabled,earliestDate:input.earliestDate,latestDate:input.latestDate,version});
    });
  }
  async create(p:AuthenticatedPrincipal,enrollmentId:string,input:HistorySessionInput,requestId:string,key?:string) {
    if(p.role!=='STUDENT') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED',403);
    return this.idempotency.execute({organizationId:p.organizationId,principalId:p.userId,authSessionId:p.sessionId,
      operationId:'createV81HistoricalSession',scope:`${p.organizationId}:${enrollmentId}`,request:input,requestId,key},async tx=>{
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${p.organizationId}::uuid FOR NO KEY UPDATE`;
      await assertProfileReady(tx,p.organizationId,p.userId);
      const member=await tx.enrollment.findFirst({where:{id:enrollmentId,organizationId:p.organizationId,student:{userId:p.userId}},include:{student:{include:{user:true}}}});
      if(!member) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND',404);
      const course=await this.writable(tx,p,member.classSectionId);
      await tx.$queryRaw`SELECT id FROM enrollments WHERE id=${enrollmentId}::uuid FOR UPDATE`;
      const active=await tx.enrollment.findUniqueOrThrow({where:{id:enrollmentId}});
      if(active.status!=='ACTIVE'||member.student.status!=='ACTIVE'||member.student.user.status!=='ACTIVE'||member.student.deletedAt||member.student.user.deletedAt)
        throw new ApplicationError('ENROLLMENT_NOT_ACTIVE',409);
      const settings=await this.settings(tx,course.id),now=this.clock.now();
      const rule=(await tx.$queryRaw<{regular_deadline:Date;published_at:Date|null;minimum_minutes:number}[]>`SELECT regular_deadline,published_at,minimum_minutes FROM v81_course_rules WHERE class_section_id=${course.id}::uuid`)[0];
      if(!settings?.enabled||!rule?.published_at) throw new ApplicationError('CONFLICT_STATE_TRANSITION',409,{reason:'HISTORY_NOT_ENABLED'});
      const currentDate=this.time.businessDate(now,course.organization.timezone);
      if(!course.checkInEndDate || currentDate>day(course.checkInEndDate) || currentDate>day(course.semester.endDate))
        throw new ApplicationError('COURSE_DEADLINE_PASSED',409);
      const startedAt=new Date(input.startedAt),completedAt=new Date(startedAt.getTime()+input.durationSeconds*1000);
      const businessDate=this.time.businessDate(startedAt,course.organization.timezone),today=this.time.businessDate(now,course.organization.timezone);
      if(businessDate>=today||businessDate<day(settings.earliest_date)||businessDate>day(settings.latest_date)||
        this.time.businessDate(completedAt,course.organization.timezone)>=today||input.durationSeconds<rule.minimum_minutes*60)
        throw new ApplicationError('VALIDATION_FAILED',422,{reason:'HISTORY_DATE_OR_DURATION_INVALID'});
      const id=this.ids.next();
      await tx.exerciseSession.create({data:{id,organizationId:p.organizationId,studentId:member.studentId,enrollmentId,
        classSectionId:course.id,semesterId:course.semesterId,startedByAuthSessionId:p.sessionId,status:'COMPLETED',startedAt,
        completedAt,businessDate:new Date(`${businessDate}T00:00:00Z`),endReason:'USER_COMPLETED',actualDurationSeconds:BigInt(input.durationSeconds),createdAt:now,updatedAt:now}});
      await tx.$executeRaw`INSERT INTO v81_history_session_sources(session_id,settings_version,earliest_date,latest_date,declared_at,request_id)
        VALUES(${id}::uuid,${settings.version},${settings.earliest_date},${settings.latest_date},${now},${requestId})`;
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${p.organizationId}::uuid,'HISTORICAL_SESSION',${id}::uuid,'DECLARED',${p.userId}::uuid,${requestId},1,${JSON.stringify({businessDate,durationSeconds:input.durationSeconds,settingsVersion:settings.version})}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success({id,enrollmentId,classSectionId:course.id,status:'COMPLETED',recordOrigin:'HISTORICAL',businessDate,
        startedAt:startedAt.toISOString(),completedAt:completedAt.toISOString(),actualDurationSeconds:input.durationSeconds,pausedDurationSeconds:0,version:1});
    });
  }
}
const uuid=new ParseUUIDPipe({exceptionFactory:()=>new ApplicationError('VALIDATION_FAILED',422)});
@Controller()
export class V81HistoryBackfillController {
  constructor(private readonly service:V81HistoryBackfillService) {}
  @Get('class-sections/:classSectionId/history-settings') @OperationPolicy('getV81HistorySettings')
  read(@CurrentPrincipal() p:AuthenticatedPrincipal,@Param('classSectionId',uuid) id:string){return this.service.read(p,id);}
  @Post('class-sections/:classSectionId/history-settings') @OperationPolicy('saveV81HistorySettings')
  save(@CurrentPrincipal() p:AuthenticatedPrincipal,@Param('classSectionId',uuid) id:string,@Body() input:HistorySettingsInput,@Req() req:FoundationRequest,@Headers('idempotency-key') key?:string){return this.service.save(p,id,input,req.requestId,key);}
  @Post('enrollments/:enrollmentId/historical-sessions') @OperationPolicy('createV81HistoricalSession')
  create(@CurrentPrincipal() p:AuthenticatedPrincipal,@Param('enrollmentId',uuid) id:string,@Body() input:HistorySessionInput,@Req() req:FoundationRequest,@Headers('idempotency-key') key?:string){return this.service.create(p,id,input,req.requestId,key);}
}
