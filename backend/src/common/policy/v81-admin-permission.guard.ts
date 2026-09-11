import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { ApplicationError } from '../errors/application-error.js';
import type { FoundationRequest } from '../http/request-context.js';
import { requireAdminAccess, type AdminPermission } from '../../modules/v8/v81-admin-access.js';

const operations: Record<string, AdminPermission | 'SUPER' | 'ANY'> = {
  getV81OcrService: 'SUPER',
  listV81OcrServiceRevisions: 'SUPER',
  saveV81OcrService: 'SUPER',
  createV81RuntimeArchive: 'AUDIT_QUERY',
  getV81RuntimeArchive: 'AUDIT_QUERY',
  cancelV81RuntimeArchive: 'AUDIT_QUERY',
  createV81RuntimeArchiveDownload: 'AUDIT_QUERY',
  downloadV81RuntimeArchive: 'AUDIT_QUERY',
  listV81AuditEvents: 'AUDIT_QUERY',
  getV81AuditEvent: 'AUDIT_QUERY',
  listV81RuleTemplates: 'SUPER',
  getV81RuleTemplate: 'SUPER',
  publishV81RuleTemplate: 'SUPER',
  createV81Semester: 'SEMESTER_MANAGE',
  listV81Semesters: 'SEMESTER_MANAGE',
  getV81SemesterSwitchCheck: 'SEMESTER_MANAGE',
  switchV81Semester: 'SEMESTER_MANAGE',
  getV81AdminRosterSummary: 'COURSE_VIEW',
  getV81AdminPhysicalSummary: 'COURSE_VIEW',
  getV81AdminSettlementSummary: 'COURSE_VIEW',
  getV81AdminCourseDirectory: 'COURSE_VIEW',
  updateV81Semester: 'SEMESTER_MANAGE',
  listV81EnduranceTables: 'GLOBAL_RULES',
  createV81EnduranceRule: 'GLOBAL_RULES',
  updateV81EnduranceRule: 'GLOBAL_RULES',
  deleteV81EnduranceRule: 'GLOBAL_RULES',
  listV81HelpArticles: 'HELP_CENTER',
  getV81HelpArticle: 'HELP_CENTER',
  createV81HelpArticle: 'HELP_CENTER',
  saveV81HelpArticle: 'HELP_CENTER',
  getV81FeedbackDetail: 'STUDENT_FEEDBACK',
  listV81Feedback: 'STUDENT_FEEDBACK',
  handleV81Feedback: 'STUDENT_FEEDBACK',
  listV81Subadmins: 'SUPER',
  requestV81SubadminIdentity: 'SUPER',
  verifyV81SubadminIdentity: 'SUPER',
    createV81VerifiedSubadmin: 'SUPER',
    updateV81VerifiedSubadmin: 'SUPER',
    deleteV81Subadmin: 'SUPER',
  setV81SubadminStatus: 'SUPER',
  setV81SubadminPermissions: 'SUPER',
  getCurrentUser: 'ANY',
  getCurrentOrganization: 'ANY',
  getCurrentSemester: 'ANY',
  getCurrentUserPreferences: 'ANY',
  updateCurrentUserPreferences: 'ANY',
  listNotifications: 'ANY',
  markNotificationRead: 'ANY',
  reportClientError: 'ANY',
  requestCurrentUserEmailChallenge: 'ANY',
  verifyCurrentUserEmailChallenge: 'ANY',
  previewV81TeacherImport: 'USER_ACCOUNTS',
  confirmV81TeacherImport: 'USER_ACCOUNTS',
  listV81TeacherAccounts: 'USER_ACCOUNTS',
  deleteV81TeacherAccount: 'USER_ACCOUNTS',
  deleteV81StudentAccount: 'USER_ACCOUNTS',
  listStudents: 'USER_ACCOUNTS',
  getStudent: 'USER_ACCOUNTS',
  getTeacher: 'USER_ACCOUNTS',
  listTeacherClassSections: 'COURSE_VIEW',
  listCourses: 'COURSE_VIEW',
  getCourse: 'COURSE_VIEW',
  listClassSections: 'COURSE_VIEW',
  getClassSection: 'COURSE_VIEW',
  listEnrollments: 'COURSE_VIEW',
  getEnrollment: 'COURSE_VIEW',
  listRosterImports: 'COURSE_VIEW',
  getCurrentRosterImport: 'COURSE_VIEW',
  getRosterImport: 'COURSE_VIEW',
  listRosterEntries: 'COURSE_VIEW',
  listRosterAlignmentResults: 'COURSE_VIEW',
  getRosterAlignmentResult: 'COURSE_VIEW',
  listExerciseRecords: 'COURSE_VIEW',
  getExerciseRecord: 'COURSE_VIEW',
  getV81CourseRules: 'COURSE_VIEW',
  getV81ProgressTarget: 'COURSE_VIEW',
  listStudentScores: 'COURSE_VIEW',
  getStudentScore: 'COURSE_VIEW',
  listFeedback: 'STUDENT_FEEDBACK',
  getFeedback: 'STUDENT_FEEDBACK',
  listAuditLogs: 'AUDIT_QUERY',
  getAuditLog: 'AUDIT_QUERY',
  getAdminHealth: 'AUDIT_QUERY',
  getActivityConversionRules: 'GLOBAL_RULES',
  getV81SystemModeHistory: 'SYSTEM_MODE',
  changeV81SystemMode: 'SYSTEM_MODE',
  setV81ManualMode: 'SUPER',
  getV81ManualMode: 'SUPER',
};

@Injectable()
export class V81AdminPermissionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<FoundationRequest>();
    const principal = request.principal;
    if (principal?.role !== 'ADMIN') return true;
    const operation = request.operationId ?? '';
    if (['getV81AccountSecurity', 'changeOwnV81Password', 'logoutSession'].includes(operation))
      return true;
    const permission = operations[operation];
    if (!permission)
      throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403, {
        reason: 'ADMIN_OPERATION_NOT_ASSIGNED',
      });
    await requireAdminAccess(this.prisma, principal, permission);
    return true;
  }
}
