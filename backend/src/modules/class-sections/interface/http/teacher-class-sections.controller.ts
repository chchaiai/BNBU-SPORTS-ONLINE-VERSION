import { Controller, Get, Param, Query } from '@nestjs/common';

import type { PagedResult } from '../../../../common/http/envelope.interceptor.js';
import type { AuthenticatedPrincipal } from '../../../../common/http/request-context.js';
import { OperationPolicy } from '../../../../common/policy/operation-policy.decorator.js';
import { CurrentPrincipal } from '../../../../common/policy/principal.decorator.js';
import type { ClassSectionProjection } from '../../application/class-section-projection.js';
import { ClassSectionsService } from '../../application/class-sections.service.js';
import {
  TeacherClassSectionListQueryDto,
  TeacherClassSectionPathParameters,
} from './class-sections.dto.js';

@Controller('teachers')
export class TeacherClassSectionsController {
  constructor(private readonly classSections: ClassSectionsService) {}

  @Get(':teacherId/class-sections')
  @OperationPolicy('listTeacherClassSections')
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() parameters: TeacherClassSectionPathParameters,
    @Query() query: TeacherClassSectionListQueryDto,
  ): Promise<PagedResult<ClassSectionProjection>> {
    return this.classSections.listForTeacher(principal, parameters.teacherId, query);
  }
}
