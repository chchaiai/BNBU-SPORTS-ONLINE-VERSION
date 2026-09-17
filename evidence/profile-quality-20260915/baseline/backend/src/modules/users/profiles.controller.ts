import { Body, Controller, Get, Headers, Param, Patch, Query } from '@nestjs/common';

import type { PagedResult } from '../../common/http/envelope.interceptor.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import type { StudentProfileProjection, TeacherProfileProjection } from './users.service.js';
import { UsersService } from './users.service.js';
import {
  ProfilePathDto,
  StudentListQueryDto,
  TeacherPathDto,
  UpdateStudentRequestDto,
} from './users.dto.js';

@Controller()
export class ProfilesController {
  constructor(private readonly users: UsersService) {}

  @Get('students')
  @OperationPolicy('listStudents')
  listStudents(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: StudentListQueryDto,
  ): Promise<PagedResult<StudentProfileProjection>> {
    return this.users.listStudents(principal, query);
  }

  @Get('students/:studentId')
  @OperationPolicy('getStudent')
  getStudent(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: ProfilePathDto,
  ): Promise<StudentProfileProjection> {
    return this.users.getStudent(principal, path.studentId);
  }

  @Patch('students/:studentId')
  @OperationPolicy('updateStudent')
  updateStudent(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: ProfilePathDto,
    @Body() body: UpdateStudentRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<never> {
    void body;
    void idempotencyKey;
    return this.users.denyStudentUpdate(principal, path.studentId);
  }

  @Get('teachers/:teacherId')
  @OperationPolicy('getTeacher')
  getTeacher(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: TeacherPathDto,
  ): Promise<TeacherProfileProjection> {
    return this.users.getTeacher(principal, path.teacherId);
  }
}
