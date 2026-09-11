import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/database/prisma.service.js';
import { ApplicationError } from '../../../common/errors/application-error.js';
import { IdGenerator } from '../../../common/time/id-generator.js';
import type { Prisma, PrismaClient } from '../../../generated/prisma/client.js';
import type { NormalizedStudentIdentity, ResolvedStudentIdentity } from './student-identity.js';

const existingIdentityInclude = { user: true } as const;
type IdentityClient = Pick<PrismaClient, 'studentProfile' | 'user'> | Prisma.TransactionClient;
type ExistingIdentityRow = Prisma.StudentProfileGetPayload<{
  include: typeof existingIdentityInclude;
}>;

@Injectable()
export class StudentIdentityResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {}

  async validateExisting(
    organizationId: string,
    identity: NormalizedStudentIdentity,
    transaction?: Prisma.TransactionClient,
  ): Promise<ResolvedStudentIdentity | null> {
    const row = await this.client(transaction).studentProfile.findUnique({
      where: {
        organizationId_studentNumber: {
          organizationId,
          studentNumber: identity.studentNumber,
        },
      },
      include: existingIdentityInclude,
    });
    if (row === null) return null;
    this.assertCompatible(row, identity);
    return { created: false, user: row.user, profile: row };
  }

  async resolveOrCreate(
    organizationId: string,
    identity: NormalizedStudentIdentity,
    now: Date,
    transaction: Prisma.TransactionClient,
  ): Promise<ResolvedStudentIdentity> {
    const existing = await this.validateExisting(organizationId, identity, transaction);
    if (existing !== null) return existing;

    const userId = this.ids.next();
    const profileId = this.ids.next();
    const user = await transaction.user.create({
      data: {
        id: userId,
        organizationId,
        role: 'STUDENT',
        status: 'PENDING_CONTACT_BINDING',
        primaryEmail: null,
        primaryEmailNormalized: null,
        passwordHash: null,
        createdAt: now,
        updatedAt: now,
      },
    });
    const profile = await transaction.studentProfile.create({
      data: {
        id: profileId,
        organizationId,
        userId,
        studentNumber: identity.studentNumber,
        fullName: identity.fullName,
        gender: identity.gender,
        gradeYear: identity.gradeYear,
        collegeName: null,
        majorName: null,
        administrativeClassName: null,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
    });
    return { created: true, user, profile };
  }

  private assertCompatible(row: ExistingIdentityRow, identity: NormalizedStudentIdentity): void {
    if (
      row.deletedAt !== null ||
      row.status !== 'ACTIVE' ||
      row.user.deletedAt !== null ||
      row.user.role !== 'STUDENT' ||
      !['PENDING_CONTACT_BINDING', 'ACTIVE'].includes(row.user.status) ||
      row.studentNumber.trim().toUpperCase() !== identity.studentNumber ||
      row.fullName.trim().normalize('NFC') !== identity.fullName ||
      row.gender !== identity.gender ||
      row.gradeYear !== identity.gradeYear
    ) {
      throw new ApplicationError('USER_IDENTITY_CONFLICT', 409);
    }
  }

  private client(transaction?: Prisma.TransactionClient): IdentityClient {
    return transaction ?? this.prisma;
  }
}
