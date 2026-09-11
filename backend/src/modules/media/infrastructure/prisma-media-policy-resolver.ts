import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/database/prisma.service.js';
import { ApplicationError } from '../../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../../common/http/request-context.js';
import {
  MediaPolicyResolver,
  type MediaPolicyContext,
  type MediaUploadPolicyContext,
} from '../../../common/policy/media-policy-resolver.js';

@Injectable()
export class PrismaMediaPolicyResolver extends MediaPolicyResolver {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async resolveMedia(
    principal: AuthenticatedPrincipal,
    mediaId: string,
  ): Promise<MediaPolicyContext> {
    const media = await this.prisma.mediaEvidence.findFirst({
      where: { id: mediaId, organizationId: principal.organizationId },
      include: {
        ownerStudent: { select: { userId: true } },
        session: {
          include: {
            classSection: { include: { teacher: { select: { userId: true } } } },
          },
        },
        exemptionEnrollment: {
          include: {
            classSection: { include: { teacher: { select: { userId: true } } } },
          },
        },
      },
    });
    if (media === null) throw new ApplicationError('MEDIA_OBJECT_NOT_FOUND', 404);
    const owner = principal.role === 'STUDENT' && media.ownerStudent.userId === principal.userId;
    const target = media.session?.classSection ?? media.exemptionEnrollment?.classSection;
    if (target === undefined) throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500);
    const teacher = principal.role === 'TEACHER' && target.teacher.userId === principal.userId;
    if (!owner && !teacher) throw new ApplicationError('MEDIA_OBJECT_NOT_FOUND', 404);
    return {
      mediaId: media.id,
      organizationId: media.organizationId,
      ownerStudentId: media.ownerStudentId,
      ownerUserId: media.ownerStudent.userId,
      sessionId: media.sessionId,
      enrollmentId: media.enrollmentId,
      classSectionId: target.id,
      teacherUserId: target.teacher.userId,
      uploadStatus: media.uploadStatus,
    };
  }

  async resolveUpload(
    principal: AuthenticatedPrincipal,
    uploadSessionId: string,
  ): Promise<MediaUploadPolicyContext> {
    const upload = await this.prisma.mediaUploadSession.findFirst({
      where: { id: uploadSessionId, organizationId: principal.organizationId },
      include: {
        media: {
          include: {
            ownerStudent: { select: { userId: true } },
            session: {
              include: {
                classSection: { include: { teacher: { select: { userId: true } } } },
              },
            },
            exemptionEnrollment: {
              include: {
                classSection: { include: { teacher: { select: { userId: true } } } },
              },
            },
          },
        },
      },
    });
    if (
      upload === null ||
      principal.role !== 'STUDENT' ||
      upload.media.ownerStudent.userId !== principal.userId
    ) {
      throw new ApplicationError('MEDIA_OBJECT_NOT_FOUND', 404);
    }
    const target =
      upload.media.session?.classSection ?? upload.media.exemptionEnrollment?.classSection;
    if (target === undefined) throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500);
    return {
      mediaId: upload.media.id,
      organizationId: upload.organizationId,
      ownerStudentId: upload.media.ownerStudentId,
      ownerUserId: upload.media.ownerStudent.userId,
      sessionId: upload.media.sessionId,
      enrollmentId: upload.media.enrollmentId,
      classSectionId: target.id,
      teacherUserId: target.teacher.userId,
      uploadStatus: upload.media.uploadStatus,
      uploadSessionId: upload.id,
      uploadSessionStatus: upload.status,
    };
  }
}
