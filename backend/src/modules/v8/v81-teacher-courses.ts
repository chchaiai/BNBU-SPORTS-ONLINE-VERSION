import {Body,Controller,Headers,Post,Req} from '@nestjs/common';
import {Transform} from 'class-transformer';
import {IsString,MaxLength,MinLength} from 'class-validator';
import {randomUUID} from 'node:crypto';
import {PrismaService} from '../../common/database/prisma.service.js';
import {IdempotencyService} from '../../common/idempotency/idempotency.service.js';
import {Clock} from '../../common/time/clock.js';
import {IdGenerator} from '../../common/time/id-generator.js';
import {ApplicationError} from '../../common/errors/application-error.js';
import {CurrentPrincipal} from '../../common/policy/principal.decorator.js';
import {OperationPolicy} from '../../common/policy/operation-policy.decorator.js';
import type {AuthenticatedPrincipal,FoundationRequest} from '../../common/http/request-context.js';
export class CreateTeacherCourseInput {
  @Transform(({value}:{value:unknown})=>typeof value==='string'?value.trim():value)
  @IsString() @MinLength(1) @MaxLength(200) displayName!:string;
}
@Controller('teacher/courses')
export class V81TeacherCoursesController {
  constructor(private readonly prisma:PrismaService,private readonly idempotency:IdempotencyService,private readonly clock:Clock,private readonly ids:IdGenerator){}
  @Post() @OperationPolicy('createV81TeacherCourse')
  create(@CurrentPrincipal() p:AuthenticatedPrincipal,@Body() input:CreateTeacherCourseInput,
    @Headers('idempotency-key') key:string|undefined,@Req() req:FoundationRequest){
    if(p.role!=='TEACHER')throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED',403);
    return this.idempotency.execute({organizationId:p.organizationId,principalId:p.userId,authSessionId:p.sessionId,
      operationId:'createV81TeacherCourse',scope:p.organizationId,key,request:input,requestId:req.requestId},async tx=>{
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${p.organizationId}::uuid FOR UPDATE`;
      if((await tx.systemPolicy.findUnique({where:{organizationId:p.organizationId}}))?.systemMode!=='NORMAL')throw new ApplicationError('SYSTEM_MAINTENANCE',503);
      const teacher=await tx.teacherProfile.findFirst({where:{organizationId:p.organizationId,userId:p.userId,status:'ACTIVE',deletedAt:null}});
      if(!teacher)throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED',403);
      const semester=await tx.semester.findFirst({where:{organizationId:p.organizationId,status:'CURRENT'}});
      if(!semester)throw new ApplicationError('CONFLICT_STATE_TRANSITION',409);
      const courseId=this.ids.next(),id=this.ids.next(),now=this.clock.now();
      await tx.course.create({data:{id:courseId,organizationId:p.organizationId,courseCode:'T'+courseId.replaceAll('-','').slice(0,30).toUpperCase(),
        courseName:input.displayName,status:'ACTIVE',createdBy:p.userId,updatedBy:p.userId,createdAt:now,updatedAt:now}});
      await tx.classSection.create({data:{id,organizationId:p.organizationId,courseId,semesterId:semester.id,teacherId:teacher.id,
        classCode:'T'+id.replaceAll('-',''),displayName:input.displayName,status:'ACTIVE',isEnrollmentOpen:false,checkInWindowMode:'UNAVAILABLE',
        createdBy:p.userId,updatedBy:p.userId,createdAt:now,updatedAt:now}});
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${randomUUID()}::uuid,${p.organizationId}::uuid,'CLASS_SECTION',${id}::uuid,'CREATED',${p.userId}::uuid,${req.requestId},1,
          ${JSON.stringify({courseId,semesterId:semester.id,teacherId:teacher.id})}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success({id,courseId,semesterId:semester.id,teacherId:teacher.id,displayName:input.displayName,version:1},
        {resourceType:'CLASS_SECTION',resourceId:id});
    });
  }
}
