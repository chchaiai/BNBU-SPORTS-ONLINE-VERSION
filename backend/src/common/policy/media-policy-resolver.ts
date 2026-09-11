import type { AuthenticatedPrincipal } from '../http/request-context.js';

export interface MediaPolicyContext {
  mediaId: string;
  organizationId: string;
  ownerStudentId: string;
  ownerUserId: string;
  sessionId: string | null;
  enrollmentId: string | null;
  classSectionId: string;
  teacherUserId: string;
  uploadStatus: string;
}

export interface MediaUploadPolicyContext extends MediaPolicyContext {
  uploadSessionId: string;
  uploadSessionStatus: string;
}

export abstract class MediaPolicyResolver {
  abstract resolveMedia(
    principal: AuthenticatedPrincipal,
    mediaId: string,
  ): Promise<MediaPolicyContext>;

  abstract resolveUpload(
    principal: AuthenticatedPrincipal,
    uploadSessionId: string,
  ): Promise<MediaUploadPolicyContext>;
}
