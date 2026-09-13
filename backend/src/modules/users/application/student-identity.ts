export const STUDENT_GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
export type StudentGender = (typeof STUDENT_GENDERS)[number];

export interface StudentIdentityInput {
  collegeName?: string;
  majorName?: string;
  dateOfBirth?: string;
  regionCode?: string;
  otherRegionName?: string;
  fullName: string;
  studentNumber: string;
  gender: string;
  gradeYear: number;
}

export interface NormalizedStudentIdentity {
  collegeName?: string;
  majorName?: string;
  dateOfBirth?: string;
  regionCode?: string;
  otherRegionName?: string;
  authenticatedUserId?: string;
  fullName: string;
  studentNumber: string;
  gender: StudentGender;
  gradeYear: number;
}

export interface ResolvedStudentIdentity {
  created: boolean;
  user: {
    id: string;
    organizationId: string;
    role: string;
    status: string;
    primaryEmail: string | null;
    emailVerifiedAt: Date | null;
    tokenVersion: number;
    version: number;
  };
  profile: {
    id: string;
    organizationId: string;
    userId: string;
    studentNumber: string;
    fullName: string;
    gender: string;
    gradeYear: number;
    collegeName: string | null;
    majorName: string | null;
    dateOfBirth?: Date | null;
    regionCode?: string | null;
    otherRegionName?: string | null;
    administrativeClassName: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    version: number;
  };
}
