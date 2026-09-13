import {
  Body,
  Controller,
  Headers,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { Equals, IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { randomUUID } from 'node:crypto';
import { retireCourseMemberships } from './v81-retain-course-history.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { Clock } from '../../common/time/clock.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import type {
  AuthenticatedPrincipal,
  FoundationRequest,
} from '../../common/http/request-context.js';


interface CourseDeletionResult { id: string; deleted: boolean; deletedAt: string; version: number }

class DeleteCourseInput {
  @Equals(true) confirmCourseRetirement!: boolean;
  @IsInt() @Min(1) expectedVersion!: number;
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  confirmationCourseName!: string;
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;
}
@Injectable()
export class V81CourseDeletionService {
 constructor(private readonly idempotency:IdempotencyService,private readonly clock:Clock){}
 remove(p:AuthenticatedPrincipal,id:string,input:DeleteCourseInput,requestId:string,key?:string):Promise<CourseDeletionResult>{
  return this.idempotency.execute({organizationId:p.organizationId,principalId:p.userId,authSessionId:p.sessionId,
   operationId:'deleteV81Course',scope:id,request:input,requestId,key,transactionTimeoutMs:120000},async tx=>{
   await tx.$queryRaw`SELECT id FROM organizations WHERE id=${p.organizationId}::uuid FOR UPDATE`;
   if((await tx.systemPolicy.findUnique({where:{organizationId:p.organizationId}}))?.systemMode!=='NORMAL')throw new ApplicationError('SYSTEM_MAINTENANCE',503);
   const section=await tx.classSection.findFirst({where:{id,organizationId:p.organizationId}});
   if(!section)throw new ApplicationError('COURSE_CLASS_SECTION_NOT_FOUND',404);
   const teacher=await tx.teacherProfile.findFirst({where:{id:section.teacherId,userId:p.userId,organizationId:p.organizationId}});
   if(!teacher||p.role!=='TEACHER')throw new ApplicationError('PERMISSION_COURSE_SCOPE_DENIED',403);
   if(section.version!==input.expectedVersion)throw new ApplicationError('CONFLICT_VERSION_MISMATCH',409);
   if(section.displayName!==input.confirmationCourseName)throw new ApplicationError('VALIDATION_FAILED',422);
   const now=this.clock.now();
   if(section.retiredAt)throw new ApplicationError('CONFLICT_STATE_TRANSITION',409);
   const removedMemberships=await retireCourseMemberships(tx,p,id,now,requestId);
   await tx.classSection.update({where:{id},data:{status:'CLOSED',isEnrollmentOpen:false,
    closedAt:section.closedAt??now,closedBy:p.userId,closeReason:input.reason,retiredAt:now,
    updatedBy:p.userId,updatedAt:now,version:{increment:1}}});
   await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
    VALUES(${randomUUID()}::uuid,${p.organizationId}::uuid,'CLASS_SECTION',${id}::uuid,'COURSE_RETIRED_HISTORY_RETAINED',${p.userId}::uuid,${requestId},${section.version+1},
    ${JSON.stringify({reason:input.reason,removedMemberships,studentAccounts:'RETAINED',studentHistory:'RETAINED',media:'RETAINED'})}::jsonb,${now},'SUCCEEDED')`;
   return this.idempotency.success({id,deleted:true,deletedAt:now.toISOString(),version:section.version+1});
  });
 }
}
@Controller('class-sections')
export class V81CourseDeletionController {
 constructor(private readonly service:V81CourseDeletionService){}
 @Post(':id/delete')
 @OperationPolicy('deleteV81Course')
 remove(@CurrentPrincipal() p:AuthenticatedPrincipal,
 @Param('id',new ParseUUIDPipe({exceptionFactory:():ApplicationError=>new ApplicationError('VALIDATION_FAILED',422)})) id:string,
 @Body() input:DeleteCourseInput,@Headers('idempotency-key') key:string|undefined,@Req() req:FoundationRequest):Promise<CourseDeletionResult>{
  return this.service.remove(p,id,input,req.requestId,key);
 }
}
