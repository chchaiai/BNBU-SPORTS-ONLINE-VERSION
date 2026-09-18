import { Injectable } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ScopedCursorService } from '../../common/pagination/scoped-cursor.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { requireAdminAccess } from '../v8/v81-admin-access.js';

export class OutboxQuery {
  @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=25;
  @ValidateIf((_o,v:unknown)=>v!==undefined) @IsString() @MaxLength(2048) cursor?:string;
  @ValidateIf((_o,v:unknown)=>v!==undefined) @IsIn(['PENDING','PROCESSING','PROCESSED','FAILED']) status?:string;
  @ValidateIf((_o,v:unknown)=>v!==undefined) @IsString() @MaxLength(128) @Matches(/^[A-Z][A-Z0-9_]*$/) eventType?:string;
  @ValidateIf((_o,v:unknown)=>v!==undefined) @IsISO8601({strict:true}) from?:string;
  @ValidateIf((_o,v:unknown)=>v!==undefined) @IsISO8601({strict:true}) to?:string;
}
type Row={id:string;eventType:string;status:string;createdAt:Date;cursorTimestamp:string;processedAt:Date|null;lockedAt:Date|null;attempts:number;
  lastErrorCode:string|null;aggregateType:string;aggregateId:string;availableAt:Date;requestId:string|null};

@Injectable()
export class OutboxDiagnosticsService {
  constructor(private readonly db:PrismaService,private readonly cursors:ScopedCursorService){}
  async list(principal:AuthenticatedPrincipal,q:OutboxQuery){
    const from=q.from?new Date(q.from):null,to=q.to?new Date(q.to):null;
    if(from&&to&&from>to)throw new ApplicationError('VALIDATION_FAILED',422);
    const binding={resource:'AUDIT_LOG' as const,organizationId:principal.organizationId,principalId:principal.userId,role:principal.role,
      filters:{scope:'OUTBOX_DIAGNOSTICS',status:q.status??null,eventType:q.eventType??null,from:q.from??null,to:q.to??null},sort:'-createdAt,-id',limit:q.limit};
    const position=this.cursors.decode(q.cursor,binding);
    return this.db.$transaction(async tx=>{
      await requireAdminAccess(tx,principal,'AUDIT_QUERY');
      const where=Prisma.sql`organization_id=${principal.organizationId}::uuid
        AND (${q.status??null}::text IS NULL OR status=${q.status??null})
        AND (${q.eventType??null}::text IS NULL OR event_type=${q.eventType??null})
        AND (${from}::timestamptz IS NULL OR created_at>=${from}) AND (${to}::timestamptz IS NULL OR created_at<=${to})`;
      const counts=await tx.$queryRaw<{count:bigint}[]>(Prisma.sql`SELECT count(*) AS count FROM outbox_events WHERE ${where}`);
      const backlog=await tx.outboxEvent.count({where:{organizationId:principal.organizationId,status:{in:['PENDING','FAILED']}}});
      const rows=await tx.$queryRaw<Row[]>(Prisma.sql`SELECT id,event_type AS "eventType",status,created_at AS "createdAt",created_at::text AS "cursorTimestamp",
        processed_at AS "processedAt",locked_at AS "lockedAt",attempts,last_error_code AS "lastErrorCode",
        aggregate_type AS "aggregateType",aggregate_id AS "aggregateId",available_at AS "availableAt",
        CASE WHEN payload->>'requestId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          THEN payload->>'requestId' ELSE NULL END AS "requestId"
        FROM outbox_events WHERE ${where}
        AND (${position?.value??null}::timestamptz IS NULL OR (created_at,id)<(${position?.value??null}::timestamptz,${position?.id??null}::uuid))
        ORDER BY created_at DESC,id DESC LIMIT ${q.limit+1}`);
      const page=rows.slice(0,q.limit),last=page.at(-1);
      const actors = page.length ? await tx.$queryRaw<{id:string;actorName:string|null;actorEmail:string|null;actorRole:string|null;actorNumber:string|null;operationOutcome:string|null;action:string|null}[]>(Prisma.sql`
        SELECT e.id,coalesce(s.full_name,t.full_name,a.full_name) AS "actorName",u.primary_email AS "actorEmail",u.role AS "actorRole",
          s.student_number AS "actorNumber",log.outcome AS "operationOutcome",log.action_type AS action
        FROM outbox_events e
        LEFT JOIN LATERAL (SELECT actor_user_id,outcome,action_type FROM audit_logs l
          WHERE l.organization_id=e.organization_id AND l.request_id=e.payload->>'requestId'
          AND l.target_id=e.aggregate_id ORDER BY l.occurred_at DESC,l.id DESC LIMIT 1) log ON true
        LEFT JOIN users u ON u.id=log.actor_user_id AND u.organization_id=e.organization_id
        LEFT JOIN student_profiles s ON s.user_id=u.id AND s.organization_id=e.organization_id
        LEFT JOIN teacher_profiles t ON t.user_id=u.id AND t.organization_id=e.organization_id
        LEFT JOIN admin_profiles a ON a.user_id=u.id AND a.organization_id=e.organization_id
        WHERE e.organization_id=${principal.organizationId}::uuid AND e.id::text IN (${Prisma.join(page.map(item=>item.id))})`) : [];
      const actorMap=new Map(actors.map(actor=>[actor.id,actor]));
      return {scope:'CURRENT_ORGANIZATION',backlog,total:Number(counts[0]!.count),
        items:page.map(({cursorTimestamp: _cursorTimestamp,...row})=>({...row,actor:actorMap.get(row.id)??null,createdAt:row.createdAt.toISOString(),processedAt:row.processedAt?.toISOString()??null,
          lockedAt:row.lockedAt?.toISOString()??null,availableAt:row.availableAt.toISOString(),
          lastProcessedAt:(row.processedAt??row.lockedAt)?.toISOString()??null,
          retryCount:Math.max(0,row.attempts-1),
          lastErrorCode:row.lastErrorCode&&/^[A-Z][A-Z0-9_]{0,63}$/.test(row.lastErrorCode)?row.lastErrorCode:null,
          lifecycle:row.status==='FAILED'?'RETRY_PENDING':row.status==='PROCESSED'?'SUCCEEDED':row.status==='PROCESSING'?'PROCESSING':'PENDING'})),
        nextCursor:rows.length>q.limit&&last?this.cursors.encode(binding,{id:last.id,value:last.cursorTimestamp}):null};
    },{isolationLevel:'RepeatableRead'});
  }
}
