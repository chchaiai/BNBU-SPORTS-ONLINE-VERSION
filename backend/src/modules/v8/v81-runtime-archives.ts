import { permitsSystemMode } from '../system-mode/system-mode-access.js';
import { Body, Controller, Get, Header, Headers, HttpCode, Inject, Injectable, Logger, Param, ParseUUIDPipe, Post, Query, Req, Res, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { IsInt, IsString, Matches, Max, Min } from 'class-validator';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Response } from 'express';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { SecureDigestService } from '../../common/security/secure-digest.service.js';
import { RUNTIME_CONFIG } from '../../common/config/runtime-config.module.js';
import type { RuntimeConfig } from '../../common/config/environment.js';
import { RuntimeLogSource } from '../../common/logging/runtime-log-source.js';
import { OBJECT_STORAGE_PORT, type ObjectStoragePort } from '../../common/object-storage/object-storage.port.js';
import { Clock } from '../../common/time/clock.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import type { AuthenticatedPrincipal, FoundationRequest } from '../../common/http/request-context.js';
import { requireAdminAccess } from './v81-admin-access.js';
import { runtimeLogZip } from './domain/runtime-log-zip.js';
import { runtimeArchiveDiagnostics } from './runtime-archive-diagnostics.js';
import { appendV81SystemEvent } from './v81-system-event.js';

export class RuntimeArchiveInput {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/u) startDate!:string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/u) endDate!:string;
}
export class RuntimeArchiveVersionInput { @IsInt() @Min(1) @Max(2147483646) expectedVersion!:number; }
export class RuntimeArchiveCapabilityQuery { @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/u) capability!:string; }
type Job={id:string;organization_id:string;requester_id:string;start_date:Date;end_date:Date;timezone:string;status:string;version:number;
  lease_owner:string|null;lease_until:Date|null;storage_key:string|null;sha256:string|null;byte_length:bigint|null;record_count:number|null;
  failure_code:string|null;request_id:string;created_at:Date;updated_at:Date;expires_at:Date};
const projection=(j:Job,now:Date)=>({id:j.id,startDate:j.start_date.toISOString().slice(0,10),endDate:j.end_date.toISOString().slice(0,10),timezone:j.timezone,
  status:j.expires_at<=now && !['CANCELLED','FAILED'].includes(j.status)?'EXPIRED':j.status,version:j.version,
  createdAt:j.created_at.toISOString(),updatedAt:j.updated_at.toISOString(),expiresAt:j.expires_at.toISOString(),
  byteLength:j.byte_length===null?null:Number(j.byte_length),recordCount:j.record_count,sha256:j.sha256,failureCode:j.failure_code,
  coverage:'AVAILABLE_SCOPED_HTTP_RECORDS_ONLY'});
@Injectable()
export class V81RuntimeArchivesService {
  constructor(private readonly prisma:PrismaService,private readonly idempotency:IdempotencyService,private readonly digest:SecureDigestService,
    private readonly clock:Clock,@Inject(RUNTIME_CONFIG) private readonly config:RuntimeConfig,
    @Inject(OBJECT_STORAGE_PORT) private readonly storage:ObjectStoragePort) {}
  private async scope(tx:Prisma.TransactionClient,p:AuthenticatedPrincipal,id:string) {
    await requireAdminAccess(tx,p,'AUDIT_QUERY');
    const job=(await tx.$queryRaw<Job[]>`SELECT * FROM v81_runtime_archives WHERE id=${id}::uuid AND organization_id=${p.organizationId}::uuid AND requester_id=${p.userId}::uuid`)[0];
    if (!job) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND',404);
    return job;
  }
  private async normal(tx:Prisma.TransactionClient,p:AuthenticatedPrincipal) {
    await tx.$queryRaw`SELECT id FROM organizations WHERE id=${p.organizationId}::uuid FOR NO KEY UPDATE`;
    await requireAdminAccess(tx,p,'AUDIT_QUERY');
    if (!permitsSystemMode((await tx.systemPolicy.findUnique({where:{organizationId:p.organizationId}}))?.systemMode, p.role)) throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
  }
  async get(p:AuthenticatedPrincipal,id:string) { return this.prisma.$transaction(async tx=>projection(await this.scope(tx,p,id),this.clock.now())); }
  async create(p:AuthenticatedPrincipal,input:RuntimeArchiveInput,requestId:string,key?:string) {
    await requireAdminAccess(this.prisma,p,'AUDIT_QUERY');
    if (!this.config.runtimeLogDirectory) throw new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE',503,{reason:'RUNTIME_LOG_SOURCE_UNAVAILABLE'});
    for (const date of [input.startDate,input.endDate]) {
      const parsed=new Date(date+'T00:00:00Z');
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==date || date.startsWith('0000')) throw new ApplicationError('VALIDATION_FAILED',422);
    }
    if (input.startDate>input.endDate) throw new ApplicationError('VALIDATION_FAILED',422);
    return this.idempotency.execute({organizationId:p.organizationId,principalId:p.userId,authSessionId:p.sessionId,operationId:'createV81RuntimeArchive',
      scope:p.organizationId,request:input,requestId,key},async tx=>{
      await this.normal(tx,p);
      const org=await tx.organization.findUniqueOrThrow({where:{id:p.organizationId}}),now=this.clock.now(),id=randomUUID();
      const jobs=await tx.$queryRaw<Job[]>`INSERT INTO v81_runtime_archives(id,organization_id,requester_id,start_date,end_date,timezone,request_id,created_at,updated_at,expires_at)
        VALUES(${id}::uuid,${p.organizationId}::uuid,${p.userId}::uuid,${input.startDate}::date,${input.endDate}::date,${org.timezone},${requestId},${now},${now},${new Date(now.getTime()+86400000)}) RETURNING *`;
      await archiveEvent(tx,jobs[0]!,'REQUESTED',p.userId,now);
      return this.idempotency.success(projection(jobs[0]!,now));
    });
  }
  async cancel(p:AuthenticatedPrincipal,id:string,input:RuntimeArchiveVersionInput,requestId:string,key?:string) {
    return this.idempotency.execute({organizationId:p.organizationId,principalId:p.userId,authSessionId:p.sessionId,operationId:'cancelV81RuntimeArchive',
      scope:id,request:input,requestId,key},async tx=>{
      await this.normal(tx,p); const job=await this.scope(tx,p,id);
      if (job.version!==input.expectedVersion) throw new ApplicationError('CONFLICT_VERSION_MISMATCH',409);
      if (!['QUEUED','RUNNING','SUCCEEDED'].includes(job.status) || job.expires_at<=this.clock.now()) throw new ApplicationError('CONFLICT_STATE_TRANSITION',409);
      const now=this.clock.now(),rows=await tx.$queryRaw<Job[]>`UPDATE v81_runtime_archives SET status='CANCELLED',version=version+1,updated_at=${now} WHERE id=${id}::uuid RETURNING *`;
      await archiveEvent(tx,rows[0]!,'CANCELLED',p.userId,now,requestId);
      return this.idempotency.success(projection(rows[0]!,now));
    });
  }
  async downloadUrl(p:AuthenticatedPrincipal,id:string,input:RuntimeArchiveVersionInput,requestId:string,key?:string) {
    return this.idempotency.execute({organizationId:p.organizationId,principalId:p.userId,authSessionId:p.sessionId,operationId:'createV81RuntimeArchiveDownload',
      scope:id,request:input,requestId,key},async tx=>{
      await this.normal(tx,p); const job=await this.scope(tx,p,id),now=this.clock.now();
      if (job.version!==input.expectedVersion) throw new ApplicationError('CONFLICT_VERSION_MISMATCH',409);
      if (job.status!=='SUCCEEDED' || job.expires_at<=now) throw new ApplicationError('CONFLICT_STATE_TRANSITION',409);
      const token=randomBytes(32).toString('base64url'),expiresAt=new Date(Math.min(job.expires_at.getTime(),now.getTime()+120000)),capabilityId=randomUUID();
      await tx.$executeRaw`INSERT INTO v81_runtime_archive_capabilities(id,archive_id,organization_id,user_id,auth_session_id,job_version,token_hash,created_at,expires_at)
        VALUES(${capabilityId}::uuid,${id}::uuid,${p.organizationId}::uuid,${p.userId}::uuid,${p.sessionId}::uuid,${job.version},${this.digest.digest('runtime-archive-download',token)},${now},${expiresAt})`;
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${randomUUID()}::uuid,${p.organizationId}::uuid,'RUNTIME_ARCHIVE_DOWNLOAD',${capabilityId}::uuid,'ISSUED',${p.userId}::uuid,${requestId},1,
          ${JSON.stringify({archiveId:id,jobVersion:job.version,expiresAt:expiresAt.toISOString()})}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success({downloadUrl:`/api/v1/admin/runtime-archives/${id}/content?capability=${token}`,expiresAt:expiresAt.toISOString()});
    });
  }
  private async downloadScope(tx:Prisma.TransactionClient,p:AuthenticatedPrincipal,id:string,token:string) {
    await this.normal(tx,p); const job=await this.scope(tx,p,id),now=this.clock.now();
    const cap=await tx.$queryRaw<{id:string}[]>`SELECT id FROM v81_runtime_archive_capabilities WHERE archive_id=${id}::uuid AND organization_id=${p.organizationId}::uuid
      AND user_id=${p.userId}::uuid AND auth_session_id=${p.sessionId}::uuid AND job_version=${job.version} AND expires_at>${now}
      AND token_hash=${this.digest.digest('runtime-archive-download',token)}`;
    if (!cap.length || job.status!=='SUCCEEDED' || job.expires_at<=now || !job.storage_key) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND',404);
    return job;
  }
  async content(p:AuthenticatedPrincipal,id:string,token:string,requestId:string) {
    const job=await this.prisma.$transaction(tx=>this.downloadScope(tx,p,id,token));
    const chunks:Buffer[]=[];let size=0;
    for await (const chunk of await this.storage.getPrivateObject(job.storage_key!)) {
      const bytes=Buffer.from(chunk);size+=bytes.length;if(size>81*1024*1024) throw new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE',503);chunks.push(bytes);
    }
    const bytes=Buffer.concat(chunks);
    if (BigInt(bytes.length)!==job.byte_length || createHash('sha256').update(bytes).digest('hex')!==job.sha256) throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR',500);
    await this.prisma.$transaction(async tx=>{
      await this.downloadScope(tx,p,id,token);
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${randomUUID()}::uuid,${p.organizationId}::uuid,'RUNTIME_ARCHIVE_ACCESS',${randomUUID()}::uuid,'DOWNLOADED',${p.userId}::uuid,${requestId},1,
          ${JSON.stringify({archiveId:id,jobVersion:job.version})}::jsonb,${this.clock.now()},'SUCCEEDED')`;
    });
    return bytes;
  }
}
async function archiveEvent(tx:Prisma.TransactionClient,job:Job,event:string,actor:string|null,now:Date,requestId=job.request_id) {
  if (actor === null) return appendV81SystemEvent(tx, { organizationId: job.organization_id, resourceType: 'RUNTIME_ARCHIVE',
    resourceId: job.id, eventType: event, requestId, version: job.version, occurredAt: now,
    outcome: job.status === 'FAILED' ? 'FAILED' : 'SUCCEEDED', reasonCode: job.failure_code,
    facts: { status: job.status, failureCode: job.failure_code } });
  await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
    VALUES(${randomUUID()}::uuid,${job.organization_id}::uuid,'RUNTIME_ARCHIVE',${job.id}::uuid,${event},${actor}::uuid,${requestId},${job.version},
      ${JSON.stringify({status:job.status,failureCode:job.failure_code})}::jsonb,${now},'SUCCEEDED')`;
}
const uuid=new ParseUUIDPipe({exceptionFactory:()=>new ApplicationError('VALIDATION_FAILED',422)});
@Controller('admin/runtime-archives')
export class V81RuntimeArchivesController {
  constructor(private readonly service:V81RuntimeArchivesService) {}
  @Post() @HttpCode(202) @OperationPolicy('createV81RuntimeArchive')
  create(@CurrentPrincipal() p:AuthenticatedPrincipal,@Body() b:RuntimeArchiveInput,@Req() r:FoundationRequest,@Headers('idempotency-key') k?:string) { return this.service.create(p,b,r.requestId,k); }
  @Get(':id') @OperationPolicy('getV81RuntimeArchive')
  get(@CurrentPrincipal() p:AuthenticatedPrincipal,@Param('id',uuid) id:string) { return this.service.get(p,id); }
  @Post(':id/cancellation') @OperationPolicy('cancelV81RuntimeArchive')
  cancel(@CurrentPrincipal() p:AuthenticatedPrincipal,@Param('id',uuid) id:string,@Body() b:RuntimeArchiveVersionInput,@Req() r:FoundationRequest,@Headers('idempotency-key') k?:string) { return this.service.cancel(p,id,b,r.requestId,k); }
  @Post(':id/download-url') @OperationPolicy('createV81RuntimeArchiveDownload')
  download(@CurrentPrincipal() p:AuthenticatedPrincipal,@Param('id',uuid) id:string,@Body() b:RuntimeArchiveVersionInput,@Req() r:FoundationRequest,@Headers('idempotency-key') k?:string) { return this.service.downloadUrl(p,id,b,r.requestId,k); }
  @Get(':id/content') @Header('Cache-Control','private, no-store') @OperationPolicy('downloadV81RuntimeArchive')
  async content(@CurrentPrincipal() p:AuthenticatedPrincipal,@Param('id',uuid) id:string,@Query() q:RuntimeArchiveCapabilityQuery,@Req() r:FoundationRequest,@Res() res:Response) {
    const bytes=await this.service.content(p,id,q.capability,r.requestId);
    res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/zip');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Disposition',`attachment; filename="runtime-archive-${id}.zip"`);res.send(bytes);
  }
}

@Injectable()
export class V81RuntimeArchiveWorker implements OnApplicationBootstrap,OnModuleDestroy {
  private timer:ReturnType<typeof setInterval>|null=null;private running=false;private readonly logger=new Logger(V81RuntimeArchiveWorker.name);
  constructor(private readonly prisma:PrismaService,private readonly source:RuntimeLogSource,private readonly clock:Clock,
    @Inject(OBJECT_STORAGE_PORT) private readonly storage:ObjectStoragePort) {}
  onApplicationBootstrap(){this.timer=setInterval(()=>void this.tick(),5000);this.timer.unref();}
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);this.timer=null;}
  private async tick(){if(this.running)return;this.running=true;try{await this.processOne();}catch{this.logger.error('Runtime archive generation interrupted; durable task will retry.');}finally{try{await this.cleanup();}catch{this.logger.error('Runtime archive cleanup scan failed; will retry.');}this.running=false;}}
  async cleanup() {
    const now=this.clock.now();
    const candidates=await this.prisma.$queryRaw<Job[]>`SELECT j.* FROM v81_runtime_archives j
      JOIN system_policies p ON p.organization_id=j.organization_id
      WHERE j.storage_key IS NOT NULL AND (j.status IN ('CANCELLED','EXPIRED') OR j.expires_at<=${now})
      AND p.system_mode='NORMAL' AND NOT EXISTS(SELECT 1 FROM v81_runtime_archive_cleanup c WHERE c.archive_id=j.id)
      ORDER BY j.created_at,j.id LIMIT 10`;
    for(const candidate of candidates) {
      try {
        await this.prisma.$transaction(async tx=>{
          await tx.$queryRaw`SELECT id FROM organizations WHERE id=${candidate.organization_id}::uuid FOR NO KEY UPDATE`;
          const rows=await tx.$queryRaw<Job[]>`SELECT * FROM v81_runtime_archives WHERE id=${candidate.id}::uuid FOR UPDATE`;
          const job=rows[0],at=this.clock.now();
          if(!job?.storage_key || (!['CANCELLED','EXPIRED'].includes(job.status) && job.expires_at>at))return;
          if((await tx.systemPolicy.findUnique({where:{organizationId:job.organization_id}}))?.systemMode!=='NORMAL')return;
          if((await tx.$queryRaw<{archive_id:string}[]>`SELECT archive_id FROM v81_runtime_archive_cleanup WHERE archive_id=${job.id}::uuid`).length)return;
          // This is only a derived private ZIP. Source logs and immutable business/audit history remain stored.
          await this.storage.deletePrivateObject(job.storage_key);
          const cleanupId=randomUUID();
          await tx.$executeRaw`INSERT INTO v81_runtime_archive_cleanup(archive_id,id,deleted_at) VALUES(${job.id}::uuid,${cleanupId}::uuid,${at})`;
          await appendV81SystemEvent(tx, { organizationId: job.organization_id, resourceType: 'RUNTIME_ARCHIVE_CLEANUP',
            resourceId: cleanupId, eventType: 'DELETED', requestId: randomUUID(), version: 1, occurredAt: at,
            outcome: 'SUCCEEDED', facts: { archiveId: job.id, jobVersion: job.version } });
        },{timeout:30000});
      } catch { this.logger.error('Private runtime archive cleanup failed; durable candidate will retry.'); }
    }
  }
  private async allowed(tx:Prisma.TransactionClient,j:Job) {
    const rows=await tx.$queryRaw<{id:string}[]>`SELECT u.id FROM users u JOIN v81_admin_access a ON a.user_id=u.id WHERE u.id=${j.requester_id}::uuid
      AND u.organization_id=${j.organization_id}::uuid AND u.status='ACTIVE' AND u.deleted_at IS NULL AND NOT a.must_change_password AND (a.kind='SUPER' OR a.permissions ? 'AUDIT_QUERY')`;
    return rows.length>0;
  }
  async processOne(){
    const now=this.clock.now(),candidate=(await this.prisma.$queryRaw<Job[]>`SELECT j.* FROM v81_runtime_archives j JOIN system_policies p ON p.organization_id=j.organization_id
      WHERE (j.status='QUEUED' OR (j.status='RUNNING' AND j.lease_until<=${now})) AND j.expires_at>${now} AND p.system_mode IN ('NORMAL','MAINTENANCE') ORDER BY j.created_at,j.id LIMIT 1`)[0];
    if(!candidate)return null;
    const owner=randomUUID(),job=await this.prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${candidate.organization_id}::uuid FOR NO KEY UPDATE`;
      const rows=await tx.$queryRaw<Job[]>`SELECT * FROM v81_runtime_archives WHERE id=${candidate.id}::uuid AND (status='QUEUED' OR (status='RUNNING' AND lease_until<=${now})) FOR UPDATE SKIP LOCKED`;
      if(!rows[0] || !permitsSystemMode((await tx.systemPolicy.findUnique({where:{organizationId:candidate.organization_id}}))?.systemMode, 'ADMIN'))return null;
      const authorized=await this.allowed(tx,rows[0]);
      const claimed=await tx.$queryRaw<Job[]>`UPDATE v81_runtime_archives SET status=${authorized?'RUNNING':'FAILED'},version=version+1,updated_at=${now},
        lease_owner=${owner}::uuid,lease_until=${new Date(now.getTime()+120000)},failure_code=${authorized?null:'PERMISSION_REVOKED'} WHERE id=${candidate.id}::uuid RETURNING *`;
      await archiveEvent(tx,claimed[0]!,authorized?'CLAIMED':'FAILED',null,now);return authorized?claimed[0]!:null;
    });
    if(!job)return null;
    const storageKey=`runtime-archives/${job.organization_id}/${job.id}/${owner}.zip`;
    let bytes:Buffer|null=null,recordCount:number|null=null,failure:string|null=null;
    try {
      const data=await this.source.read(job.organization_id,job.start_date.toISOString().slice(0,10),job.end_date.toISOString().slice(0,10),job.timezone);
      const diagnostics=await runtimeArchiveDiagnostics(this.prisma,job.organization_id,data.startDate,data.endDate,data.timezone,data.records);
      const manifest={archiveId:job.id,startDate:data.startDate,endDate:data.endDate,timezone:data.timezone,generatedAt:this.clock.now().toISOString(),
        sourceType:data.sourceType,coverage:data.coverage,recordCount:data.records.length,auditEventCount:diagnostics.auditEvents.length,
        sections:['runtime.ndjson','audit.ndjson','health.json','requests.json'],infrastructureHealth:'UNAVAILABLE',retentionCompleteness:'UNVERIFIED'};
      bytes=runtimeLogZip([{name:'manifest.json',bytes:Buffer.from(JSON.stringify(manifest,null,2)+'\n')},
        {name:'runtime.ndjson',bytes:Buffer.from(data.records.map(r=>JSON.stringify(r)).join('\n')+(data.records.length?'\n':''))},
        {name:'audit.ndjson',bytes:Buffer.from(diagnostics.auditEvents.map(r=>JSON.stringify(r)).join('\n')+(diagnostics.auditEvents.length?'\n':''))},
        {name:'health.json',bytes:Buffer.from(JSON.stringify(diagnostics.health)+'\n')},
        {name:'requests.json',bytes:Buffer.from(JSON.stringify(diagnostics.requests)+'\n')}]);
      recordCount=data.records.length;
      await this.storage.putPrivateObject({storageKey,body:Readable.from(bytes),contentType:'application/zip',contentLength:bytes.length});
    } catch(error) {failure=error instanceof Error && /^RUNTIME_(LOG|ARCHIVE)_[A-Z_]+$/u.test(error.message)?error.message:'RUNTIME_ARCHIVE_GENERATION_FAILED';}
    const committed=await this.prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${job.organization_id}::uuid FOR NO KEY UPDATE`;
      const at=this.clock.now();
      if(!permitsSystemMode((await tx.systemPolicy.findUnique({where:{organizationId:job.organization_id}}))?.systemMode, 'ADMIN'))return false;
      if(!await this.allowed(tx,job))failure='PERMISSION_REVOKED';
      const rows=await tx.$queryRaw<Job[]>`UPDATE v81_runtime_archives SET status=${failure?'FAILED':'SUCCEEDED'},version=version+1,updated_at=${at},failure_code=${failure},
        storage_key=${failure?null:storageKey},sha256=${failure||!bytes?null:createHash('sha256').update(bytes).digest('hex')},byte_length=${failure||!bytes?null:BigInt(bytes.length)},record_count=${failure?null:recordCount}
        WHERE id=${job.id}::uuid AND status='RUNNING' AND version=${job.version} AND lease_owner=${owner}::uuid AND lease_until>${at} AND expires_at>${at} RETURNING *`;
      if(!rows[0])return false;await archiveEvent(tx,rows[0],failure?'FAILED':'SUCCEEDED',null,at);return !failure;
    });
    if(!committed)try{await this.storage.deletePrivateObject(storageKey);}catch{this.logger.error('Private runtime archive cleanup requires retry.');}
    return job.id;
  }
}
