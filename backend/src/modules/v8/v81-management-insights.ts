import { displaySportName } from './domain/sport-display.js';
import { Body, Controller, Get, Headers, Injectable, Param, Patch, Query, Req, ParseUUIDPipe } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, Min } from 'class-validator';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import type { AuthenticatedPrincipal, FoundationRequest } from '../../common/http/request-context.js';
import { requireAdminAccess } from './v81-admin-access.js';
import { permitsSystemMode } from '../system-mode/system-mode-access.js';

export class InsightsQuery {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @IsUUID() classSectionId?: string;
}
export class TeacherDetailsInput {
  @Transform(({value}: {value: unknown}) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(1,100) fullName!: string;
  @IsString() @MaxLength(1000) remark!: string;
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}
@Injectable()
export class V81ManagementInsightsService {
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService,
    private readonly clock: Clock, private readonly ids: IdGenerator) {}
  async teacher(p: AuthenticatedPrincipal, id: string) {
    return this.prisma.$transaction(async tx => {
      await requireAdminAccess(tx,p,'USER_ACCOUNTS');
      const teacher = await tx.teacherProfile.findFirst({where:{id,organizationId:p.organizationId,deletedAt:null}});
      if (!teacher) throw new ApplicationError('USER_NOT_FOUND',404);
      const notes = await tx.$queryRaw<{remark:string}[]>`SELECT remark FROM v81_teacher_notes WHERE teacher_id=${id}::uuid AND organization_id=${p.organizationId}::uuid`;
      return {id,fullName:teacher.fullName,remark:notes[0]?.remark ?? '',version:teacher.version};
    });
  }
  async updateTeacher(p:AuthenticatedPrincipal,id:string,input:TeacherDetailsInput,requestId:string,key?:string) {
    await requireAdminAccess(this.prisma,p,'USER_ACCOUNTS');
    return this.idempotency.execute({organizationId:p.organizationId,principalId:p.userId,authSessionId:p.sessionId,
      operationId:'updateV81TeacherDetails',scope:id,key,requestId,request:input},async tx => {
      await requireAdminAccess(tx,p,'USER_ACCOUNTS');
      const policy=await tx.systemPolicy.findUnique({where:{organizationId:p.organizationId}});
      if(!permitsSystemMode(policy?.systemMode,p.role)) throw new ApplicationError('SYSTEM_MAINTENANCE',503);
      const now=this.clock.now();
      const result=await tx.teacherProfile.updateMany({where:{id,organizationId:p.organizationId,deletedAt:null,version:input.expectedVersion},data:{fullName:input.fullName,version:{increment:1},updatedAt:now}});
      if(result.count!==1) throw new ApplicationError('CONFLICT_VERSION_MISMATCH',409);
      await tx.$executeRaw`INSERT INTO v81_teacher_notes(teacher_id,organization_id,remark,updated_at) VALUES(${id}::uuid,${p.organizationId}::uuid,${input.remark.trim()},${now}) ON CONFLICT(teacher_id) DO UPDATE SET remark=excluded.remark,updated_at=excluded.updated_at`;
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${p.organizationId}::uuid,'TEACHER_PROFILE',${id}::uuid,'UPDATED',${p.userId}::uuid,${requestId},${input.expectedVersion+1},${JSON.stringify({changedFields:['fullName','remark']})}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success({id,fullName:input.fullName,remark:input.remark.trim(),version:input.expectedVersion+1});
    });
  }
  async insights(p:AuthenticatedPrincipal,q:InsightsQuery) {
    return this.prisma.$transaction(async tx => {
      await requireAdminAccess(tx,p,'SUPER');
      const now=this.clock.now(),to=q.to ?? new Date(now.getTime()+8*3600000).toISOString().slice(0,10),from=q.from ?? new Date(now.getTime()+8*3600000-29*86400000).toISOString().slice(0,10);
      const start=Date.parse(from),end=Date.parse(to);
      if(!Number.isFinite(start)||!Number.isFinite(end)||new Date(start).toISOString().slice(0,10)!==from||new Date(end).toISOString().slice(0,10)!==to||start>end||end-start>366*86400000) throw new ApplicationError('VALIDATION_FAILED',422,{reason:'DATE_RANGE_MAX_367_DAYS'});
      const base=Prisma.sql`SELECT r.*,coalesce(w.stage,'UNKNOWN') AS stage,coalesce(c.credited_minutes,0) AS credited_minutes,
        s.started_at,t.display_name AS class_name,coalesce(r.sport_name,r.sport_type) AS sport,
        (s.started_at AT TIME ZONE 'Asia/Shanghai') AS local_start
        FROM exercise_records r JOIN exercise_sessions s ON s.id=r.session_id
        JOIN class_sections t ON t.id=r.class_section_id
        LEFT JOIN v81_record_workflows w ON w.record_id=r.id
        LEFT JOIN v81_credit_projections c ON c.record_id=r.id
        WHERE r.organization_id=${p.organizationId}::uuid AND r.status NOT IN ('DRAFT','CANCELLED')
          AND r.business_date BETWEEN ${from}::date AND ${to}::date
          AND (${q.classSectionId ?? null}::uuid IS NULL OR r.class_section_id=${q.classSectionId ?? null}::uuid)`;
      type Bucket={label:string;value:bigint};
      const daily=await tx.$queryRaw<Bucket[]>(Prisma.sql`WITH r AS (${base}) SELECT business_date::text AS label,count(*) AS value FROM r GROUP BY business_date ORDER BY business_date`);
      const sportGroups=await tx.$queryRaw<(Bucket & {credit_type:string;class_name:string})[]>(Prisma.sql`WITH r AS (${base}) SELECT sport AS label,credit_type,class_name,count(*) AS value FROM r GROUP BY sport,credit_type,class_name ORDER BY value DESC,label`);
      const sportTotals=new Map<string,bigint>();
      for(const row of sportGroups){const label=displaySportName(row.label,row.credit_type,row.class_name)??row.label;sportTotals.set(label,(sportTotals.get(label)??0n)+row.value);}
      const sports=[...sportTotals].map(([label,value])=>({label,value})).sort((a,b)=>Number(b.value-a.value)||a.label.localeCompare(b.label));
      const stages=await tx.$queryRaw<Bucket[]>(Prisma.sql`WITH r AS (${base}) SELECT stage AS label,count(*) AS value FROM r GROUP BY stage ORDER BY value DESC,label`);
      const frequency=await tx.$queryRaw<Bucket[]>(Prisma.sql`WITH r AS (${base}), f AS (SELECT student_id,count(DISTINCT business_date) AS days FROM r GROUP BY student_id) SELECT days::text AS label,count(*) AS value FROM f GROUP BY days ORDER BY days`);
      const heatmap=await tx.$queryRaw<{weekday:number;hour:number;value:bigint}[]>(Prisma.sql`WITH r AS (${base}) SELECT extract(isodow FROM local_start)::int AS weekday,extract(hour FROM local_start)::int AS hour,count(*) AS value FROM r GROUP BY weekday,hour ORDER BY weekday,hour`);
      const classes=await tx.$queryRaw<Bucket[]>(Prisma.sql`WITH r AS (${base}) SELECT class_name AS label,count(*) AS value FROM r GROUP BY class_section_id,class_name ORDER BY value DESC,label`);
      const summary=await tx.$queryRaw<{records:bigint;students:bigint;seconds:bigint;credited:bigint}[]>(Prisma.sql`WITH r AS (${base}) SELECT count(*) AS records,count(DISTINCT student_id) AS students,coalesce(sum(actual_duration_seconds),0)::bigint AS seconds,coalesce(sum(CASE WHEN stage='VALID' THEN credited_minutes*60 ELSE 0 END),0)::bigint AS credited FROM r`);
      const teachers=await tx.$queryRaw<Bucket[]>`SELECT t.full_name AS label,count(*) AS value FROM review_records v JOIN teacher_profiles t ON t.id=v.teacher_id JOIN exercise_records r ON r.id=v.record_id
        WHERE v.organization_id=${p.organizationId}::uuid AND v.reviewed_at>=(${from}::date::timestamp AT TIME ZONE 'Asia/Shanghai') AND v.reviewed_at<((${to}::date+1)::timestamp AT TIME ZONE 'Asia/Shanghai')
        AND (${q.classSectionId ?? null}::uuid IS NULL OR r.class_section_id=${q.classSectionId ?? null}::uuid) GROUP BY t.id,t.full_name ORDER BY value DESC,label`;
      const buckets=(rows:Bucket[])=>rows.map(row=>({label:row.label,value:Number(row.value)}));
      return {generatedAt:now.toISOString(),timezone:'Asia/Shanghai',from,to,summary:Object.fromEntries(Object.entries(summary[0]!).map(([k,v])=>[k,Number(v)])),daily:Array.from({length:Math.round((end-start)/86400000)+1},(_,i)=>{const label=new Date(start+i*86400000).toISOString().slice(0,10);return {label,value:Number(daily.find(r=>r.label===label)?.value??0n)};}),sports:buckets(sports),stages:buckets(stages),frequency:buckets(frequency),classes:buckets(classes),teachers:buckets(teachers),heatmap:heatmap.map(r=>({...r,value:Number(r.value)}))};
    },{isolationLevel:'RepeatableRead',timeout:30000});
  }
}
@Controller('admin')
export class V81ManagementInsightsController {
  constructor(private readonly service:V81ManagementInsightsService) {}
  @Get('insights') @OperationPolicy('getV81ManagementInsights')
  insights(@CurrentPrincipal() p:AuthenticatedPrincipal,@Query() q:InsightsQuery) {return this.service.insights(p,q);}
  @Get('teachers/:id/details') @OperationPolicy('getV81TeacherDetails')
  teacher(@CurrentPrincipal() p:AuthenticatedPrincipal,@Param('id',new ParseUUIDPipe()) id:string) {return this.service.teacher(p,id);}
  @Patch('teachers/:id/details') @OperationPolicy('updateV81TeacherDetails')
  update(@CurrentPrincipal() p:AuthenticatedPrincipal,@Param('id',new ParseUUIDPipe()) id:string,@Body() body:TeacherDetailsInput,@Req() r:FoundationRequest,@Headers('idempotency-key') key?:string) {return this.service.updateTeacher(p,id,body,r.requestId,key);}
}
