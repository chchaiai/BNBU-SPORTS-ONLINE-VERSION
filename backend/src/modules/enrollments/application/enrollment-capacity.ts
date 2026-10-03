import { Prisma } from '../../../generated/prisma/client.js';

export async function readEnrollmentCapacities(db: Pick<Prisma.TransactionClient, '$queryRaw'>, organizationId: string, studentIds: string[]) {
  if (!studentIds.length) return new Map<string,{maximumActiveEnrollments:number;activeEnrollmentCount:number;enrollmentCapacitySemesterId:string|null}>();
  const rows=await db.$queryRaw<{id:string;maximumActiveEnrollments:number;activeEnrollmentCount:number;enrollmentCapacitySemesterId:string|null}[]>(Prisma.sql`
    SELECT s.id,coalesce(c.maximum_active,1) AS "maximumActiveEnrollments",term.id AS "enrollmentCapacitySemesterId",
      (SELECT count(*)::int FROM enrollments e WHERE e.student_id=s.id AND e.organization_id=s.organization_id AND e.semester_id=term.id AND e.status='ACTIVE') AS "activeEnrollmentCount"
    FROM student_profiles s LEFT JOIN semesters term ON term.organization_id=s.organization_id AND term.status='CURRENT'
    LEFT JOIN student_enrollment_capacities c ON c.student_id=s.id AND c.organization_id=s.organization_id AND c.semester_id=term.id
    WHERE s.organization_id=${organizationId}::uuid AND s.id IN (${Prisma.join(studentIds.map(id=>Prisma.sql`${id}::uuid`))})`);
  return new Map(rows.map(row=>[row.id,row]));
}

export async function readEnrollmentCapacity(
  db: Pick<Prisma.TransactionClient, '$queryRaw'>,
  organizationId: string,
  studentId: string,
  semesterId?: string,
): Promise<number> {
  const rows = semesterId
    ? await db.$queryRaw<{ maximum_active: number }[]>`SELECT maximum_active FROM student_enrollment_capacities
        WHERE organization_id=${organizationId}::uuid AND student_id=${studentId}::uuid AND semester_id=${semesterId}::uuid`
    : await db.$queryRaw<{ maximum_active: number }[]>`SELECT c.maximum_active FROM student_enrollment_capacities c
        JOIN semesters s ON s.id=c.semester_id AND s.organization_id=c.organization_id
        WHERE c.organization_id=${organizationId}::uuid AND c.student_id=${studentId}::uuid AND s.status='CURRENT'`;
  return rows[0]?.maximum_active === 2 ? 2 : 1;
}
