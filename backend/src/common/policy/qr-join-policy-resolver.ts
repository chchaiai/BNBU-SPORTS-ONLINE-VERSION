export interface CourseInvitePolicyContext {
  inviteId: string;
  organizationId: string;
  classSectionId: string;
  status: string;
  expiresAt: Date;
  classSection: {
    id: string;
    organizationId: string;
    courseId: string;
    semesterId: string;
    teacherId: string;
    displayName: string;
    status: string;
    isEnrollmentOpen: boolean;
    course: {
      courseCode: string;
      courseName: string;
      status: string;
      deletedAt: Date | null;
    };
    semester: {
      displayName: string;
      status: string;
      endDate: Date;
    };
    teacher: {
      fullName: string;
      status: string;
      deletedAt: Date | null;
    };
  };
}

export interface JoinCapabilityPolicyContext {
  capabilityId: string;
  organizationId: string;
  courseInviteId: string;
  classSectionId: string;
  identityFingerprint: string;
  status: string;
  expiresAt: Date;
  resultReplayExpiresAt: Date | null;
  invite: CourseInvitePolicyContext;
}

export abstract class QrJoinPolicyResolver {
  abstract resolveInvite(input: {
    inviteToken: string;
    sourceIp: string | undefined;
    operationId: 'previewCourseInvite' | 'issueJoinCapability';
  }): Promise<CourseInvitePolicyContext>;

  abstract resolveCapability(input: {
    inviteToken: string;
    joinCapability: string;
    sourceIp: string | undefined;
  }): Promise<JoinCapabilityPolicyContext>;
}
