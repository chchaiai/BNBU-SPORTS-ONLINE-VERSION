import { Controller, Get, Query } from '@nestjs/common';
import {Type} from 'class-transformer';
import {IsInt,IsOptional,IsUUID,Min,Max} from 'class-validator';

import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { SemestersService, type SemesterProjection } from './semesters.service.js';

@Controller('semesters')
export class SemestersController {
  constructor(private readonly semesters: SemestersService) {}

  @Get('current')
  @OperationPolicy('getCurrentSemester')
  current(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<SemesterProjection> {
    return this.semesters.current(principal.organizationId);
  }
}

class TeacherSemesterQuery {
  @IsOptional() @IsUUID() after?:string;
  @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
}
@Controller('teacher/semesters')
export class TeacherSemestersController {
  constructor(private readonly semesters:SemestersService){}
  @Get() @OperationPolicy('listV81TeacherSemesters')
  list(@CurrentPrincipal() principal:AuthenticatedPrincipal,@Query() query:TeacherSemesterQuery){return this.semesters.forTeacher(principal,query);}
}
