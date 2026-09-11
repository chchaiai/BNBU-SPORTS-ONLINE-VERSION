import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/database/prisma.service.js';
import type { CourseInvitePolicyContext } from '../../../common/policy/qr-join-policy-resolver.js';
import {
  Prisma,
  type JoinCapability,
  type PrismaClient,
} from '../../../generated/prisma/client.js';
import type { JoinCapabilityStatus } from '../domain/join-capability-status.js';
import type { JoinCapabilityState } from '../domain/join-capability.js';
import {
  JoinCapabilityRepository,
  type JoinCapabilityPolicyRecord,
} from '../domain/join-capability.repository.js';

const policyInclude = {
  courseInvite: {
    include: {
      classSection: {
        include: { course: true, semester: true, teacher: true },
      },
    },
  },
} satisfies Prisma.JoinCapabilityInclude;

type PolicyRow = Prisma.JoinCapabilityGetPayload<{ include: typeof policyInclude }>;
type CapabilityClient =
  Pick<PrismaClient, 'joinCapability' | '$queryRaw'> | Prisma.TransactionClient;

@Injectable()
export class PrismaJoinCapabilityRepository extends JoinCapabilityRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(state: JoinCapabilityState, transaction: object): Promise<JoinCapabilityState> {
    return this.map(await this.client(transaction).joinCapability.create({ data: state }));
  }

  async findById(capabilityId: string, transaction?: object): Promise<JoinCapabilityState | null> {
    const row = await this.client(transaction).joinCapability.findUnique({
      where: { id: capabilityId },
    });
    return row === null ? null : this.map(row);
  }

  async lockById(capabilityId: string, transaction: object): Promise<JoinCapabilityState | null> {
    const client = this.client(transaction);
    await client.$queryRaw<{ id: string }[]>`
      SELECT id FROM join_capabilities WHERE id = ${capabilityId}::uuid FOR UPDATE
    `;
    return this.findById(capabilityId, transaction);
  }

  async consume(
    state: JoinCapabilityState,
    expectedVersion: number,
    transaction: object,
  ): Promise<boolean> {
    const changed = await this.client(transaction).joinCapability.updateMany({
      where: { id: state.id, organizationId: state.organizationId, version: expectedVersion },
      data: {
        status: state.status,
        consumedAt: state.consumedAt,
        consumedByUserId: state.consumedByUserId,
        enrollmentId: state.enrollmentId,
        authSessionId: state.authSessionId,
        resultCiphertext: state.resultCiphertext,
        resultKeyVersion: state.resultKeyVersion,
        resultReplayExpiresAt: state.resultReplayExpiresAt,
        consumedRequestId: state.consumedRequestId,
        consumedIdempotencyKeyHash: state.consumedIdempotencyKeyHash,
        version: state.version,
        secretCiphertext: null,
        secretReplayExpiresAt: null,
      },
    });
    return changed.count === 1;
  }

  async findPolicyRecordById(capabilityId: string): Promise<JoinCapabilityPolicyRecord | null> {
    const row = await this.prisma.joinCapability.findUnique({
      where: { id: capabilityId },
      include: policyInclude,
    });
    if (row === null) return null;
    return {
      tokenHash: row.tokenHash,
      inviteTokenHash: row.courseInvite.tokenHash,
      context: {
        capabilityId: row.id,
        organizationId: row.organizationId,
        courseInviteId: row.courseInviteId,
        classSectionId: row.classSectionId,
        identityFingerprint: row.identityFingerprint,
        status: row.status,
        expiresAt: row.expiresAt,
        resultReplayExpiresAt: row.resultReplayExpiresAt,
        invite: this.inviteContext(row),
      },
    };
  }

  private inviteContext(row: PolicyRow): CourseInvitePolicyContext {
    const invite = row.courseInvite;
    const section = invite.classSection;
    return {
      inviteId: invite.id,
      organizationId: invite.organizationId,
      classSectionId: invite.classSectionId,
      status: invite.status,
      expiresAt: invite.expiresAt,
      classSection: {
        id: section.id,
        organizationId: section.organizationId,
        courseId: section.courseId,
        semesterId: section.semesterId,
        teacherId: section.teacherId,
        displayName: section.displayName,
        status: section.status,
        isEnrollmentOpen: section.isEnrollmentOpen,
        course: {
          courseCode: section.course.courseCode,
          courseName: section.course.courseName,
          status: section.course.status,
          deletedAt: section.course.deletedAt,
        },
        semester: {
          displayName: section.semester.displayName,
          status: section.semester.status,
          endDate: section.semester.endDate,
        },
        teacher: {
          fullName: section.teacher.fullName,
          status: section.teacher.status,
          deletedAt: section.teacher.deletedAt,
        },
      },
    };
  }

  private map(row: JoinCapability): JoinCapabilityState {
    return { ...row, status: row.status as JoinCapabilityStatus };
  }

  private client(transaction?: object): CapabilityClient {
    return (transaction ?? this.prisma) as CapabilityClient;
  }
}
