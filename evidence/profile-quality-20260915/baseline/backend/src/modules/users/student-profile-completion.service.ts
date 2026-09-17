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
      const details = this.normalizer.normalize({...input,studentNumber:profile.studentNumber,
        fullName:profile.fullName,gender:profile.gender,gradeYear:profile.gradeYear}, {preserveStoredStudentNumber:true});
      const now=this.clock.now();
      const changed = await tx.studentProfile.updateMany({where:{id:profile.id,version:input.expectedVersion},data:{
        collegeName:details.collegeName!,majorName:details.majorName!,dateOfBirth:new Date(`${details.dateOfBirth}T00:00:00Z`),
        regionCode:details.regionCode!,otherRegionName:details.otherRegionName ?? null,updatedAt:now,version:{increment:1}}});
      if (changed.count !== 1) throw new ApplicationError('CONFLICT_VERSION_MISMATCH',409);
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'STUDENT_PROFILE',${profile.id}::uuid,
          'PROFILE_COMPLETED',${principal.userId}::uuid,${facts.requestId},${input.expectedVersion+1},
          ${JSON.stringify({changedFields:['collegeName','majorName','dateOfBirth','regionCode','otherRegionName']})}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success({version:input.expectedVersion+1});
    });
  }
}
