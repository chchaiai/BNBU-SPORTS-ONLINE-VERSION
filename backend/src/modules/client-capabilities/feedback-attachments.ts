import { Body, Controller, Get, Inject, Injectable, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsInt, IsString, Length, Max, Min } from 'class-validator';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { MEDIA_STORAGE_PORT, MediaStoragePort } from '../../common/object-storage/media-storage.port.js';
import { RUNTIME_CONFIG } from '../../common/config/runtime-config.module.js';
import type { RuntimeConfig } from '../../common/config/environment.js';
import { scannedMediaStream } from '../media/application/clamav-stream.js';
import { requireAdminAccess } from '../v8/v81-admin-access.js';
import { randomUUID } from 'node:crypto';

const types: Record<string, string> = { jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',
  mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm',pdf:'application/pdf',
  docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip:'application/zip',txt:'text/plain',csv:'text/csv' };
export class FeedbackUploadInput {
  @IsString() @Length(1,180) fileName!: string;
  @IsInt() @Min(1) @Max(50*1024*1024) size!: number;
}
type Attachment = { id:string; organization_id:string; owner_id:string; feedback_id:string|null;
  file_name:string; mime_type:string; size:number; upload_key:string; storage_key:string|null; created_at:Date };
const project = (row:Attachment) => ({id:row.id,fileName:row.file_name,mimeType:row.mime_type,size:row.size});

@Injectable()
export class FeedbackAttachmentsService {
  constructor(private readonly prisma:PrismaService,
    @Inject(MEDIA_STORAGE_PORT) private readonly storage:MediaStoragePort,
    @Inject(RUNTIME_CONFIG) private readonly config:RuntimeConfig) {}

  async prepare(principal:AuthenticatedPrincipal,input:FeedbackUploadInput) {
    const name=input.fileName.trim();
    const mime=types[name.split('.').pop()?.toLowerCase()??''];
    if(!mime || /[\x00-\x1f\x7f/\\]/u.test(name)) throw new ApplicationError('MEDIA_TYPE_NOT_ALLOWED',415);
    const limit=mime.startsWith('video/')?50:mime.startsWith('image/')?10:20;
    if(input.size>limit*1024*1024) throw new ApplicationError('MEDIA_SIZE_EXCEEDED',413);
    const id=randomUUID(),key=`media/${principal.organizationId}/${id}/document`;
    await this.prisma.$transaction(async tx=>{
      // Serialize per owner so parallel uploads cannot bypass the daily quota.
      await tx.$queryRaw`SELECT id FROM users WHERE id=${principal.userId}::uuid FOR NO KEY UPDATE`;
      const [usage]=await tx.$queryRaw<{count:number}[]>`SELECT count(*)::int AS count FROM feedback_attachments
        WHERE organization_id=${principal.organizationId}::uuid AND owner_id=${principal.userId}::uuid AND created_at>now()-interval '1 day'`;
      if(usage!.count>=40) throw new ApplicationError('AUTH_RATE_LIMITED',429);
      await tx.$executeRaw`INSERT INTO feedback_attachments(id,organization_id,owner_id,file_name,mime_type,size,upload_key)
        VALUES(${id}::uuid,${principal.organizationId}::uuid,${principal.userId}::uuid,${name},${mime},${input.size},${key})`;
    });
    return {id,...await this.storage.createUploadUrl({storageKey:key,contentType:mime,contentLength:input.size,expiresInSeconds:900})};
  }

  async confirm(principal:AuthenticatedPrincipal,id:string) {
    const row=await this.owned(principal,id);
    if(row.storage_key) return project(row);
    if(Date.now()-row.created_at.getTime()>3600_000) throw new ApplicationError('CONFLICT_STATE_TRANSITION',409);
    // Copy first to a server-only key: a still-valid PUT URL must never change an accepted attachment.
    const key=`media/${principal.organizationId}/${randomUUID()}/document`;
    await this.storage.copyPrivateObject(row.upload_key,key);
    let stream=await this.storage.getPrivateObject(key);
    const config=this.config.media;
    if(config?.scannerMode==='EXTERNAL_REQUIRED') stream=scannedMediaStream(stream,config.scannerHost,config.scannerPort);
    let size=0,prefix=Buffer.alloc(0),tail=Buffer.alloc(0);
    try {
      for await(const chunk of stream){
        const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk as Uint8Array);size+=bytes.length;
        if(size>row.size) throw new ApplicationError('MEDIA_SIZE_EXCEEDED',413);
        if(prefix.length<512) prefix=Buffer.concat([prefix,bytes.subarray(0,512-prefix.length)]);
        const scan=Buffer.concat([tail,bytes]);
        if(scan.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')) throw new ApplicationError('MEDIA_INTEGRITY_MISMATCH',422);
        tail=Buffer.from(scan.subarray(Math.max(0,scan.length-64)));
      }
    } finally { stream.destroy(); }
    const mime=row.mime_type;
    const valid = mime==='image/jpeg'?prefix.subarray(0,3).equals(Buffer.from([255,216,255])):
      mime==='image/png'?prefix.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
      mime==='image/webp'?prefix.toString('ascii',0,4)==='RIFF'&&prefix.toString('ascii',8,12)==='WEBP':
      mime==='video/webm'?prefix.subarray(0,4).equals(Buffer.from([26,69,223,163])):
      mime.startsWith('video/')?prefix.toString('ascii',4,8)==='ftyp':
      mime==='application/pdf'?prefix.toString('ascii',0,5)==='%PDF-':
      mime.startsWith('text/')?!prefix.includes(0):prefix.subarray(0,4).equals(Buffer.from([80,75,3,4]));
    if(size!==row.size||!valid) throw new ApplicationError('MEDIA_INTEGRITY_MISMATCH',422);
    await this.prisma.$executeRaw`UPDATE feedback_attachments SET storage_key=${key}
      WHERE id=${id}::uuid AND storage_key IS NULL`;
    return project(row);
  }

  async bind(tx:Prisma.TransactionClient,principal:AuthenticatedPrincipal,id:string,ids:string[]) {
    if(!ids.length)return;
    const count=await tx.$executeRaw`UPDATE feedback_attachments SET feedback_id=${id}::uuid
      WHERE id IN (${Prisma.join(ids.map(value=>Prisma.sql`${value}::uuid`))})
      AND organization_id=${principal.organizationId}::uuid AND owner_id=${principal.userId}::uuid
      AND feedback_id IS NULL AND storage_key IS NOT NULL AND created_at>now()-interval '1 day'`;
    if(count!==ids.length) throw new ApplicationError('CONFLICT_STATE_TRANSITION',409);
  }

  async list(principal:AuthenticatedPrincipal,id:string) {
    if(principal.role==='ADMIN') await requireAdminAccess(this.prisma,principal,'STUDENT_FEEDBACK');
    const feedback=await this.prisma.feedback.findFirst({where:{id,organizationId:principal.organizationId,
      ...(principal.role==='ADMIN'?{}:{createdByUserId:principal.userId})}});
    if(!feedback) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND',404);
    const rows=await this.prisma.$queryRaw<Attachment[]>`SELECT * FROM feedback_attachments
      WHERE feedback_id=${id}::uuid AND organization_id=${principal.organizationId}::uuid ORDER BY created_at,id`;
    return {items:rows.map(project)};
  }

  async access(principal:AuthenticatedPrincipal,id:string) {
    const [row]=await this.prisma.$queryRaw<Attachment[]>`SELECT * FROM feedback_attachments
      WHERE id=${id}::uuid AND organization_id=${principal.organizationId}::uuid`;
    if(!row?.storage_key) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND',404);
    if(row.feedback_id) await this.list(principal,row.feedback_id);
    else if(row.owner_id!==principal.userId) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND',404);
    return {url:await this.storage.createAccessUrl({storageKey:row.storage_key,
      contentType:row.mime_type.startsWith('image/')||row.mime_type.startsWith('video/')?row.mime_type:'application/octet-stream',
      ...(row.mime_type.startsWith('image/')||row.mime_type.startsWith('video/')?{}:{downloadName:row.file_name}),
      expiresInSeconds:300}),expiresInSeconds:300};
  }
  private async owned(principal:AuthenticatedPrincipal,id:string){
    const [row]=await this.prisma.$queryRaw<Attachment[]>`SELECT * FROM feedback_attachments
      WHERE id=${id}::uuid AND organization_id=${principal.organizationId}::uuid AND owner_id=${principal.userId}::uuid`;
    if(!row) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND',404);return row;
  }
}
const uuid=new ParseUUIDPipe({exceptionFactory:()=>new ApplicationError('VALIDATION_FAILED',422)});
@Controller()
export class FeedbackAttachmentsController {
  constructor(private readonly service:FeedbackAttachmentsService){}
  @Post('feedback-attachments') @OperationPolicy('createFeedbackAttachment')
  prepare(@CurrentPrincipal() p:AuthenticatedPrincipal,@Body() body:FeedbackUploadInput){return this.service.prepare(p,body);}
  @Post('feedback-attachments/:attachmentId/confirm') @OperationPolicy('confirmFeedbackAttachment')
  confirm(@CurrentPrincipal() p:AuthenticatedPrincipal,@Param('attachmentId',uuid) id:string){return this.service.confirm(p,id);}
  @Post('feedback-attachments/:attachmentId/access') @OperationPolicy('accessFeedbackAttachment')
  access(@CurrentPrincipal() p:AuthenticatedPrincipal,@Param('attachmentId',uuid) id:string){return this.service.access(p,id);}
  @Get('feedback/:feedbackId/attachments') @OperationPolicy('listFeedbackAttachments')
  list(@CurrentPrincipal() p:AuthenticatedPrincipal,@Param('feedbackId',uuid) id:string){return this.service.list(p,id);}
}
