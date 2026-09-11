import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';

export interface SemesterProjection {
  id: string;
  organizationId: string;
  academicYear: string;
  termCode: string;
  displayName: string;
  startDate: string;
  endDate: string;
  status: string;
  isCurrent: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

@Injectable()
export class SemestersService {
  constructor(private readonly prisma: PrismaService) {}

  async forTeacher(principal:AuthenticatedPrincipal,query:{after?:string;limit:number}) {
    if(principal.role!=='TEACHER')throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED',403);
    const rows=await this.prisma.semester.findMany({where:{organizationId:principal.organizationId,
      classSections:{some:{organizationId:principal.organizationId,teacher:{userId:principal.userId}}},
      ...(query.after?{id:{gt:query.after}}:{})},orderBy:{id:'asc'},take:query.limit+1});
    const items=rows.slice(0,query.limit).map(row=>({id:row.id,academicYear:row.academicYear,termCode:row.termCode,
      displayName:row.displayName,status:row.status,startDate:dateOnly(row.startDate),endDate:dateOnly(row.endDate),version:row.version}));
    return {items,nextCursor:rows.length>query.limit?items.at(-1)!.id:null};
  }

  async current(organizationId: string): Promise<SemesterProjection> {
    const semester = await this.prisma.semester.findFirst({
      where: { organizationId, status: 'CURRENT' },
    });
    if (semester === null) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    return {
      id: semester.id,
      organizationId: semester.organizationId,
      academicYear: semester.academicYear,
      termCode: semester.termCode,
      displayName: semester.displayName,
      startDate: dateOnly(semester.startDate),
      endDate: dateOnly(semester.endDate),
      status: semester.status,
      isCurrent: true,
      createdBy: semester.createdBy,
      createdAt: semester.createdAt.toISOString(),
      updatedAt: semester.updatedAt.toISOString(),
      version: semester.version,
    };
  }
}
