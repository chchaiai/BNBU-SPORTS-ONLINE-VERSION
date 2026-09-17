import { inspectProfile, readProfileQualities } from './application/student-profile-quality.js';
import { canChangeAcademicDetails, isConfirmedMajor, validAcademicDetails } from './application/student-academics.js';
import { requireAdminAccess } from '../v8/v81-admin-access.js';
import type { UpdateStudentRequestDto } from './users.dto.js';
import { Injectable } from '@nestjs/common';
import { ApplicationError } from '../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import { StudentIdentityNormalizer } from './application/student-identity-normalizer.js';
import type { CompleteStudentProfileDto } from './users.dto.js';

@Injectable()
export class StudentProfileCompletionService {
  constructor(private readonly idempotency: IdempotencyService, private readonly normalizer: StudentIdentityNormalizer,
    private readonly clock: Clock, private readonly ids: IdGenerator) {}

  async complete(principal: AuthenticatedPrincipal, input: CompleteStudentProfileDto,
    facts: { requestId: string; idempotencyKey: string | undefined }) {
    if (principal.role !== 'STUDENT') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    return this.idempotency.execute({ organizationId: principal.organizationId, principalId: principal.userId,
      authSessionId: principal.sessionId, operationId: 'completeCurrentStudentProfile', scope: principal.userId,
      key: facts.idempotencyKey, request: input, requestId: facts.requestId }, async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
      const policy=await tx.systemPolicy.findUnique({where:{organizationId:principal.organizationId}});
      if(policy?.systemMode!=='NORMAL')throw new ApplicationError('SYSTEM_MAINTENANCE',503);
      const profile = await tx.studentProfile.findFirst({where:{userId:principal.userId,
        organizationId:principal.organizationId,deletedAt:null}});
      if (!profile) throw new ApplicationError('USER_NOT_FOUND',404);
      if (profile.version !== input.expectedVersion) throw new ApplicationError('CONFLICT_VERSION_MISMATCH',409);
      const details = this.normalizer.normalize({...input,studentNumber:input.studentNumber ?? profile.studentNumber,
        fullName:input.fullName ?? profile.fullName,gender:input.gender ?? profile.gender,gradeYear:input.gradeYear ?? profile.gradeYear});
      const quality=inspectProfile({...profile,...details},true);
      if(quality.profileQualityStatus==='REQUIRES_PROFILE_UPDATE') throw new ApplicationError('USER_PROFILE_INVALID',422, {fieldErrors:quality.profileQualityReasons.map(field=>({field,code:'INVALID',i18nKey:'error.user.profileInvalid',params:{}}))});
      const duplicate=await tx.studentProfile.findFirst({where:{organizationId:principal.organizationId,studentNumber:details.studentNumber,id:{not:profile.id}}});
      if(duplicate) throw new ApplicationError('USER_IDENTITY_CONFLICT',409);
      const beforeQuality=(await readProfileQualities(tx,[profile])).get(profile.id)!;
      if (!canChangeAcademicDetails(profile,{collegeName:details.collegeName!,majorName:details.majorName!},!!beforeQuality.majorConfirmationLocked)) {
        throw new ApplicationError('USER_PROFILE_INVALID',422,{reason:'MAJOR_CONFIRMATION_LOCKED',fieldErrors:[{field:'majorName',code:'MAJOR_CONFIRMATION_LOCKED',i18nKey:'error.user.profileInvalid',params:{}}]});
      }
      const now=this.clock.now();
      const changed = await tx.studentProfile.updateMany({where:{id:profile.id,version:input.expectedVersion},data:{
        studentNumber:details.studentNumber,fullName:details.fullName,gender:details.gender,gradeYear:details.gradeYear,
        collegeName:details.collegeName!,majorName:details.majorName!,dateOfBirth:new Date(`${details.dateOfBirth}T00:00:00Z`),
        regionCode:details.regionCode!,otherRegionName:details.otherRegionName ?? null,updatedAt:now,version:{increment:1}}});
      if (changed.count !== 1) throw new ApplicationError('CONFLICT_VERSION_MISMATCH',409);
      if (isConfirmedMajor(details.collegeName!,details.majorName!) && !beforeQuality.majorConfirmationLocked) {
        await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
          VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'STUDENT_MAJOR',${profile.id}::uuid,
            'MAJOR_CONFIRMED',${principal.userId}::uuid,${facts.requestId},${input.expectedVersion+1},
            ${JSON.stringify({locked:true,before:{collegeName:profile.collegeName,majorName:profile.majorName},after:{collegeName:details.collegeName,majorName:details.majorName}})}::jsonb,${now},'SUCCEEDED')`;
      }
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'STUDENT_PROFILE',${profile.id}::uuid,
          'PROFILE_QUALITY_CONFIRMED',${principal.userId}::uuid,${facts.requestId},${input.expectedVersion+1},
          ${JSON.stringify({before:Object.fromEntries(Object.keys(details).map(key=>[key,profile[key as keyof typeof profile]])),after:details,reasons:beforeQuality.profileQualityReasons})}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success({version:input.expectedVersion+1});
    });
  }
  async requireUpdate(principal: AuthenticatedPrincipal, studentId: string, input: UpdateStudentRequestDto,
    facts: {requestId:string;idempotencyKey:string|undefined}) {
    if(principal.role!=='ADMIN') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED',403);
    if (input.majorCorrectionReason !== undefined) return this.correctMajor(principal,studentId,input,facts);
    if(!input.profileUpdateReason || Object.entries(input).some(([key,value])=>value!==undefined && !['profileUpdateReason','expectedVersion'].includes(key))) throw new ApplicationError('VALIDATION_FAILED',422);
    return this.idempotency.execute({organizationId:principal.organizationId,principalId:principal.userId,authSessionId:principal.sessionId,
      operationId:'updateStudent',scope:studentId,key:facts.idempotencyKey,request:input,requestId:facts.requestId},async tx=>{
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
      await requireAdminAccess(tx,principal,'USER_ACCOUNTS');
      const policy=await tx.systemPolicy.findUnique({where:{organizationId:principal.organizationId}});
      if(policy?.systemMode!=='NORMAL') throw new ApplicationError('SYSTEM_MAINTENANCE',503);
      const profile=await tx.studentProfile.findFirst({where:{id:studentId,organizationId:principal.organizationId,deletedAt:null}});
      if(!profile) throw new ApplicationError('USER_NOT_FOUND',404);
      if(profile.version!==input.expectedVersion) throw new ApplicationError('CONFLICT_VERSION_MISMATCH',409);
      const now=this.clock.now();
      const result=await tx.studentProfile.updateMany({where:{id:studentId,version:input.expectedVersion},data:{version:{increment:1},updatedAt:now}});
      if(result.count!==1) throw new ApplicationError('CONFLICT_VERSION_MISMATCH',409);
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'STUDENT_PROFILE',${studentId}::uuid,'PROFILE_UPDATE_REQUIRED',
          ${principal.userId}::uuid,${facts.requestId},${input.expectedVersion+1},${JSON.stringify({reason:input.profileUpdateReason})}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success({version:input.expectedVersion+1});
    });
  }

  private async correctMajor(principal:AuthenticatedPrincipal,studentId:string,input:UpdateStudentRequestDto,
    facts:{requestId:string;idempotencyKey:string|undefined}) {
    if (!input.majorCorrectionReason?.trim() || !input.collegeName || !input.majorName ||
      Object.entries(input).some(([key,value])=>value!==undefined && !['majorCorrectionReason','collegeName','majorName','expectedVersion'].includes(key)))
      throw new ApplicationError('VALIDATION_FAILED',422);
    return this.idempotency.execute({organizationId:principal.organizationId,principalId:principal.userId,authSessionId:principal.sessionId,
      operationId:'updateStudent',scope:studentId,key:facts.idempotencyKey,request:input,requestId:facts.requestId},async tx=>{
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
      await requireAdminAccess(tx,principal,'USER_ACCOUNTS');
      if((await tx.systemPolicy.findUnique({where:{organizationId:principal.organizationId}}))?.systemMode!=='NORMAL') throw new ApplicationError('SYSTEM_MAINTENANCE',503);
      const profile=await tx.studentProfile.findFirst({where:{id:studentId,organizationId:principal.organizationId,deletedAt:null}});
      if(!profile)throw new ApplicationError('USER_NOT_FOUND',404);
      if(profile.version!==input.expectedVersion)throw new ApplicationError('CONFLICT_VERSION_MISMATCH',409);
      // Validate only the academic correction; historical unrelated identity fields may require later remediation.
      if(!validAcademicDetails(input.collegeName!,input.majorName!))throw new ApplicationError('USER_PROFILE_INVALID',422);
      const quality=(await readProfileQualities(tx,[profile])).get(profile.id)!;
      const locked=!!quality.majorConfirmationLocked || isConfirmedMajor(input.collegeName!,input.majorName!);
      const now=this.clock.now();
      const changed=await tx.studentProfile.updateMany({where:{id:studentId,version:input.expectedVersion},data:{collegeName:input.collegeName!,majorName:input.majorName!,version:{increment:1},updatedAt:now}});
      if(changed.count!==1)throw new ApplicationError('CONFLICT_VERSION_MISMATCH',409);
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'STUDENT_MAJOR',${studentId}::uuid,'MAJOR_CORRECTED',
          ${principal.userId}::uuid,${facts.requestId},${input.expectedVersion+1},${JSON.stringify({locked,reason:input.majorCorrectionReason,
            before:{collegeName:profile.collegeName,majorName:profile.majorName},after:{collegeName:input.collegeName,majorName:input.majorName}})}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success({version:input.expectedVersion+1});
    });
  }

}
