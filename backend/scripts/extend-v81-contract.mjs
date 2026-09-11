import fs from 'node:fs';
import { parse, stringify } from 'yaml';
const file = new URL('../../docs/backend-contracts/openapi.yaml', import.meta.url);
const api = parse(fs.readFileSync(file, 'utf8'));
const policyIdFor = id => id.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toUpperCase();
api.info.version = '3.0.0-v81-local-draft';
const schemas = api.components.schemas;
schemas.CreateTeacherCourseInput={type:'object',additionalProperties:false,required:['displayName'],properties:{displayName:{type:'string',minLength:1,maxLength:200}}};
schemas.V81InviteRevocationInput={type:'object',additionalProperties:false,required:['inviteToken'],properties:{inviteToken:{type:'string',minLength:16,maxLength:512}}};
schemas.DeleteSubadminInput = { type:'object', additionalProperties:false, required:['expectedVersion','handoverCompleted'],
  properties:{expectedVersion:{type:'integer',minimum:1,maximum:2147483646},handoverCompleted:{type:'boolean'}} };
schemas.SubadminIdentityInput = { type: 'object', additionalProperties: false, required: ['email','locale'], properties: {
  email: { type: 'string', format: 'email', maxLength: 254 }, locale: { type: 'string', enum: ['zh-CN','en'] } } };
schemas.SubadminIdentityVerifyInput = { type: 'object', additionalProperties: false, required: ['code','expectedVersion'], properties: {
  code: { type: 'string', pattern: '^\\d{6}$' }, expectedVersion: { type: 'integer', minimum: 1, maximum: 2147483646 } } };
schemas.CreateVerifiedSubadminInput = { type: 'object', additionalProperties: false,
  required: ['account','name','department','permissions','initialPassword','confirmPassword'],
  oneOf: [{required:['identityChallengeId'],not:{anyOf:[{required:['email']},{required:['identityVerifiedByAdmin']}]}},
    {required:['email','identityVerifiedByAdmin'],not:{required:['identityChallengeId']}}], properties: {
    email: {type:'string',format:'email',maxLength:254}, identityVerifiedByAdmin:{type:'boolean',const:true},
    identityChallengeId: { type: 'string', format: 'uuid' }, account: { type: 'string', minLength: 1, maxLength: 128 },
    name: { type: 'string', minLength: 1, maxLength: 100 }, department: { type: 'string', maxLength: 128 },
    permissions: { type: 'array', minItems: 1, maxItems: 8, uniqueItems: true, items: { type: 'string', enum: ['COURSE_VIEW','SEMESTER_MANAGE','USER_ACCOUNTS','STUDENT_FEEDBACK','GLOBAL_RULES','SYSTEM_MODE','HELP_CENTER','AUDIT_QUERY'] } },
    initialPassword: { type: 'string', minLength: 1, writeOnly: true }, confirmPassword: { type: 'string', minLength: 1, writeOnly: true } } };
schemas.V81DeletionChallengeInput = { type: 'object', additionalProperties: false, required: ['expectedVersion', 'locale'], properties: {
  expectedVersion: { type: 'integer', minimum: 1, maximum: 2147483647 }, locale: { enum: ['zh-CN', 'en'] } } };
schemas.UpdateVerifiedSubadminInput = { type: 'object', additionalProperties: false,
  required: ['expectedVersion','name','department','email','permissions'], properties: {
    expectedVersion: { type: 'integer', minimum: 1, maximum: 2147483646 },
    identityChallengeId: { type: 'string', format: 'uuid' }, email: { type: 'string', format: 'email', maxLength: 254 },
    name: { type: 'string', minLength: 1, maxLength: 100 }, department: { type: 'string', maxLength: 128 },
    permissions: { ...schemas.CreateVerifiedSubadminInput.properties.permissions, minItems: 0 } } };
schemas.V81SubadminPermissionsInput = { type: 'object', additionalProperties: false, required: ['expectedVersion', 'permissions'], properties: {
  expectedVersion: { type: 'integer', minimum: 1, maximum: 2147483646 }, permissions: { type: 'array', maxItems: 8, uniqueItems: true,
    items: { enum: ['COURSE_VIEW', 'SEMESTER_MANAGE', 'USER_ACCOUNTS', 'STUDENT_FEEDBACK', 'GLOBAL_RULES', 'SYSTEM_MODE', 'HELP_CENTER', 'AUDIT_QUERY'] } } } };
schemas.V81RuntimeArchiveInput = { type: 'object', additionalProperties: false, required: ['startDate', 'endDate'], properties: Object.fromEntries(['startDate', 'endDate'].map(name => [name, { type: 'string', format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }])) };
schemas.V81RuntimeArchiveVersionInput = { type: 'object', additionalProperties: false, required: ['expectedVersion'], properties: { expectedVersion: { type: 'integer', minimum: 1, maximum: 2147483646 } } };
schemas.V81RuleTemplateInput = { type: 'object', additionalProperties: false, required: ['displayName', 'expectedVersion'], properties: {
  displayName: { type: 'string', maxLength: 100, pattern: '\\S' }, expectedVersion: { type: 'integer', minimum: 0, maximum: 2147483646 } } };
schemas.V81MakeupWindowInput = { type: 'object', additionalProperties: false, required: ['enrollmentId', 'expectedRuleVersion', 'startsAt', 'endsAt'], properties: {
  enrollmentId: { type: 'string', format: 'uuid' }, expectedRuleVersion: { type: 'integer', minimum: 1, maximum: 2147483647 },
  startsAt: { type: 'string', format: 'date-time', pattern: 'T.*(?:Z|[+-]\\d{2}:\\d{2})$' }, endsAt: { type: 'string', format: 'date-time', pattern: 'T.*(?:Z|[+-]\\d{2}:\\d{2})$' } } };
schemas.V81MakeupRevocationInput = { type: 'object', additionalProperties: false, required: ['expectedVersion', 'reason'], properties: {
  expectedVersion: { type: 'integer', minimum: 1, maximum: 2147483647 }, reason: { type: 'string', minLength: 1, maxLength: 1000, pattern: '\\S' } } };
schemas.V81RosterBasisInput = { type: 'object', additionalProperties: false, required: ['confirmedRosterId', 'expectedVersion', 'reason'], properties: {
  confirmedRosterId: { type: 'string', format: 'uuid' }, expectedVersion: { type: 'integer', minimum: 0, maximum: 2147483646 },
  reason: { type: 'string', minLength: 1, maxLength: 1000, pattern: '\\S' } } };
schemas.V81OcrRosterConfirmationInput = { type: 'object', additionalProperties: false, required: ['expectedDraftVersion'],
  properties: { expectedDraftVersion: { type: 'integer', minimum: 1, maximum: 2147483647 } } };
schemas.V81OcrPhysicalConfirmationInput = { type: 'object', additionalProperties: false, required: ['expectedDraftVersion', 'selections'], properties: {
  expectedDraftVersion: { type: 'integer', minimum: 1, maximum: 2147483647 }, selections: { type: 'array', minItems: 1, maxItems: 500,
    items: { type: 'object', additionalProperties: false, required: ['rowId', 'expectedResultVersion'], properties: {
      rowId: { type: 'string', format: 'uuid' }, expectedResultVersion: { type: 'integer', minimum: 0, maximum: 2147483646 } } } } } };
const draftFields = ['studentNumber', 'name', 'runType', 'elapsed', 'testedOn'];
const draftColumns = { type: 'object', additionalProperties: false, required: ['studentNumber', 'name'], properties:
  Object.fromEntries(draftFields.map(field => [field, { type: 'integer', minimum: 0, maximum: 100000 }])) };
const draftValues = { type: 'object', additionalProperties: false, required: ['studentNumber', 'name'], properties:
  Object.fromEntries(draftFields.map(field => [field, { type: 'string', maxLength: 16384 }])) };
const draftSelection = { type: 'object', additionalProperties: false, required: ['pageId', 'attempt', 'tableIndex', 'headerRow', 'columns'], properties: {
  pageId: { type: 'string', format: 'uuid' }, attempt: { type: 'integer', minimum: 1, maximum: 2147483646 },
  tableIndex: { type: 'integer', minimum: 0, maximum: 31 }, headerRow: { type: 'integer', minimum: 0, maximum: 100000 }, columns: draftColumns } };
schemas.V81OcrDraftCreateInput = { type: 'object', additionalProperties: false, required: ['expectedVersion', 'selections'], properties: {
  expectedVersion: { type: 'integer', minimum: 0, maximum: 0 }, selections: { type: 'array', minItems: 1, maxItems: 1000, items: draftSelection } } };
schemas.V81OcrDraftRevisionInput = { type: 'object', additionalProperties: false, required: ['expectedVersion', 'rows'], properties: {
  expectedVersion: { type: 'integer', minimum: 1, maximum: 2147483646 }, rows: { type: 'array', minItems: 1, maxItems: 500, items: {
    type: 'object', additionalProperties: false, required: ['id', 'values', 'reviewedAgainstSource'], properties: {
      id: { type: 'string', format: 'uuid' }, values: draftValues, reviewedAgainstSource: { type: 'boolean' } } } } } };
schemas.V81OcrJobInput = { type: 'object', additionalProperties: false, required: ['expectedAttempt'], properties: { expectedAttempt: { type: 'integer', minimum: 0, maximum: 2147483645 } } };
schemas.RosterFileFormat.enum = ['CSV', 'XLSX'];
schemas.CreateRosterImportRequest.properties.sheetName = { type: 'string', minLength: 1, maxLength: 31,
  description: 'Required for XLSX; exact source worksheet name. Omit for CSV.' };
delete schemas.CreateRosterImportRequest.properties.file.contentMediaType;
schemas.CreateRosterImportRequest.properties.file.description = 'Original UTF-8 CSV or XLSX file; stored privately without converting the source.';
schemas.CreateRosterImportRequest.description = 'FILE accepts CSV or XLSX. XLSX requires sheetName; CSV omits it. OFFICIAL_API remains unsupported.';
schemas.CreateRosterImportRequest.allOf = [{ if: { properties: { fileFormat: { const: 'XLSX' } } },
  then: { required: ['sheetName'] }, else: { not: { required: ['sheetName'] } } }];
const rosterUpload = api.paths['/class-sections/{classSectionId}/roster-imports'].post.requestBody.content['multipart/form-data'];
if (rosterUpload.encoding?.file) delete rosterUpload.encoding.file.contentType;
schemas.V81RosterConfirmationInput = { type: 'object', additionalProperties: false, required: ['expectedVersion'],
  properties: { expectedVersion: { type: 'integer', minimum: 1, maximum: 2147483647 } } };
schemas.V81SemesterInput = { type: 'object', additionalProperties: false,
  required: ['academicYear', 'termCode', 'displayName', 'startDate', 'endDate'], properties: {
    academicYear: { type: 'string', pattern: '^\\d{4}-\\d{4}$' }, termCode: { type: 'string', enum: ['FIRST', 'SECOND', 'SUMMER'] },
    displayName: { type: 'string', maxLength: 100 }, startDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    endDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } } };
schemas.V81SemesterUpdateInput = { ...schemas.V81SemesterInput,
  required: [...schemas.V81SemesterInput.required, 'expectedVersion'], properties: { ...schemas.V81SemesterInput.properties,
    expectedVersion: { type: 'integer', minimum: 1, maximum: 2147483646 } } };
schemas.V81TeacherImportPreviewInput = { type: 'object', additionalProperties: false, required: ['csv'],
  properties: { csv: { type: 'string', maxLength: 1048576 } } };
schemas.V81TeacherImportConfirmInput = { type: 'object', additionalProperties: false,
  required: ['csv', 'previewToken', 'initialPassword'], properties: { csv: { type: 'string', maxLength: 1048576 },
    previewToken: { type: 'string', pattern: '^[a-f0-9]{64}$' }, initialPassword: { type: 'string', maxLength: 1024, writeOnly: true } } };
schemas.V81PhysicalXlsxInput = { type: 'object', additionalProperties: false, required: ['sheetName', 'fileBase64'], properties: {
  sheetName: { type: 'string', minLength: 1, maxLength: 31 }, fileBase64: { type: 'string', minLength: 4, maxLength: 1398104,
    pattern: '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$' } } };
schemas.V81PhysicalImportConfirmationInput = { type: 'object', additionalProperties: false, required: ['selections'],
  properties: { selections: { type: 'array', minItems: 1, maxItems: 1000, items: { type: 'object', additionalProperties: false,
    required: ['rowNumber', 'expectedVersion', 'expectedResultVersion'], properties: {
      rowNumber: { type: 'integer', minimum: 1, maximum: 1000 }, expectedVersion: { type: 'integer', minimum: 1, maximum: 2147483646 },
      expectedResultVersion: { type: 'integer', minimum: 0, maximum: 2147483646 } } } } } };
schemas.V81PhysicalImportRevisionInput = { type: 'object', additionalProperties: false,
  required: ['rowNumber', 'expectedVersion', 'studentNumber', 'name', 'runType', 'elapsed', 'testedOn'], properties: {
    rowNumber: { type: 'integer', minimum: 1, maximum: 1000 }, expectedVersion: { type: 'integer', minimum: 1, maximum: 2147483646 },
    ...Object.fromEntries(['studentNumber', 'name', 'runType', 'elapsed', 'testedOn'].map(key => [key, { type: 'string', maxLength: 1048576 }])) } };
schemas.V81PhysicalImportInput = { type: 'object', additionalProperties: false, required: ['csv'],
  properties: { csv: { type: 'string', maxLength: 1048576 } } };
schemas.V81PhysicalResultInput = { type: 'object', additionalProperties: false,
  required: ['runType', 'elapsedSeconds', 'testedOn', 'expectedVersion'], properties: {
    runType: { type: 'string', enum: ['800m', '1000m'] }, elapsedSeconds: { type: 'integer', minimum: 0, maximum: 9007199254740991 },
    testedOn: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, expectedVersion: { type: 'integer', minimum: 0, maximum: 2147483646 } } };
const enduranceKeyFields = { gender: { type: 'string', enum: ['male', 'female'] },
  gradeGroup: { type: 'string', enum: ['freshman_sophomore', 'junior_senior'] }, runType: { type: 'string', enum: ['800m', '1000m'] } };
const enduranceBandFields = { minSeconds: { type: 'integer', minimum: 0, maximum: 9007199254740991 },
  maxSeconds: { type: 'integer', minimum: 0, maximum: 9007199254740991 }, score: { type: 'integer', minimum: 0, maximum: 100 },
  tier: { type: 'string', enum: ['excellent', 'good', 'pass', 'fail'] }, note: { type: 'string' } };
schemas.V81EnduranceTableInput = { type: 'object', additionalProperties: false,
  properties: { ...enduranceKeyFields, expectedVersion: { type: 'integer', minimum: 0 } },
  required: [...Object.keys(enduranceKeyFields), 'expectedVersion'] };
schemas.V81EnduranceBandInput = { type: 'object', additionalProperties: false,
  properties: { ...schemas.V81EnduranceTableInput.properties, ...enduranceBandFields },
  required: [...schemas.V81EnduranceTableInput.required, ...Object.keys(enduranceBandFields)] };
schemas.V81SaveHelpInput = { type: 'object', additionalProperties: false,
  required: ['titleZh','titleEn','bodyZh','bodyEn','keywords','category','status','sortWeight','expectedVersion'],
  properties: { titleZh: { type: 'string' }, titleEn: { type: 'string' }, bodyZh: { type: 'string' }, bodyEn: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' } },
    category: { type: 'string', enum: ['login','enrollment','checkin','evidence','course','exemption','organization','notification','maintenance','feedback'] },
    status: { type: 'string', enum: ['draft','published','archived'] }, sortWeight: { type: 'number' }, expectedVersion: { type: 'integer', minimum: 0 } } };
schemas.V81HandleFeedbackInput = {
  type: 'object', additionalProperties: false, required: ['status', 'publicReply', 'expectedVersion'],
  properties: {
    status: { type: 'string', enum: ['IN_PROGRESS', 'WAITING_TECH', 'RESOLVED', 'CLOSED'] },
    publicReply: { type: 'string', pattern: '\\S', maxLength: 2000 },
    expectedVersion: { type: 'integer', minimum: 1 },
  },
};
const uploadMime = schemas.InitiateMediaUploadRequest?.properties?.mimeType;
if (uploadMime?.enum && !uploadMime.enum.includes('image/webp')) uploadMime.enum.push('image/webp');
api.paths['/media-uploads'].post['x-access-policy'].resourceResolver = 'MEDIA_TARGET_FROM_REQUEST';
schemas.V81FinalGradeInput = {
  type: 'object', additionalProperties: false, required: ['finalGrade', 'published', 'expectedVersion'],
  properties: {
    finalGrade: { type: 'integer', minimum: -2147483648, maximum: 2147483647 },
    published: { type: 'boolean' }, expectedVersion: { type: 'integer', minimum: 0, maximum: 2147483646 },
  },
};
schemas.V81FinalGradeRevision = {
  type: 'object', additionalProperties: false, required: ['enrollmentId', 'version', 'finalGrade', 'published', 'createdAt'],
  properties: {
    enrollmentId: { type: 'string', format: 'uuid' }, version: { type: 'integer', minimum: 1 },
    finalGrade: { type: 'integer', minimum: -2147483648, maximum: 2147483647 },
    published: { type: 'boolean' }, createdAt: { type: 'string', format: 'date-time' },
  },
};
schemas.SubmitExerciseRecordRequest.properties.swimDelayReason = { type: 'string', minLength: 1, maxLength: 1000 };
schemas.V81SwimIntakeItem = {
  type: 'object', additionalProperties: false, required: ['mediaId', 'phase'],
  properties: { mediaId: { type: 'string', format: 'uuid' }, phase: { enum: ['BEFORE', 'AFTER', 'OTHER'] } },
};
schemas.V81SwimIntakeInput = {
  type: 'object', additionalProperties: false, required: ['items', 'expectedVersion'],
  properties: {
    items: { type: 'array', minItems: 2, maxItems: 7, items: { $ref: '#/components/schemas/V81SwimIntakeItem' } },
    delayReason: { type: 'string', maxLength: 1000 },
    expectedVersion: { type: 'integer', minimum: 1 },
  },
};
schemas.RevokeV81CertificationInput = {
  type: 'object',
  additionalProperties: false,
  required: ['expectedVersion', 'reason'],
  properties: {
    expectedVersion: { type: 'integer', minimum: 1 },
    reason: { type: 'string', minLength: 1, maxLength: 1000 },
  },
};
schemas.V81Certification = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'studentId',
    'enrollmentId',
    'classSectionId',
    'certificationType',
    'organizationName',
    'status',
    'currentDecisionReason',
    'mediaIds',
    'version',
    'submittedAt',
    'decidedAt',
    'validFrom',
    'validTo',
  ],
  properties: {
    ...Object.fromEntries(
      ['id', 'studentId', 'enrollmentId', 'classSectionId'].map((key) => [
        key,
        { type: 'string', format: 'uuid' },
      ]),
    ),
    certificationType: { type: 'string', enum: ['SCHOOL_TEAM', 'STUDENT_CLUB'] },
    organizationName: { type: 'string' },
    status: {
      type: 'string',
      enum: ['DRAFT', 'SUBMITTED', 'SUPPLEMENT_REQUIRED', 'APPROVED', 'REJECTED', 'REVOKED'],
    },
    currentDecisionReason: { type: ['string', 'null'] },
    mediaIds: { type: 'array', maxItems: 3, items: { type: 'string', format: 'uuid' } },
    version: { type: 'integer', minimum: 1 },
    submittedAt: { type: ['string', 'null'], format: 'date-time' },
    decidedAt: { type: ['string', 'null'], format: 'date-time' },
    validFrom: { type: 'null' },
    validTo: { type: 'null' },
  },
};
schemas.V81RecognitionRevision = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'applicationId',
    'revisionNumber',
    'courseSeconds',
    'generalSeconds',
    'reason',
    'active',
    'createdAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    applicationId: { type: 'string', format: 'uuid' },
    revisionNumber: { type: 'integer', minimum: 1 },
    courseSeconds: { type: 'integer', minimum: 0, maximum: 72000 },
    generalSeconds: { type: 'integer', minimum: 0, maximum: 72000 },
    reason: { type: 'string' },
    active: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};
for (const name of ['ExemptionApplication','StructuredExemptionApplication']) {
  if (schemas[name].properties.status.enum)
    schemas[name].properties.status.enum = [...new Set([...schemas[name].properties.status.enum, 'REVOKED'])];
}
for (const name of ['CreateExemptionApplicationRequest', 'UpdateExemptionApplicationRequest']) {
  if (schemas[name]?.properties?.mediaIds) schemas[name].properties.mediaIds.maxItems = 3;
}
Object.assign(schemas.ReviewExemptionApplicationRequest.properties, {
  courseMinutes: { type: 'integer', minimum: 0, maximum: 1200 },
  generalMinutes: { type: 'integer', minimum: 0, maximum: 1200 },
});
schemas.ExerciseRecord['x-database-unique-key'] = ['sessionId'];
schemas.ExerciseRecord['x-same-day-independent-records'] = true;
schemas.ExerciseRecord['x-daily-credited-record-limit'] = 1;
delete schemas.ExerciseRecord['x-cancelled-releases-daily-slot'];
Object.assign(schemas.ExerciseRecord.properties, {
  workflowStage: {
    type: 'string',
    enum: ['PENDING_AI', 'TECHNICAL', 'PENDING_TEACHER', 'AWAITING_SUPPLEMENT', 'VALID', 'INVALID'],
  },
  workflowVersion: { type: 'integer', minimum: 1 },
  materialVersion: { type: 'integer', enum: [1, 2] },
  eligibleMinutes: { type: 'integer', minimum: 0, maximum: 60 },
  creditReason: { type: ['string', 'null'] },
});
schemas.V81ProgressCategory = {
  type: 'object',
  additionalProperties: false,
  required: [
    'targetSeconds',
    'validExerciseSeconds',
    'recognizedSeconds',
    'effectiveSeconds',
    'remainingSeconds',
  ],
  properties: Object.fromEntries(
    [
      'targetSeconds',
      'validExerciseSeconds',
      'recognizedSeconds',
      'effectiveSeconds',
      'remainingSeconds',
    ].map((key) => [key, { type: 'integer', minimum: 0, maximum: 72000 }]),
  ),
};
schemas.V81StudentProgress = {
  type: 'object',
  additionalProperties: false,
  required: [
    'enrollmentId',
    'classSectionId',
    'semesterId',
    'ruleVersion',
    'minimumMinutes',
    'weeklyLimit',
    'courseRelated',
    'general',
    'totalTargetSeconds',
    'totalEffectiveSeconds',
    'remainingSeconds',
    'completionPercent',
    'status',
  ],
  properties: {
    enrollmentId: { type: 'string', format: 'uuid' },
    classSectionId: { type: 'string', format: 'uuid' },
    semesterId: { type: 'string', format: 'uuid' },
    ruleVersion: { type: 'integer', minimum: 1 },
    minimumMinutes: { type: 'integer', enum: [30, 45, 60] },
    weeklyLimit: { type: 'integer', enum: [2, 3, 4] },
    courseRelated: { $ref: '#/components/schemas/V81ProgressCategory' },
    general: { $ref: '#/components/schemas/V81ProgressCategory' },
    totalTargetSeconds: { const: 72000 },
    totalEffectiveSeconds: { type: 'integer', minimum: 0, maximum: 72000 },
    remainingSeconds: { type: 'integer', minimum: 0, maximum: 72000 },
    completionPercent: { type: 'number', minimum: 0, maximum: 100 },
    status: { type: 'string', enum: ['COMPLETED', 'IN_PROGRESS'] },
  },
};
for (const [route, method] of [
  ['/student-scores', 'get'],
  ['/student-scores/{studentScoreId}', 'get'],
  ['/activity-conversion-rules', 'get'],
]) {
  api.paths[route][method]['x-access-policy'].allowedRoles = api.paths[route][method][
    'x-access-policy'
  ].allowedRoles.filter((role) => role !== 'STUDENT');
}
schemas.V81SubadminStatusInput = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'expectedVersion'],
  properties: {
    status: { type: 'string', enum: ['ACTIVE', 'DISABLED'] },
    expectedVersion: { type: 'integer', minimum: 1 },
    handoverCompleted: { type: 'boolean' },
  },
  allOf: [
    {
      if: { properties: { status: { const: 'DISABLED' } } },
      then: { required: ['handoverCompleted'], properties: { handoverCompleted: { const: true } } },
    },
  ],
};
schemas.PasswordLoginRequest.properties.account = {
  type: 'string',
  minLength: 1,
  description:
    'Teacher/super-admin verified school email, or sub-admin assigned immutable login account.',
};
schemas.PasswordLoginRequest.properties.password = { type: 'string', minLength: 1 };
schemas.ChangeOwnV81PasswordInput = {
  type: 'object',
  additionalProperties: false,
  required: ['currentPassword', 'newPassword', 'confirmPassword', 'expectedVersion'],
  properties: {
    currentPassword: { type: 'string', minLength: 1 },
    newPassword: { type: 'string', minLength: 1 },
    confirmPassword: { type: 'string', minLength: 1 },
    expectedVersion: { type: 'integer', minimum: 1 },
  },
};
schemas.V81OcrServiceInput = { type: 'object', additionalProperties: false,
  required: ['provider','region','timeoutMs','enabled','reason','expectedVersion'], properties: {
    provider: { enum: ['DISABLED','TENCENT_TABLE_V3'] }, region: { type: ['string','null'], pattern: '^[a-z]+-[a-z]+(?:-[0-9]+)?$', maxLength: 64 },
    timeoutMs: { type: 'integer', minimum: 1000, maximum: 60000 }, enabled: { type: 'boolean' },
    reason: { type: 'string', pattern: '\\S', maxLength: 1000 }, expectedVersion: { type: 'integer', minimum: 0, maximum: 2147483646 } } };
for (const schema of Object.values(schemas)) {
  if (schema?.properties?.newPassword) {
    schema.properties.newPassword.minLength = 1;
    delete schema.properties.newPassword.maxLength;
  }
}
schemas.ReviewReasonCode.enum = [
  ...new Set([
    ...schemas.ReviewReasonCode.enum,
    'UNCLEAR_EVIDENCE',
    'MISSING_REQUIRED_EVIDENCE',
    'SESSION_MISMATCH',
    'INCONSISTENT_EVIDENCE',
    'AUTHENTICITY_REQUIRES_CLARIFICATION',
    'CONFIRMED_REUSE_OR_MISUSE',
  ]),
];
schemas.CreateReviewRequest.properties.internalNote = {
  type: 'null',
  description: 'V8.1 does not accept hidden review notes.',
};
schemas.CreateReviewRequest.properties.creditedDurationOverrideSeconds = {
  type: 'null',
  description: 'Teachers cannot alter actual or credited exercise duration.',
};
api.paths['/exercise-records/{recordId}/reviews'].post.summary =
  'Append a responsible-teacher validity decision against the current V8.1 material version';
api.paths['/exercise-records/{recordId}/reviews'].post.description =
  'V8.1 workflows are routed to the atomic V8.1 review service. Use v81-reviews for a return for supplement and corrections for terminal fact corrections. Submission itself never means valid.';
schemas.V81CourseRulesInput = {
  type: 'object',
  additionalProperties: false,
  required: [
    'minimumMinutes',
    'weeklyLimit',
    'courseTarget',
    'generalTarget',
    'regularDeadline',
    'closingDeadline',
    'settlementPlannedAt',
    'publish',
    'expectedVersion',
  ],
  properties: {
    minimumMinutes: { type: 'integer', enum: [30, 45, 60] },
    weeklyLimit: { type: 'integer', enum: [2, 3, 4] },
    courseTarget: { type: 'integer', minimum: 0, maximum: 1200 },
    generalTarget: { type: 'integer', minimum: 0, maximum: 1200 },
    regularDeadline: { type: 'string', format: 'date-time' },
    closingDeadline: { type: 'string', format: 'date-time' },
    settlementPlannedAt: { type: 'string', format: 'date-time' },
    publish: { type: 'boolean' },
    expectedVersion: { type: 'integer', minimum: 0 },
  },
};
schemas.V81ManualModeInput = {
  type: 'object',
  additionalProperties: false,
  required: ['classSectionId', 'enabled', 'reason', 'expectedVersion'],
  properties: {
    classSectionId: { type: 'string', format: 'uuid' },
    enabled: { type: 'boolean' },
    reason: { type: 'string', minLength: 1 },
    expectedVersion: { type: 'integer', minimum: 0 },
  },
};
schemas.V81ReviewInput = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'expectedVersion'],
  properties: {
    action: { type: 'string', enum: ['VALID', 'INVALID', 'RETURN_FOR_SUPPLEMENT'] },
    reasonCode: {
      type: 'string',
      enum: [
        'UNCLEAR_EVIDENCE',
        'MISSING_REQUIRED_EVIDENCE',
        'SESSION_MISMATCH',
        'INCONSISTENT_EVIDENCE',
        'AUTHENTICITY_REQUIRES_CLARIFICATION',
        'CONFIRMED_REUSE_OR_MISUSE',
      ],
    },
    publicComment: { type: 'string', maxLength: 1000 },
    supplementHours: { type: 'integer', enum: [24, 72] },
    expectedVersion: { type: 'integer', minimum: 1 },
  },
};
schemas.V81SupplementInput = {
  type: 'object',
  additionalProperties: false,
  required: ['mediaIds', 'expectedVersion'],
  properties: {
    mediaIds: {
      type: 'array',
      minItems: 1,
      maxItems: 7,
      uniqueItems: true,
      items: { type: 'string', format: 'uuid' },
    },
    expectedVersion: { type: 'integer', minimum: 1 },
  },
};
schemas.V81CorrectionInput = {
  ...schemas.V81ReviewInput,
  required: ['action', 'expectedVersion', 'correctionReason'],
  properties: {
    action: { type: 'string', enum: ['VALID', 'INVALID'] },
    reasonCode: schemas.V81ReviewInput.properties.reasonCode,
    publicComment: schemas.V81ReviewInput.properties.publicComment,
    expectedVersion: { type: 'integer', minimum: 1 },
    correctionReason: { type: 'string', minLength: 1, maxLength: 1000 },
  },
};
schemas.ChangeV81SystemModeInput = {
  type: 'object',
  additionalProperties: false,
  required: ['mode', 'reason', 'expectedVersion'],
  properties: {
    mode: { type: 'string', enum: ['NORMAL', 'MAINTENANCE'] },
    reason: { type: 'string', minLength: 1 },
    expectedVersion: { type: 'integer', minimum: 1 },
    titleZh: { type: 'string' },
    titleEn: { type: 'string' },
    bodyZh: { type: 'string' },
    bodyEn: { type: 'string' },
    estimatedRecoveryAt: { type: 'string', format: 'date-time' },
  },
  allOf: [
    {
      if: { properties: { mode: { const: 'MAINTENANCE' } } },
      then: { required: ['titleZh', 'titleEn', 'bodyZh', 'bodyEn', 'estimatedRecoveryAt'] },
    },
  ],
};
if (schemas.SystemMode) schemas.SystemMode.enum = ['NORMAL', 'MAINTENANCE'];
for (const [route, method, id, roles, body] of [
  ['/me/account-deletion-challenges', 'post', 'requestCurrentUserAccountDeletionChallenge', ['STUDENT'], 'V81DeletionChallengeInput'],
  ['/admin/subadmin-identity-challenges', 'post', 'requestV81SubadminIdentity', ['ADMIN'], 'SubadminIdentityInput'],
  ['/admin/subadmin-identity-challenges/{id}/verify', 'post', 'verifyV81SubadminIdentity', ['ADMIN'], 'SubadminIdentityVerifyInput'],
  ['/admin/subadmins', 'post', 'createV81VerifiedSubadmin', ['ADMIN'], 'CreateVerifiedSubadminInput'],
  ['/admin/subadmins/{id}/profile', 'post', 'updateV81VerifiedSubadmin', ['ADMIN'], 'UpdateVerifiedSubadminInput'],
  ['/admin/subadmins/{id}/delete', 'post', 'deleteV81Subadmin', ['ADMIN'], 'DeleteSubadminInput'],
  ['/teacher/courses','post','createV81TeacherCourse',['TEACHER'],'CreateTeacherCourseInput'],
  ['/class-sections/{classSectionId}/course-invites/revocations','post','revokeV81CourseInvite',['TEACHER'],'V81InviteRevocationInput'],
  ['/admin/subadmins/{id}/permissions', 'post', 'setV81SubadminPermissions', ['ADMIN'], 'V81SubadminPermissionsInput'],
  ['/admin/runtime-archives', 'post', 'createV81RuntimeArchive', ['ADMIN'], 'V81RuntimeArchiveInput'],
  ['/admin/runtime-archives/{id}', 'get', 'getV81RuntimeArchive', ['ADMIN'], null],
  ['/admin/runtime-archives/{id}/cancellation', 'post', 'cancelV81RuntimeArchive', ['ADMIN'], 'V81RuntimeArchiveVersionInput'],
  ['/admin/runtime-archives/{id}/download-url', 'post', 'createV81RuntimeArchiveDownload', ['ADMIN'], 'V81RuntimeArchiveVersionInput'],
  ['/admin/runtime-archives/{id}/content', 'get', 'downloadV81RuntimeArchive', ['ADMIN'], null],
  [
    '/activity-certification-applications',
    'get',
    'listV81Certifications',
    ['STUDENT', 'TEACHER'],
    null,
  ],
  [
    '/activity-certification-applications/{id}/recognition-allocation-revisions',
    'get',
    'listV81RecognitionRevisions',
    ['STUDENT', 'TEACHER'],
    null,
  ],
  [
    '/activity-certification-applications/{id}/revoke',
    'post',
    'revokeV81Certification',
    ['TEACHER'],
    'RevokeV81CertificationInput',
  ],
  ['/student-progress', 'get', 'listV81StudentProgress', ['STUDENT'], null],
  [
    '/class-sections/{id}/progress-target',
    'get',
    'getV81ProgressTarget',
    ['STUDENT', 'TEACHER', 'ADMIN'],
    null,
  ],
  ['/admin/subadmins', 'get', 'listV81Subadmins', ['ADMIN'], null],
  ['/roster-imports/{rosterImportId}/registration-preview', 'get', 'previewV81RosterRegistration', ['TEACHER'], null],
  ['/class-sections/{classSectionId}/composite-roster', 'get', 'previewV81CompositeRoster', ['TEACHER'], null],
  ['/class-sections/{classSectionId}/composite-roster/export', 'get', 'exportV81CompositeRosterPreview', ['TEACHER'], null],
  ['/roster-imports/{rosterImportId}/confirmation', 'get', 'getV81RosterConfirmation', ['TEACHER'], null],
  ['/roster-imports/{rosterImportId}/source', 'get', 'getV81RosterSource', ['TEACHER'], null],
  ['/enrollments/{enrollmentId}/roster-status', 'get', 'getV81OwnRosterStatus', ['STUDENT'], null],
  ['/admin/class-sections/{classSectionId}/physical-summary', 'get', 'getV81AdminPhysicalSummary', ['ADMIN'], null],
  ['/class-sections/{classSectionId}/ocr-roster-batches', 'post', 'createV81OcrRosterBatch', ['TEACHER'], null],
  ['/class-sections/{classSectionId}/ocr-physical-batches', 'post', 'createV81OcrPhysicalBatch', ['TEACHER'], null],
  ['/class-sections/{classSectionId}/ocr-batches', 'get', 'listV81OcrBatches', ['TEACHER'], null],
  ['/ocr-batches/{batchId}', 'get', 'getV81OcrBatch', ['TEACHER'], null],
  ['/ocr-batches/{batchId}/pages/{pageId}/source', 'get', 'getV81OcrPageSource', ['TEACHER'], null],
  ['/ocr-batches/{batchId}/pages/{pageId}/recognition', 'get', 'getV81OcrPageRecognition', ['TEACHER'], null],
  ['/ocr-batches/{batchId}/pages/{pageId}/recognition', 'post', 'createV81OcrJob', ['TEACHER'], 'V81OcrJobInput'],
  ['/ocr-jobs/{jobId}', 'get', 'getV81OcrJob', ['TEACHER'], null],
  ['/ocr-batches/{batchId}/draft', 'get', 'getV81OcrDraft', ['TEACHER'], null],
  ['/class-sections/{classSectionId}/roster-basis', 'get', 'getV81RosterBasis', ['TEACHER'], null],
  ['/class-sections/{classSectionId}/makeup-windows', 'get', 'listV81MakeupWindows', ['TEACHER'], null],
  ['/enrollments/{enrollmentId}/makeup-windows', 'get', 'listV81OwnMakeupWindows', ['STUDENT'], null],
  ['/class-sections/{classSectionId}/makeup-windows', 'post', 'createV81MakeupWindow', ['TEACHER'], 'V81MakeupWindowInput'],
  ['/makeup-windows/{windowId}/revocation', 'post', 'revokeV81MakeupWindow', ['TEACHER'], 'V81MakeupRevocationInput'],
  ['/class-sections/{classSectionId}/roster-basis/snapshots', 'get', 'listV81ConfirmedRosterSnapshots', ['TEACHER'], null],
  ['/class-sections/{classSectionId}/roster-basis', 'post', 'selectV81RosterBasis', ['TEACHER'], 'V81RosterBasisInput'],
  ['/ocr-batches/{batchId}/roster-confirmation', 'get', 'getV81OcrRosterConfirmation', ['TEACHER'], null],
  ['/ocr-batches/{batchId}/roster-confirmation', 'post', 'confirmV81OcrRoster', ['TEACHER'], 'V81OcrRosterConfirmationInput'],
  ['/ocr-batches/{batchId}/physical-confirmations', 'get', 'getV81OcrPhysicalConfirmation', ['TEACHER'], null],
  ['/ocr-batches/{batchId}/physical-confirmations', 'post', 'confirmV81OcrPhysicalRows', ['TEACHER'], 'V81OcrPhysicalConfirmationInput'],
  ['/ocr-batches/{batchId}/draft', 'post', 'createV81OcrDraft', ['TEACHER'], 'V81OcrDraftCreateInput'],
  ['/ocr-batches/{batchId}/draft/revisions', 'post', 'reviseV81OcrDraft', ['TEACHER'], 'V81OcrDraftRevisionInput'],
  ['/admin/course-directory', 'get', 'getV81AdminCourseDirectory', ['ADMIN'], null],
  ['/admin/class-sections/{classSectionId}/roster-summary', 'get', 'getV81AdminRosterSummary', ['ADMIN'], null],
  ['/roster-imports/{rosterImportId}/confirmation', 'post', 'confirmV81Roster', ['TEACHER'], 'V81RosterConfirmationInput'],
  ['/admin/semesters', 'post', 'createV81Semester', ['ADMIN'], 'V81SemesterInput'],
  ['/admin/semesters', 'get', 'listV81Semesters', ['ADMIN'], null],
  ['/admin/audit-events', 'get', 'listV81AuditEvents', ['ADMIN'], null],
  ['/admin/audit-events/{source}/{eventId}', 'get', 'getV81AuditEvent', ['ADMIN'], null],
  ['/rule-templates', 'get', 'listV81RuleTemplates', ['ADMIN', 'TEACHER'], null],
  ['/rule-templates/{id}', 'get', 'getV81RuleTemplate', ['ADMIN', 'TEACHER'], null],
  ['/rule-templates', 'post', 'publishV81RuleTemplate', ['ADMIN'], 'V81RuleTemplateInput'],
  ['/admin/semesters/{id}/switch-check', 'get', 'getV81SemesterSwitchCheck', ['ADMIN'], null],
  ['/admin/semesters/{id}', 'post', 'updateV81Semester', ['ADMIN'], 'V81SemesterUpdateInput'],
  ['/admin/teacher-accounts', 'get', 'listV81TeacherAccounts', ['ADMIN'], null],
  [
    '/admin/subadmins/{id}/status',
    'post',
    'setV81SubadminStatus',
    ['ADMIN'],
    'V81SubadminStatusInput',
  ],
  ['/auth/account-security', 'get', 'getV81AccountSecurity', ['TEACHER', 'ADMIN'], null],
  [
    '/auth/own-password',
    'post',
    'changeOwnV81Password',
    ['TEACHER', 'ADMIN'],
    'ChangeOwnV81PasswordInput',
  ],
  ['/system-mode/announcement', 'get', 'getV81MaintenanceAnnouncement', [], null],
  ['/system-mode/history', 'get', 'getV81SystemModeHistory', ['ADMIN'], null],
  ['/system-mode/changes', 'post', 'changeV81SystemMode', ['ADMIN'], 'ChangeV81SystemModeInput'],
  [
    '/exercise-records/{recordId}/supplement-clock',
    'get',
    'getV81SupplementClock',
    ['STUDENT'],
    null,
  ],
  [
    '/class-sections/{classSectionId}/v81-rules',
    'get',
    'getV81CourseRules',
    ['STUDENT', 'TEACHER', 'ADMIN'],
    null,
  ],
  [
    '/class-sections/{classSectionId}/v81-rules',
    'post',
    'saveV81CourseRules',
    ['TEACHER'],
    'V81CourseRulesInput',
  ],
  [
    '/admin/review-services/manual-mode',
    'post',
    'setV81ManualMode',
    ['ADMIN'],
    'V81ManualModeInput',
  ],
  ['/admin/review-services/manual-mode/{classSectionId}', 'get', 'getV81ManualMode', ['ADMIN']],
  ['/admin/review-services/ocr', 'get', 'getV81OcrService', ['ADMIN']],
  ['/admin/review-services/ocr/revisions', 'get', 'listV81OcrServiceRevisions', ['ADMIN']],
  ['/admin/review-services/ocr/revisions', 'post', 'saveV81OcrService', ['ADMIN'], 'V81OcrServiceInput'],
  ['/exercise-records/{recordId}/swim-intake', 'post', 'acceptV81SwimIntake', ['STUDENT'], 'V81SwimIntakeInput'],
  ['/exercise-records/{recordId}/swim-intake', 'get', 'getV81SwimIntake', ['STUDENT', 'TEACHER']],
  ['/student/proof-todos', 'get', 'listV81ProofTodos', ['STUDENT']],
  ['/enrollments/{enrollmentId}/final-grades', 'get', 'listV81FinalGrades', ['TEACHER']],
  ['/admin/feedback/{feedbackId}', 'get', 'getV81FeedbackDetail', ['ADMIN']],
  ['/admin/feedback', 'get', 'listV81Feedback', ['ADMIN']],
  ['/admin/help-articles', 'post', 'createV81HelpArticle', ['ADMIN'], 'V81SaveHelpInput'],
  ['/admin/endurance-tables', 'get', 'listV81EnduranceTables', ['ADMIN']],
  ['/enrollments/{enrollmentId}/physical-results', 'get', 'listV81PhysicalResults', ['TEACHER']],
  ['/class-sections/{classSectionId}/physical-imports', 'post', 'createV81PhysicalImport', ['TEACHER'], 'V81PhysicalImportInput'],
  ['/admin/teacher-imports/preview', 'post', 'previewV81TeacherImport', ['ADMIN'], 'V81TeacherImportPreviewInput'],
  ['/admin/teacher-imports/confirm', 'post', 'confirmV81TeacherImport', ['ADMIN'], 'V81TeacherImportConfirmInput'],
  ['/class-sections/{classSectionId}/physical-imports/xlsx', 'post', 'createV81PhysicalXlsxImport', ['TEACHER'], 'V81PhysicalXlsxInput'],
  ['/class-sections/{classSectionId}/physical-imports', 'get', 'listV81PhysicalImports', ['TEACHER']],
  ['/physical-imports/{importId}', 'get', 'getV81PhysicalImport', ['TEACHER']],
  ['/physical-imports/{importId}/source', 'get', 'getV81PhysicalImportSource', ['TEACHER']],
  ['/physical-imports/{importId}/revisions', 'post', 'reviseV81PhysicalImport', ['TEACHER'], 'V81PhysicalImportRevisionInput'],
  ['/physical-imports/{importId}/revisions', 'get', 'listV81PhysicalImportRevisions', ['TEACHER']],
  ['/physical-imports/{importId}/confirm', 'post', 'confirmV81PhysicalImport', ['TEACHER'], 'V81PhysicalImportConfirmationInput'],
  ['/enrollments/{enrollmentId}/physical-results', 'post', 'appendV81PhysicalResult', ['TEACHER'], 'V81PhysicalResultInput'],
  ['/student/enrollments/{enrollmentId}/physical-result', 'get', 'getV81StudentPhysicalResult', ['STUDENT']],
  ['/admin/endurance-tables/rules', 'post', 'createV81EnduranceRule', ['ADMIN'], 'V81EnduranceBandInput'],
  ['/admin/endurance-tables/rules/{ruleId}', 'post', 'updateV81EnduranceRule', ['ADMIN'], 'V81EnduranceBandInput'],
  ['/admin/endurance-tables/rules/{ruleId}/delete', 'post', 'deleteV81EnduranceRule', ['ADMIN'], 'V81EnduranceTableInput'],
  ['/admin/help-articles', 'get', 'listV81HelpArticles', ['ADMIN']],
  ['/student/help-articles', 'get', 'listV81StudentHelpArticles', ['STUDENT']],
  ['/student/help-articles/{articleId}', 'get', 'getV81StudentHelpArticle', ['STUDENT']],
  ['/admin/help-articles/{articleId}', 'post', 'saveV81HelpArticle', ['ADMIN'], 'V81SaveHelpInput'],
  ['/admin/help-articles/{articleId}', 'get', 'getV81HelpArticle', ['ADMIN']],
  ['/student/feedback/{feedbackId}/history', 'get', 'getV81StudentFeedbackHistory', ['STUDENT']],
  ['/admin/feedback/{feedbackId}/handling', 'post', 'handleV81Feedback', ['ADMIN'], 'V81HandleFeedbackInput'],
  ['/enrollments/{enrollmentId}/final-grades', 'post', 'appendV81FinalGrade', ['TEACHER'], 'V81FinalGradeInput'],
  ['/class-sections/{classSectionId}/settlement-check', 'get', 'getV81SettlementCheck', ['TEACHER']],
  [
    '/exercise-records/{recordId}/v81-reviews',
    'post',
    'reviewV81Record',
    ['TEACHER'],
    'V81ReviewInput',
  ],
  [
    '/exercise-records/{recordId}/workflow',
    'get',
    'getV81RecordWorkflow',
    ['STUDENT', 'TEACHER'],
    null,
  ],
  [
    '/exercise-records/{recordId}/supplements',
    'post',
    'submitV81Supplement',
    ['STUDENT'],
    'V81SupplementInput',
  ],
  [
    '/exercise-records/{recordId}/corrections',
    'post',
    'correctV81Record',
    ['TEACHER'],
    'V81CorrectionInput',
  ],
]) {
  const parameters = [{ $ref: '#/components/parameters/RequestIdHeader' }];
  if (
    ['listV81StudentProgress', 'listV81Certifications', 'listV81RecognitionRevisions', 'listV81ProofTodos'].includes(id)
  )
    parameters.push(
      {
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', minimum: 1, maximum: 100, default: 100 },
      },
      { name: 'cursor', in: 'query', schema: { type: 'string', maxLength: 2048 } },
    );
  if (id === 'listV81Semesters') parameters.push({ name: 'limit', in: 'query', required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } });
  if (id === 'listV81Subadmins' || id === 'listV81TeacherAccounts' || id === 'listV81Semesters')
    parameters.push({
      name: 'after',
      in: 'query',
      required: false,
      schema: { type: 'string', format: 'uuid' },
    });
  if (id === 'listV81PhysicalImports') parameters.push(
    { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
    { name: 'beforeId', in: 'query', schema: { type: 'string', format: 'uuid' } },
  );
  if (id === 'listV81PhysicalImportRevisions') parameters.push(
    { name: 'rowNumber', in: 'query', required: true, schema: { type: 'integer', minimum: 1, maximum: 1000 } },
    { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
    { name: 'beforeVersion', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 2147483647 } },
  );
  if (['listV81FinalGrades', 'listV81PhysicalResults'].includes(id)) parameters.push(
    { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 100 } },
    { name: 'beforeVersion', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 2147483647 } },
  );
  if (id === 'listV81Feedback') parameters.push(
    { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100000, default: 1 } },
    { name: 'search', in: 'query', schema: { type: 'string', maxLength: 200 } },
    { name: 'category', in: 'query', schema: { type: 'string', enum: ['BUG', 'SUGGESTION', 'ACCESSIBILITY', 'PRIVACY', 'OTHER'] } },
    { name: 'status', in: 'query', schema: { type: 'string', enum: ['OPEN', 'IN_PROGRESS', 'WAITING_TECH', 'RESOLVED', 'CLOSED'] } },
  );
  if (id === 'listV81HelpArticles') parameters.push(
    { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100000, default: 1 } },
    { name: 'search', in: 'query', schema: { type: 'string', maxLength: 200 } },
    { name: 'category', in: 'query', schema: api.components.schemas.V81SaveHelpInput.properties.category },
    { name: 'status', in: 'query', schema: api.components.schemas.V81SaveHelpInput.properties.status },
  );
  if (['listV81StudentHelpArticles', 'getV81StudentHelpArticle'].includes(id)) parameters.push(
    { name: 'locale', in: 'query', schema: { type: 'string', enum: ['zh-CN', 'en'], default: 'zh-CN' } },
  );
  for (const match of route.matchAll(/\{(\w+)\}/g))
    parameters.push({
      name: match[1],
      in: 'path',
      required: true,
      schema: { type: 'string', format: 'uuid' },
    });
  if (method === 'post') parameters.push({ $ref: '#/components/parameters/IdempotencyKeyHeader' });
  api.paths[route] ??= {};
  api.paths[route][method] = {
    operationId: id,
    tags: ['V8.1 local implementation'],
    summary: id,
    description:
      'V8.1 local draft. Role guard plus service-level organization, ownership, state and version validation. School-calendar SLA excluded by user decision.',
    'x-access-policy':
      roles.length === 0
        ? {
            policyId: policyIdFor(id),
            authentication: 'PUBLIC',
            allowedRoles: [],
            organizationScope: 'NONE',
            resourceScope: 'NONE',
            resourceResolver: 'NONE',
            defaultDeny: true,
          }
        : {
            policyId: policyIdFor(id),
            authentication: 'ACCESS_TOKEN',
            allowedRoles: roles,
            organizationScope: 'PRINCIPAL_ORGANIZATION',
            resourceScope: 'SELF',
            resourceResolver: 'PRINCIPAL_USER',
            defaultDeny: true,
          },
    parameters,
    ...(body
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: `#/components/schemas/${body}` } } },
          },
        }
      : {}),
    responses: {
      [method === 'post' ? '201' : '200']: {
        description: 'Persisted result in the data envelope',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['data', 'meta'],
              properties: { data: { type: 'object' }, meta: { type: 'object' } },
            },
          },
        },
      },
      401: { $ref: '#/components/responses/Unauthorized' },
      403: { $ref: '#/components/responses/Forbidden' },
      409: { $ref: '#/components/responses/Conflict' },
      422: { $ref: '#/components/responses/UnprocessableEntity' },
    },
  };
}
for (const [route, method, data] of [
  ['/class-sections/{classSectionId}/settlement-check', 'get', {
    type: 'object', additionalProperties: false, required: ['classSectionId', 'checkedAt', 'ready', 'checks'],
    properties: {
      classSectionId: { type: 'string', format: 'uuid' }, checkedAt: { type: 'string', format: 'date-time' },
      ready: { type: 'boolean' }, checks: { type: 'array', description: 'OCR_DRAFTS counts batches with unfinished recognition jobs, unconfirmed paper rosters, or unconfirmed physical draft rows. CURRENT_ROSTER and CONFIRMED_OFFICIAL_ROSTER follow the unified electronic/OCR basis. ROSTER_PENDING_DIFFERENCE reports unresolved facts for that basis; missing final settlement sources remain UNAVAILABLE.', items: {
        type: 'object', additionalProperties: false, required: ['code', 'status', 'count'],
        properties: { code: { type: 'string' }, status: { enum: ['CLEAR', 'BLOCKED', 'UNAVAILABLE'] },
          count: { type: ['integer', 'null'], minimum: 0 } },
      } },
    },
  }],
  ['/enrollments/{enrollmentId}/final-grades', 'get', {
    type: 'object', additionalProperties: false, required: ['items', 'nextBeforeVersion'],
    properties: { items: { type: 'array', maxItems: 100, items: { $ref: '#/components/schemas/V81FinalGradeRevision' } },
      nextBeforeVersion: { type: ['integer', 'null'], minimum: 1 } },
  }],
  ['/enrollments/{enrollmentId}/final-grades', 'post', { $ref: '#/components/schemas/V81FinalGradeRevision' }],
  ['/student/proof-todos', 'get', {
    type: 'object', additionalProperties: false, required: ['items', 'nextCursor'],
    properties: {
      nextCursor: { type: ['string', 'null'] },
      items: { type: 'array', maxItems: 100, items: {
        type: 'object', additionalProperties: false,
        required: ['recordId', 'sessionId', 'workflowVersion', 'stage', 'reasonCode', 'publicComment',
          'studentVisibleReason', 'remainingSeconds', 'deadlineAt', 'paused', 'expired'],
        properties: {
          recordId: { type: 'string', format: 'uuid' }, sessionId: { type: 'string', format: 'uuid' },
          workflowVersion: { type: 'integer', minimum: 1 }, stage: { const: 'AWAITING_SUPPLEMENT' },
          reasonCode: { type: ['string', 'null'] }, publicComment: { type: ['string', 'null'] },
          studentVisibleReason: { type: ['string', 'null'] }, remainingSeconds: { type: 'integer', minimum: 0 },
          deadlineAt: { type: 'string', format: 'date-time' }, paused: { type: 'boolean' }, expired: { type: 'boolean' },
        },
      } },
    },
  }],
  ['/exercise-records/{recordId}/swim-intake', 'get', {
    type: 'object', additionalProperties: false,
    required: ['recordId', 'acceptedAt', 'sessionEndedAt', 'originalTransferDeadline', 'transferDeadline', 'intakeKind',
      'delayReason', 'completedAt', 'paused', 'remainingMs', 'transferLate', 'readyForReview', 'items'],
    properties: {
      recordId: { type: 'string', format: 'uuid' },
      ...Object.fromEntries(['acceptedAt', 'sessionEndedAt', 'originalTransferDeadline', 'transferDeadline'].map((key) =>
        [key, { type: 'string', format: 'date-time' }])),
      intakeKind: { enum: ['ON_TIME', 'OFFLINE_DELAYED'] },
      delayReason: { type: ['string', 'null'] },
      completedAt: { type: ['string', 'null'], format: 'date-time' },
      paused: { type: 'boolean' }, remainingMs: { type: 'integer', minimum: 0 },
      transferLate: { type: 'boolean' }, readyForReview: { type: 'boolean' },
      items: { type: 'array', minItems: 2, maxItems: 7, items: {
        type: 'object', additionalProperties: false, required: ['mediaId', 'phase', 'uploadStatus'],
        properties: { mediaId: { type: 'string', format: 'uuid' }, phase: { enum: ['BEFORE', 'AFTER', 'OTHER'] },
          uploadStatus: { type: 'string' } },
      } },
    },
  }],
  ['/exercise-records/{recordId}/swim-intake', 'post', {
    type: 'object', additionalProperties: false,
    required: ['recordId', 'acceptedAt', 'transferDeadline', 'intakeKind', 'delayReason', 'items', 'version'],
    properties: {
      recordId: { type: 'string', format: 'uuid' },
      acceptedAt: { type: 'string', format: 'date-time' },
      transferDeadline: { type: 'string', format: 'date-time' },
      intakeKind: { enum: ['ON_TIME', 'OFFLINE_DELAYED'] },
      delayReason: { type: ['string', 'null'] },
      items: { type: 'array', minItems: 2, maxItems: 7, items: { $ref: '#/components/schemas/V81SwimIntakeItem' } },
      version: { const: 1 },
    },
  }],
  ['/admin/review-services/manual-mode/{classSectionId}', 'get', {
    type: 'object', additionalProperties: false,
    required: ['classSectionId', 'enabled', 'reason', 'version', 'updatedAt'],
    properties: {
      classSectionId: { type: 'string', format: 'uuid' },
      enabled: { type: 'boolean' },
      reason: { type: ['string', 'null'] },
      version: { type: 'integer', minimum: 0 },
      updatedAt: { type: ['string', 'null'], format: 'date-time' },
    },
  }],
  [
    '/activity-certification-applications',
    'get',
    { type: 'array', items: { $ref: '#/components/schemas/V81Certification' } },
  ],
  [
    '/activity-certification-applications/{id}/recognition-allocation-revisions',
    'get',
    { type: 'array', items: { $ref: '#/components/schemas/V81RecognitionRevision' } },
  ],
  [
    '/activity-certification-applications/{id}/revoke',
    'post',
    { $ref: '#/components/schemas/V81Certification' },
  ],
  [
    '/student-progress',
    'get',
    { type: 'array', items: { $ref: '#/components/schemas/V81StudentProgress' } },
  ],
  [
    '/class-sections/{id}/progress-target',
    'get',
    {
      type: 'object',
      additionalProperties: false,
      required: [
        'classSectionId',
        'courseTargetSeconds',
        'generalTargetSeconds',
        'totalTargetSeconds',
        'ruleVersion',
      ],
      properties: {
        classSectionId: { type: 'string', format: 'uuid' },
        courseTargetSeconds: { type: 'integer', minimum: 0, maximum: 72000 },
        generalTargetSeconds: { type: 'integer', minimum: 0, maximum: 72000 },
        totalTargetSeconds: { const: 72000 },
        ruleVersion: { type: 'integer', minimum: 1 },
      },
    },
  ],
  [
    '/auth/account-security',
    'get',
    {
      type: 'object',
      additionalProperties: false,
      required: ['userId', 'version', 'mustChangePassword', 'adminKind', 'permissions'],
      properties: {
        userId: { type: 'string', format: 'uuid' },
        version: { type: 'integer', minimum: 1 },
        mustChangePassword: { type: 'boolean' },
        adminKind: { type: ['string', 'null'], enum: ['SUPER', 'SUB', null] },
        permissions: { type: 'array', items: { type: 'string' } },
      },
    },
  ],
  [
    '/auth/own-password',
    'post',
    {
      type: 'object',
      additionalProperties: false,
      required: ['userId', 'version', 'mustChangePassword'],
      properties: {
        userId: { type: 'string', format: 'uuid' },
        version: { type: 'integer', minimum: 1 },
        mustChangePassword: { const: false },
      },
    },
  ],
]) {
  api.paths[route][method].responses[method === 'post' ? '201' : '200'].content[
    'application/json'
  ].schema.properties.data = data;
}
const feedbackStatus = { type: 'string', enum: ['OPEN', 'IN_PROGRESS', 'WAITING_TECH', 'RESOLVED', 'CLOSED'] };
const feedbackRequester = { type: 'object', additionalProperties: false, required: ['name', 'studentNumber', 'email'],
  properties: { name: { type: ['string', 'null'] }, studentNumber: { type: ['string', 'null'] }, email: { type: ['string', 'null'] } } };
const feedbackFields = { id: { type: 'string', format: 'uuid' }, category: { type: 'string', enum: ['BUG', 'SUGGESTION', 'ACCESSIBILITY', 'PRIVACY', 'OTHER'] },
  content: { type: 'string' }, status: feedbackStatus, version: { type: 'integer', minimum: 1 },
  createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' }, requester: feedbackRequester };
const feedbackObject = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const feedbackHistory = feedbackObject({ id: { type: 'string', format: 'uuid' }, actorUserId: { type: 'string', format: 'uuid' },
  actorName: { type: ['string', 'null'] }, publicReply: { type: 'string' }, previousStatus: feedbackStatus, nextStatus: feedbackStatus,
  occurredAt: { type: 'string', format: 'date-time' }, eventVersion: { type: 'integer', minimum: 2 } });
api.paths['/admin/feedback'].get.responses['200'].content['application/json'].schema.properties.data = feedbackObject({
  items: { type: 'array', maxItems: 6, items: feedbackObject(feedbackFields) }, page: { type: 'integer', minimum: 1 },
  pageSize: { const: 6 }, total: { type: 'integer', minimum: 0 },
  summary: feedbackObject(Object.fromEntries(['total', 'pending', 'waitingTech', 'resolved'].map(key => [key, { type: 'integer', minimum: 0 }]))) });
api.paths['/admin/feedback/{feedbackId}'].get.responses['200'].content['application/json'].schema.properties.data = feedbackObject({
  ...feedbackFields, publicReply: { type: ['string', 'null'] }, history: { type: 'array', items: feedbackHistory } });
api.paths['/admin/feedback/{feedbackId}/handling'].post.responses['201'].content['application/json'].schema.properties.data = feedbackObject({
  id: feedbackFields.id, status: feedbackStatus, publicReply: { type: 'string' }, version: feedbackFields.version, updatedAt: feedbackFields.updatedAt });
api.paths['/student/feedback/{feedbackId}/history'].get.responses['200'].content['application/json'].schema.properties.data = feedbackObject({
  feedbackId: feedbackFields.id, status: feedbackStatus, version: feedbackFields.version,
  items: { type: 'array', items: feedbackObject({ id: feedbackFields.id, publicReply: { type: 'string' }, status: feedbackStatus,
    occurredAt: feedbackFields.updatedAt, version: feedbackFields.version }) } });
const helpArticle = feedbackObject({ id: { type: 'string', format: 'uuid' }, version: { type: 'integer', minimum: 1 },
  titleZh: { type: 'string', minLength: 1 }, titleEn: { type: 'string', minLength: 1 },
  bodyZh: { type: 'string' }, bodyEn: { type: 'string' }, keywords: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true },
  category: api.components.schemas.V81SaveHelpInput.properties.category,
  status: api.components.schemas.V81SaveHelpInput.properties.status, sortWeight: { type: 'number' },
  updatedAt: { type: 'string', format: 'date-time' } });
for (const [route, method] of [['/admin/help-articles', 'post'], ['/admin/help-articles/{articleId}', 'get'], ['/admin/help-articles/{articleId}', 'post']]) {
  api.paths[route][method].responses[method === 'post' ? '201' : '200'].content['application/json'].schema.properties.data = helpArticle;
}
api.paths['/admin/help-articles'].get.responses['200'].content['application/json'].schema.properties.data = feedbackObject({
  items: { type: 'array', maxItems: 5, items: helpArticle }, page: { type: 'integer', minimum: 1 }, pageSize: { const: 5 },
  total: { type: 'integer', minimum: 0 }, summary: feedbackObject(Object.fromEntries(
    ['draft', 'published', 'archived'].map(key => [key, { type: 'integer', minimum: 0 }]))) });
const studentHelpArticle = feedbackObject({ id: { type: 'string', format: 'uuid' }, category: helpArticle.properties.category,
  locale: { type: 'string', enum: ['zh-CN', 'en'] }, title: { type: 'string' }, bodyMarkdown: { type: 'string' },
  publishedAt: { type: 'string', format: 'date-time' }, version: { type: 'integer', minimum: 1 } });
api.paths['/student/help-articles'].get.responses['200'].content['application/json'].schema.properties.data = { type: 'array', items: studentHelpArticle };
api.paths['/student/help-articles/{articleId}'].get.responses['200'].content['application/json'].schema.properties.data = studentHelpArticle;
const enduranceTable = feedbackObject({ id: { type: 'string', format: 'uuid' }, ...enduranceKeyFields,
  version: { type: 'integer', minimum: 0 }, updatedAt: { type: ['string', 'null'], format: 'date-time' },
  bands: { type: 'array', minItems: 1, items: feedbackObject({ id: { type: 'string', format: 'uuid' }, ...enduranceBandFields }) } });
api.paths['/admin/endurance-tables'].get.responses['200'].content['application/json'].schema.properties.data = {
  type: 'array', minItems: 4, maxItems: 4, items: enduranceTable };
for (const route of ['/admin/endurance-tables/rules', '/admin/endurance-tables/rules/{ruleId}', '/admin/endurance-tables/rules/{ruleId}/delete']) {
  api.paths[route].post.responses['201'].content['application/json'].schema.properties.data = enduranceTable;
}
const physicalResult = feedbackObject({ version: { type: 'integer', minimum: 1 }, runType: { type: 'string', enum: ['800m', '1000m'] },
  elapsedSeconds: { type: 'integer', minimum: 0, maximum: 9007199254740991 }, testedOn: { type: 'string', format: 'date' } });
api.paths['/enrollments/{enrollmentId}/physical-results'].get.responses['200'].content['application/json'].schema.properties.data = feedbackObject({
  items: { type: 'array', maxItems: 100, items: feedbackObject({ ...physicalResult.properties, createdAt: { type: 'string', format: 'date-time' } }) },
  nextBeforeVersion: { type: ['integer', 'null'], minimum: 1 } });
api.paths['/student/enrollments/{enrollmentId}/physical-result'].get.responses['200'].content['application/json'].schema.properties.data = {
  oneOf: [feedbackObject({ status: { const: 'RECORDED' }, result: physicalResult }),
    feedbackObject({ status: { type: 'string', enum: ['NOT_RECORDED', 'EXEMPT'] }, result: { type: 'null' } })] };
api.paths['/enrollments/{enrollmentId}/physical-results'].post.responses['201'].content['application/json'].schema.properties.data =
  feedbackObject({ ...physicalResult.properties, createdAt: { type: 'string', format: 'date-time' } });
const physicalSourceRow = feedbackObject(Object.fromEntries(['studentNumber', 'name', 'runType', 'elapsed', 'testedOn'].map(key => [key, { type: 'string' }])));
const physicalImport = feedbackObject({ id: { type: 'string', format: 'uuid' }, classSectionId: { type: 'string', format: 'uuid' },
  sourceSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' }, createdAt: { type: 'string', format: 'date-time' }, pendingCount: { type: 'integer', minimum: 0 },
  rows: { type: 'array', minItems: 1, maxItems: 1000, items: feedbackObject({ rowNumber: { type: 'integer', minimum: 1 }, version: { type: 'integer', minimum: 1 },
    source: physicalSourceRow, original: physicalSourceRow, enrollmentId: { type: ['string', 'null'], format: 'uuid' }, runType: { type: 'string' },
    elapsedSeconds: { type: ['integer', 'null'], minimum: 0, maximum: 9007199254740991 }, testedOn: { type: 'string' },
    issues: { type: 'array', items: { type: 'string' } }, confirmed: { type: 'boolean' }, resultVersion: { type: ['integer', 'null'], minimum: 1 } }) } });
api.paths['/class-sections/{classSectionId}/physical-imports'].post.responses['201'].content['application/json'].schema.properties.data = physicalImport;
api.paths['/admin/teacher-imports/preview'].post.responses['201'].content['application/json'].schema.properties.data = {
  type: 'object', additionalProperties: false, required: ['rows', 'canCreate', 'previewToken'], properties: {
    canCreate: { type: 'boolean' }, previewToken: { type: ['string', 'null'] }, rows: { type: 'array', maxItems: 1000, items: {
      type: 'object', additionalProperties: false, required: ['rowNumber', 'employeeId', 'name', 'email', 'college', 'errors'], properties: {
        rowNumber: { type: 'integer', minimum: 1 }, employeeId: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' },
        college: { type: ['string', 'null'] }, errors: { type: 'array', items: { type: 'string' } } } } } } };
api.paths['/admin/teacher-accounts'].get.responses['200'].content['application/json'].schema.properties.data = {
  type: 'object', additionalProperties: false, required: ['items', 'nextCursor'], properties: {
    items: { type: 'array', maxItems: 100, items: { $ref: '#/components/schemas/TeacherProfile' } },
    nextCursor: { type: ['string', 'null'], format: 'uuid' } } };
for (const path of ['/admin/semesters', '/admin/semesters/{id}'])
  api.paths[path].post.responses['201'].content['application/json'].schema.properties.data = { $ref: '#/components/schemas/Semester' };
api.paths['/admin/semesters'].get.responses['200'].content['application/json'].schema.properties.data = {
  type: 'object', additionalProperties: false, required: ['items', 'nextCursor'], properties: {
    items: { type: 'array', maxItems: 100, items: { ...schemas.Semester,
      required: [...schemas.Semester.required, 'courseCount', 'studentCount'], properties: { ...schemas.Semester.properties,
        courseCount: { type: 'integer', minimum: 0, description: 'Teaching sections in this semester.' },
        studentCount: { type: 'integer', minimum: 0, description: 'Distinct students with enrollment history in this semester, including ended enrollment relationships.' } } } },
    nextCursor: { type: ['string', 'null'], format: 'uuid' } } };
const registrationRow = { type: 'object', additionalProperties: false,
  required: ['rosterEntryId', 'studentNumber', 'fullName', 'status', 'studentId', 'enrollmentId'], properties: {
    rosterEntryId: { type: ['string', 'null'], format: 'uuid' }, studentNumber: { type: 'string' }, fullName: { type: 'string' },
    status: { type: 'string', enum: ['MATCHED', 'PENDING_REGISTRATION', 'IDENTITY_CONFLICT', 'EXTRA_IN_PLATFORM'] },
    studentId: { type: ['string', 'null'], format: 'uuid' }, enrollmentId: { type: ['string', 'null'], format: 'uuid' } } };
const progressCategory = { type: 'object', additionalProperties: false,
  required: ['targetSeconds', 'validExerciseSeconds', 'recognizedSeconds', 'effectiveSeconds', 'remainingSeconds'],
  properties: Object.fromEntries(['targetSeconds', 'validExerciseSeconds', 'recognizedSeconds', 'effectiveSeconds', 'remainingSeconds']
    .map(key => [key, { type: 'integer', minimum: 0 }])) };
const compositeGradeRevision = { type: ['object', 'null'], additionalProperties: false, required: ['version', 'finalGrade', 'published', 'createdAt'], properties: {
  version: { type: 'integer', minimum: 1 }, finalGrade: { type: 'integer', minimum: -2147483648, maximum: 2147483647 },
  published: { type: 'boolean' }, createdAt: { type: 'string', format: 'date-time' } } };
const compositeRow = { ...registrationRow, required: [...registrationRow.required, 'progress', 'physical', 'pendingCount', 'finalGrade'],
  properties: { ...registrationRow.properties, finalGrade: { type: ['object', 'null'], additionalProperties: false,
    description: 'Teacher-only internal results, independent of exercise progress. Latest editing revision and latest published revision may differ; a later draft does not replace the published result.',
    required: ['latestRevision', 'publishedRevision'], properties: { latestRevision: compositeGradeRevision, publishedRevision: compositeGradeRevision } }, pendingCount: { type: ['integer', 'null'], minimum: 0 },
    progress: { type: ['object', 'null'], additionalProperties: false,
      required: ['actualSeconds', 'invalidActualSeconds', 'validUncreditedSeconds', 'creditedSeconds', 'pendingActualSeconds', 'course', 'general', 'remainingSeconds', 'targetReached'],
      properties: { ...Object.fromEntries(['actualSeconds', 'invalidActualSeconds', 'validUncreditedSeconds', 'creditedSeconds', 'pendingActualSeconds', 'remainingSeconds']
        .map(key => [key, { type: 'integer', minimum: 0 }])), course: progressCategory, general: progressCategory, targetReached: { type: 'boolean' } } },
    physical: { type: ['object', 'null'], additionalProperties: false, required: ['status', 'result'], properties: {
      status: { type: 'string', enum: ['EXEMPT', 'RECORDED', 'NOT_RECORDED'] }, result: { type: ['object', 'null'], additionalProperties: false,
        required: ['version', 'runType', 'elapsedSeconds', 'testedOn'], properties: { version: { type: 'integer', minimum: 1 },
          runType: { type: 'string', enum: ['1000m', '800m'] }, elapsedSeconds: { type: 'integer', minimum: 0 }, testedOn: { type: 'string', format: 'date' } } } } } } };
api.paths['/class-sections/{classSectionId}/composite-roster/export'].get.responses['200'].content['application/json'].schema.properties.data = {
  type: 'object', additionalProperties: false, required: ['fileName', 'contentType', 'fileBase64', 'generatedAt'], properties: {
    fileName: { type: 'string' }, contentType: { const: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    fileBase64: { type: 'string', contentEncoding: 'base64' }, generatedAt: { type: 'string', format: 'date-time' } } };
api.paths['/class-sections/{classSectionId}/composite-roster'].get.responses['200'].content['application/json'].schema.properties.data = {
  type: 'object', additionalProperties: false,
  required: ['classSectionId', 'confirmedRosterId', 'rosterImportId', 'ocrBatchId', 'sourceKind', 'rosterVersion', 'ruleVersion', 'generatedAt', 'isSettlementSnapshot', 'denominator', 'denominatorConfirmed', 'registrationComplete', 'rows', 'extras'],
  properties: { ...Object.fromEntries(['classSectionId', 'confirmedRosterId'].map(key => [key, { type: 'string', format: 'uuid' }])),
    rosterImportId: { type: ['string', 'null'], format: 'uuid' }, ocrBatchId: { type: ['string', 'null'], format: 'uuid' }, sourceKind: { enum: ['ELECTRONIC', 'OCR'] },
    rosterVersion: { type: 'integer', minimum: 1 }, ruleVersion: { type: 'integer', minimum: 1 }, generatedAt: { type: 'string', format: 'date-time' },
    isSettlementSnapshot: { const: false }, denominator: { type: ['integer', 'null'], minimum: 0 }, denominatorConfirmed: { type: 'boolean' },
    registrationComplete: { type: 'boolean' }, rows: { type: 'array', maxItems: 500, items: compositeRow }, extras: { type: 'array', items: compositeRow } } };
const confirmedRoster = { type: 'object', additionalProperties: false,
  required: ['id', 'classSectionId', 'rosterImportId', 'sourceVersion', 'sourceSha256', 'sourceRows', 'version', 'actorId', 'confirmedAt'],
  properties: { id: { type: 'string', format: 'uuid' }, classSectionId: { type: 'string', format: 'uuid' },
    rosterImportId: { type: 'string', format: 'uuid' }, sourceVersion: { type: 'integer', minimum: 1 },
    sourceSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' }, version: { type: 'integer', minimum: 1 },
    actorId: { type: 'string', format: 'uuid' }, confirmedAt: { type: 'string', format: 'date-time' },
    sourceRows: { type: 'array', minItems: 1, maxItems: 500, items: { type: 'object', additionalProperties: false,
      required: ['id', 'sourceRowNumber', 'studentNumber', 'rawStudentNumber', 'fullName', 'validationStatus', 'errors', 'raw'],
      properties: { id: { type: 'string', format: 'uuid' }, sourceRowNumber: { type: 'integer', minimum: 1 },
        studentNumber: { type: ['string', 'null'] }, rawStudentNumber: { type: ['string', 'null'] }, fullName: { type: ['string', 'null'] },
        validationStatus: { type: 'string', enum: ['VALID', 'DUPLICATED'] }, errors: { type: 'array', items: { type: 'string' } },
        raw: { type: 'object', additionalProperties: true } } } } } };
api.paths['/roster-imports/{rosterImportId}/confirmation'].get.responses['200'].content['application/json'].schema.properties.data = confirmedRoster;
api.paths['/admin/class-sections/{classSectionId}/roster-summary'].get.responses['200'].content['application/json'].schema.properties.data = {
  type: 'object', additionalProperties: false,
  required: ['classSectionId', 'generatedAt', 'available', 'rosterVersion', 'denominator', 'denominatorConfirmed',
    'matchedCount', 'pendingRegistrationCount', 'identityConflictCount', 'extraCount', 'registrationComplete'], properties: {
    classSectionId: { type: 'string', format: 'uuid' }, generatedAt: { type: 'string', format: 'date-time' },
    available: { type: 'boolean' }, rosterVersion: { type: ['integer', 'null'], minimum: 1 },
    denominatorConfirmed: { type: 'boolean' }, registrationComplete: { type: 'boolean' },
    ...Object.fromEntries(['denominator', 'matchedCount', 'pendingRegistrationCount', 'identityConflictCount', 'extraCount']
      .map(key => [key, { type: ['integer', 'null'], minimum: 0 }])) } };
api.paths['/enrollments/{enrollmentId}/roster-status'].get.responses['200'].content['application/json'].schema.properties.data = {
  type: 'object', additionalProperties: false,
  required: ['enrollmentId', 'classSectionId', 'generatedAt', 'available', 'rosterVersion', 'status', 'registrationComplete'], properties: {
    enrollmentId: { type: 'string', format: 'uuid' }, classSectionId: { type: 'string', format: 'uuid' },
    generatedAt: { type: 'string', format: 'date-time' }, available: { type: 'boolean' },
    rosterVersion: { type: ['integer', 'null'], minimum: 1 }, status: { type: ['string', 'null'],
      enum: ['MATCHED', 'PENDING_REGISTRATION', 'IDENTITY_CONFLICT', 'EXTRA_IN_PLATFORM', null] }, registrationComplete: { type: 'boolean' } } };
api.paths['/roster-imports/{rosterImportId}/source'].get.responses['200'].content['application/json'].schema.properties.data = {
  type: 'object', additionalProperties: false,
  required: ['rosterImportId', 'fileName', 'fileFormat', 'sheetName', 'sourceSha256', 'fileSizeBytes', 'fileBase64'], properties: {
    rosterImportId: { type: 'string', format: 'uuid' }, fileName: { type: 'string', maxLength: 255 },
    fileFormat: { type: 'string', enum: ['CSV', 'XLSX'] }, sheetName: { type: ['string', 'null'], maxLength: 31 },
    sourceSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' }, fileSizeBytes: { type: 'integer', minimum: 0, maximum: 104857600 },
    fileBase64: { type: 'string', contentEncoding: 'base64', maxLength: 139810136 } } };
api.paths['/roster-imports/{rosterImportId}/confirmation'].post.responses['201'].content['application/json'].schema.properties.data = confirmedRoster;
for (const method of ['get', 'post']) api.paths['/roster-imports/{rosterImportId}/confirmation'][method].responses['404'] = { $ref: '#/components/responses/NotFound' };
api.paths['/roster-imports/{rosterImportId}/registration-preview'].get.responses['200'].content['application/json'].schema.properties.data = {
  type: 'object', additionalProperties: false,
  required: ['classSectionId', 'rosterImportId', 'sourceVersion', 'generatedAt', 'rows', 'extras', 'sourceRowCount', 'denominator',
    'denominatorConfirmed', 'matchedCount', 'unresolvedRowCount', 'registrationComplete'], properties: {
    classSectionId: { type: 'string', format: 'uuid' }, rosterImportId: { type: 'string', format: 'uuid' },
    sourceVersion: { type: 'integer', minimum: 1 }, generatedAt: { type: 'string', format: 'date-time' },
    rows: { type: 'array', maxItems: 500, items: registrationRow }, extras: { type: 'array', items: registrationRow },
    sourceRowCount: { type: 'integer', minimum: 0 }, denominator: { type: ['integer', 'null'], minimum: 0 },
    denominatorConfirmed: { type: 'boolean' }, matchedCount: { type: 'integer', minimum: 0 },
    unresolvedRowCount: { type: 'integer', minimum: 0 }, registrationComplete: { type: 'boolean' } } };
api.paths['/admin/teacher-imports/confirm'].post.responses['201'].content['application/json'].schema.properties.data = {
  type: 'object', additionalProperties: false, required: ['batchId', 'createdCount', 'accounts'], properties: {
    batchId: { type: 'string', format: 'uuid' }, createdCount: { type: 'integer', minimum: 1, maximum: 1000 },
    accounts: { type: 'array', minItems: 1, maxItems: 1000, items: { type: 'object', additionalProperties: false,
      required: ['employeeId', 'name', 'email', 'college', 'userId', 'teacherProfileId'], properties: {
        employeeId: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' }, college: { type: ['string', 'null'] },
        userId: { type: 'string', format: 'uuid' }, teacherProfileId: { type: 'string', format: 'uuid' } } } } } };
api.paths['/class-sections/{classSectionId}/physical-imports/xlsx'].post.responses['201'].content['application/json'].schema.properties.data = physicalImport;
api.paths['/physical-imports/{importId}'].get.responses['200'].content['application/json'].schema.properties.data = physicalImport;
api.paths['/physical-imports/{importId}/source'].get.responses['200'].content['application/json'].schema.properties.data = {
  oneOf: [{
  type: 'object', additionalProperties: false, required: ['csv', 'sourceSha256'], properties: {
    csv: { type: 'string', maxLength: 1048576 }, sourceSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' } } },
  { type: 'object', additionalProperties: false, required: ['fileBase64', 'sourceSha256', 'sheetName'], properties: {
    fileBase64: { type: 'string', maxLength: 1398104 }, sourceSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    sheetName: { type: 'string', minLength: 1, maxLength: 31 } } }] };
api.paths['/physical-imports/{importId}/revisions'].post.responses['201'].content['application/json'].schema.properties.data = physicalImport;
api.paths['/physical-imports/{importId}/revisions'].get.responses['200'].content['application/json'].schema.properties.data = {
  type: 'object', additionalProperties: false, required: ['items', 'nextBeforeVersion'], properties: {
    nextBeforeVersion: { type: ['integer', 'null'], minimum: 1 }, items: { type: 'array', maxItems: 100, items: {
      type: 'object', additionalProperties: false, required: ['version', 'source', 'createdAt'], properties: {
        version: { type: 'integer', minimum: 1 }, createdAt: { type: 'string', format: 'date-time' },
        source: physicalImport.properties.rows.items.properties.source } } } } };
api.paths['/physical-imports/{importId}/confirm'].post.responses['201'].content['application/json'].schema.properties.data = physicalImport;
api.paths['/class-sections/{classSectionId}/physical-imports'].get.responses['200'].content['application/json'].schema.properties.data = {
  type: 'object', additionalProperties: false, required: ['items', 'nextBeforeId'], properties: {
    nextBeforeId: { type: ['string', 'null'], format: 'uuid' }, items: { type: 'array', maxItems: 100, items: {
      type: 'object', additionalProperties: false, required: ['id', 'createdAt', 'rowCount', 'confirmedCount', 'pendingCount'], properties: {
        id: { type: 'string', format: 'uuid' }, createdAt: { type: 'string', format: 'date-time' }, rowCount: { type: 'integer', minimum: 1 },
        confirmedCount: { type: 'integer', minimum: 0 }, pendingCount: { type: 'integer', minimum: 0 } } } } } };
const directoryMetrics = { type: 'object', additionalProperties: false,
  required: ['students', 'submittedStudents', 'totalRecords', 'validRecords', 'invalidRecords', 'pendingTeacher',
    'pendingSupplement', 'technical', 'pendingAi', 'creditedSeconds'], properties: Object.fromEntries(
    ['students', 'submittedStudents', 'totalRecords', 'validRecords', 'invalidRecords', 'pendingTeacher',
      'pendingSupplement', 'technical', 'pendingAi', 'creditedSeconds'].map(key => [key, { type: 'integer', minimum: 0 }])) };
const directoryRowProperties = {
  id: { type: 'string', format: 'uuid' }, courseName: { type: 'string' }, teacherId: { type: 'string', format: 'uuid' },
  teacherName: { type: 'string' }, status: { type: 'string', enum: ['UPCOMING', 'ACTIVE'] }, enrollmentOpen: { type: 'boolean' },
  checkInWindowMode: { type: 'string' }, checkInStartDate: { type: ['string', 'null'], format: 'date' },
  checkInEndDate: { type: ['string', 'null'], format: 'date' }, dailyStartTime: { type: ['string', 'null'] },
  dailyEndTime: { type: ['string', 'null'] }, courseTargetSeconds: { type: ['integer', 'null'], minimum: 0 },
  generalTargetSeconds: { type: ['integer', 'null'], minimum: 0 }, currentMembers: directoryMetrics, removedMembers: directoryMetrics,
  completedStudents: { type: ['integer', 'null'], minimum: 0 }, completionRate: { type: ['number', 'null'], minimum: 0, maximum: 100 } };
api.paths['/admin/course-directory'].get.responses['200'].content['application/json'].schema.properties.data = {
  type: 'object', additionalProperties: false, required: ['generatedAt', 'semester', 'summary', 'rows'], properties: {
    generatedAt: { type: 'string', format: 'date-time' }, semester: { type: ['object', 'null'], additionalProperties: false,
      required: ['id', 'displayName'], properties: { id: { type: 'string', format: 'uuid' }, displayName: { type: 'string' } } },
    summary: { type: 'object', additionalProperties: false, required: ['courses', 'students', 'teachers'], properties:
      Object.fromEntries(['courses', 'students', 'teachers'].map(key => [key, { type: 'integer', minimum: 0 }])) },
    rows: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: Object.keys(directoryRowProperties), properties: directoryRowProperties } } } };
api.paths['/admin/class-sections/{classSectionId}/physical-summary'].get.responses['200'].content['application/json'].schema.properties.data = {
  type: 'object', additionalProperties: false,
  description: 'Confirmed current official roster rows only. Unresolved registration rows stay separate; approved exemption takes precedence over raw history. This does not authorize settlement.',
  required: ['classSectionId', 'generatedAt', 'available', 'rosterVersion', 'sourceRowCount', 'recordedCount',
    'exemptCount', 'notRecordedCount', 'unresolvedRegistrationCount'], properties: {
    classSectionId: { type: 'string', format: 'uuid' }, generatedAt: { type: 'string', format: 'date-time' },
    available: { type: 'boolean' }, rosterVersion: { type: ['integer', 'null'], minimum: 1 },
    ...Object.fromEntries(['sourceRowCount', 'recordedCount', 'exemptCount', 'notRecordedCount', 'unresolvedRegistrationCount']
      .map(key => [key, { type: ['integer', 'null'], minimum: 0, maximum: 500 }])) } };
for (const purpose of ['roster', 'physical']) {
  const operation = api.paths[`/class-sections/{classSectionId}/ocr-${purpose}-batches`].post;
  operation.requestBody = { required: true, content: { 'multipart/form-data': { schema: {
    type: 'object', additionalProperties: false, required: ['pages'], properties: { pages: {
      type: 'array', minItems: 1, maxItems: 1000, items: { type: 'string', format: 'binary' },
      description: 'Private PNG/JPEG/WebP original pages; combined file bytes at most 104857600. Recognition is not started by intake.' } } } } } };
  operation.responses['201'].content['application/json'].schema.properties.data = {
    type: 'object', additionalProperties: false,
    required: ['id', 'classSectionId', 'purpose', 'createdAt', 'pageCount', 'totalBytes', 'recognitionStatus', 'pages'], properties: {
      id: { type: 'string', format: 'uuid' }, classSectionId: { type: 'string', format: 'uuid' },
      purpose: { const: purpose.toUpperCase() }, createdAt: { type: 'string', format: 'date-time' },
      pageCount: { type: 'integer', minimum: 1, maximum: 1000 }, totalBytes: { type: 'integer', minimum: 1, maximum: 104857600 },
      recognitionStatus: { const: 'NOT_STARTED' }, pages: { type: 'array', minItems: 1, maxItems: 1000, items: {
        type: 'object', additionalProperties: false, required: ['id', 'sha256', 'sizeBytes', 'mimeType'], properties: {
          id: { type: 'string', format: 'uuid' }, sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          sizeBytes: { type: 'integer', minimum: 1, maximum: 104857600 }, mimeType: { enum: ['image/png', 'image/jpeg', 'image/webp'] } } } } } };
}
const ocrBatchProperties = { id: { type: 'string', format: 'uuid' }, classSectionId: { type: 'string', format: 'uuid' },
  purpose: { enum: ['ROSTER', 'PHYSICAL'] }, createdAt: { type: 'string', format: 'date-time' }, totalBytes: { type: 'integer', minimum: 1, maximum: 104857600 } };
const ocrPageProperties = { id: { type: 'string', format: 'uuid' }, sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  sizeBytes: { type: 'integer', minimum: 1, maximum: 104857600 }, mimeType: { enum: ['image/png', 'image/jpeg', 'image/webp'] } };
const ocrAttemptProperties = { attempt: { type: 'integer', minimum: 1 }, outcome: { enum: ['SUCCEEDED', 'FAILED'] },
  errorCode: { type: ['string', 'null'] }, createdAt: { type: 'string', format: 'date-time' } };
const ocrAttempt = { type: ['object', 'null'], additionalProperties: false, required: Object.keys(ocrAttemptProperties), properties: ocrAttemptProperties };
const ocrList = api.paths['/class-sections/{classSectionId}/ocr-batches'].get;
ocrList.parameters = ocrList.parameters.filter(parameter => parameter.in !== 'query').concat([
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
  { name: 'beforeId', in: 'query', schema: { type: 'string', format: 'uuid' } }]);
ocrList.responses['200'].content['application/json'].schema.properties.data = { type: 'object', additionalProperties: false,
  required: ['items', 'nextBeforeId'], properties: { nextBeforeId: { type: ['string', 'null'], format: 'uuid' },
    items: { type: 'array', maxItems: 100, items: { type: 'object', additionalProperties: false,
      required: [...Object.keys(ocrBatchProperties), 'pageCount'], properties: { ...ocrBatchProperties, pageCount: { type: 'integer', minimum: 1, maximum: 1000 } } } } } };
api.paths['/ocr-batches/{batchId}'].get.responses['200'].content['application/json'].schema.properties.data = {
  type: 'object', additionalProperties: false, required: [...Object.keys(ocrBatchProperties), 'pages'], properties: {
    ...ocrBatchProperties, pages: { type: 'array', minItems: 1, maxItems: 1000, items: {
      type: 'object', additionalProperties: false, required: [...Object.keys(ocrPageProperties), 'latestAttempt'],
      properties: { ...ocrPageProperties, latestAttempt: ocrAttempt } } } } };
const sourceReadProperties = { batchId: { type: 'string', format: 'uuid' }, pageId: { type: 'string', format: 'uuid' },
  sha256: ocrPageProperties.sha256, sizeBytes: ocrPageProperties.sizeBytes, mimeType: ocrPageProperties.mimeType,
  fileBase64: { type: 'string', contentEncoding: 'base64', maxLength: 139810136 } };
api.paths['/ocr-batches/{batchId}/pages/{pageId}/source'].get.responses['200'].content['application/json'].schema.properties.data = {
  type: 'object', additionalProperties: false, required: Object.keys(sourceReadProperties), properties: sourceReadProperties };
const ocrCellProperties = { text: { type: 'string', maxLength: 16384 },
  ...Object.fromEntries(['rowStart', 'rowEnd', 'columnStart', 'columnEnd'].map(key => [key, { type: 'integer', minimum: 0, maximum: 100000 }])),
  confidence: { type: ['number', 'null'], minimum: 0, maximum: 100 }, polygon: { type: 'array', minItems: 4, maxItems: 4,
    items: { type: 'object', additionalProperties: false, required: ['x', 'y'], properties: { x: { type: 'integer', minimum: 0, maximum: 100000 }, y: { type: 'integer', minimum: 0, maximum: 100000 } } } } };
const ocrEvidenceProperties = { provider: { const: 'TENCENT_TABLE_V3' }, requestId: { type: 'string', minLength: 1, maxLength: 128 },
  sourceSha256: ocrPageProperties.sha256, requiresTeacherConfirmation: { const: true }, tables: { type: 'array', minItems: 1, maxItems: 32,
    items: { type: 'object', additionalProperties: false, required: ['cells'], properties: { cells: { type: 'array', minItems: 1, maxItems: 32000,
      items: { type: 'object', additionalProperties: false, required: Object.keys(ocrCellProperties), properties: ocrCellProperties } } } } } };
api.paths['/ocr-batches/{batchId}/pages/{pageId}/recognition'].get.responses['200'].content['application/json'].schema.properties.data = {
  type: 'object', additionalProperties: false, required: ['batchId', 'pageId', 'latestAttempt'], properties: {
    batchId: { type: 'string', format: 'uuid' }, pageId: { type: 'string', format: 'uuid' }, latestAttempt: {
      type: ['object', 'null'], additionalProperties: false, required: [...Object.keys(ocrAttemptProperties), 'evidence'],
      properties: { ...ocrAttemptProperties, evidence: { type: ['object', 'null'], additionalProperties: false,
        required: Object.keys(ocrEvidenceProperties), properties: ocrEvidenceProperties } } } } };
const ocrJobProperties = { id: { type: 'string', format: 'uuid' }, batchId: { type: 'string', format: 'uuid' },
  pageId: { type: 'string', format: 'uuid' }, status: { enum: ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED'] },
  version: { type: 'integer', minimum: 1 }, expectedAttempt: { type: 'integer', minimum: 0 },
  resultAttempt: { type: ['integer', 'null'], minimum: 1 }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } };
for (const [route, method, status] of [['/ocr-batches/{batchId}/pages/{pageId}/recognition', 'post', '201'], ['/ocr-jobs/{jobId}', 'get', '200']])
  api.paths[route][method].responses[status].content['application/json'].schema.properties.data = {
    type: 'object', additionalProperties: false, required: Object.keys(ocrJobProperties), properties: ocrJobProperties };
const draftRow = { type: 'object', additionalProperties: false, required: ['id', 'source', 'values', 'ocrIssues', 'reviewedAgainstSource'], properties: {
  id: { type: 'string', format: 'uuid' }, values: draftValues, reviewedAgainstSource: { type: 'boolean' },
  source: { type: 'object', additionalProperties: false, required: ['pageId', 'attempt', 'tableIndex', 'sourceRow', 'evidence'], properties: {
    pageId: { type: 'string', format: 'uuid' }, attempt: { type: 'integer', minimum: 1 }, tableIndex: { type: 'integer', minimum: 0 },
    sourceRow: { type: 'integer', minimum: 0 }, evidence: { type: 'object', additionalProperties: false, properties: Object.fromEntries(draftFields.map(field =>
      [field, { type: 'array', items: { type: 'integer', minimum: 0 } }])) } } },
  ocrIssues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['field', 'code'], properties: {
    field: { enum: draftFields }, code: { type: 'string' } } } } } };
const draftResponse = { type: 'object', additionalProperties: false,
  required: ['batchId', 'classSectionId', 'purpose', 'version', 'createdAt', 'selections', 'rows', 'isFormal', 'pendingReviewCount'], properties: {
    batchId: { type: 'string', format: 'uuid' }, classSectionId: { type: 'string', format: 'uuid' }, purpose: { enum: ['ROSTER', 'PHYSICAL'] },
    version: { type: 'integer', minimum: 1 }, createdAt: { type: 'string', format: 'date-time' },
    selections: { type: 'array', minItems: 1, maxItems: 1000, items: draftSelection }, rows: { type: 'array', minItems: 1, maxItems: 500, items: draftRow },
    isFormal: { const: false }, pendingReviewCount: { type: 'integer', minimum: 0, maximum: 500 } } };
const draftGet = api.paths['/ocr-batches/{batchId}/draft'].get;
draftGet.parameters = draftGet.parameters.filter(p => p.in !== 'query').concat([{ name: 'version', in: 'query', required: false,
  schema: { type: 'integer', minimum: 1, maximum: 2147483647 }, description: 'Omit for latest; an explicit version reads an immutable historical draft.' }]);
for (const [route, method, status] of [['/ocr-batches/{batchId}/draft', 'get', '200'], ['/ocr-batches/{batchId}/draft', 'post', '201'],
  ['/ocr-batches/{batchId}/draft/revisions', 'post', '201']]) {
  api.paths[route][method].responses[status].content['application/json'].schema.properties.data = draftResponse;
  api.paths[route][method].description = 'Teacher-only OCR draft. All source pages and latest successful attempts are required at creation. Review acknowledgement never confirms a formal roster or physical result. Original rows and evidence remain immutable; revisions edit values and review flags only.';
}
const physicalConfirmationRow = { type: 'object', additionalProperties: false,
  required: ['rowId', 'enrollmentId', 'runType', 'elapsedSeconds', 'testedOn', 'issues', 'confirmed', 'resultVersion', 'currentResultVersion'], properties: {
    rowId: { type: 'string', format: 'uuid' }, enrollmentId: { type: ['string', 'null'], format: 'uuid' }, runType: { type: 'string' },
    elapsedSeconds: { type: ['integer', 'null'], minimum: 0, maximum: 9007199254740991 }, testedOn: { type: 'string' },
    issues: { type: 'array', items: { type: 'string' } }, confirmed: { type: 'boolean' }, resultVersion: { type: ['integer', 'null'], minimum: 1 },
    currentResultVersion: { type: 'integer', minimum: 0 } } };
for (const [method, status] of [['get', '200'], ['post', '201']]) {
  const operation = api.paths['/ocr-batches/{batchId}/physical-confirmations'][method];
  operation.description = 'Responsible teacher physical OCR confirmation. Re-evaluate all rows to detect duplicate identities; selected rows require explicit source review and valid exact identity, project, time and date. Atomically append official result, student notification and immutable source link. Unselected rows remain pending. Confirmed working rows cannot be revised.';
  operation.responses[status].content['application/json'].schema.properties.data = { type: 'object', additionalProperties: false,
    required: ['batchId', 'draftVersion', 'pendingCount', 'rows'], properties: { batchId: { type: 'string', format: 'uuid' },
      draftVersion: { type: 'integer', minimum: 1 }, pendingCount: { type: 'integer', minimum: 0, maximum: 500 },
      rows: { type: 'array', minItems: 1, maxItems: 500, items: physicalConfirmationRow } } };
}
const ocrRosterRowProperties = { id: { type: 'string', format: 'uuid' }, sourceRowNumber: { type: 'integer', minimum: 1, maximum: 500 },
  studentNumber: { type: 'string', minLength: 1, maxLength: 32 }, fullName: { type: 'string', minLength: 1, maxLength: 100 },
  rawStudentNumber: { type: 'string' }, rawFullName: { type: 'string' }, ocrSource: draftRow.properties.source,
  ocrIssues: draftRow.properties.ocrIssues, duplicateIdentity: { type: 'boolean' } };
for (const [method, status] of [['get', '200'], ['post', '201']]) {
  const operation = api.paths['/ocr-batches/{batchId}/roster-confirmation'][method];
  operation.description = 'Responsible teacher confirms the entire latest reviewed paper roster. Preserve duplicate rows and original evidence; no account or membership is created. Confirmation selects the unified roster basis atomically. Source digest refers to the ordered source manifest, not an individual image.';
  operation.responses[status].content['application/json'].schema.properties.data = { type: 'object', additionalProperties: false,
    required: ['id', 'classSectionId', 'batchId', 'draftVersion', 'sourceManifestSha256', 'sourceRows', 'version', 'confirmedAt'], properties: {
      id: { type: 'string', format: 'uuid' }, classSectionId: { type: 'string', format: 'uuid' }, batchId: { type: 'string', format: 'uuid' },
      draftVersion: { type: 'integer', minimum: 1 }, sourceManifestSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      sourceRows: { type: 'array', minItems: 1, maxItems: 500, items: { type: 'object', additionalProperties: false,
        required: Object.keys(ocrRosterRowProperties), properties: ocrRosterRowProperties } },
      version: { type: 'integer', minimum: 1 }, confirmedAt: { type: 'string', format: 'date-time' } } };
}
const basisProperties = { classSectionId: { type: 'string', format: 'uuid' }, version: { type: 'integer', minimum: 0 },
  sourceKind: { enum: ['ELECTRONIC', 'OCR', null] }, rosterImportId: { type: ['string', 'null'], format: 'uuid' },
  ocrBatchId: { type: ['string', 'null'], format: 'uuid' }, confirmedRosterId: { type: ['string', 'null'], format: 'uuid' },
  rosterVersion: { type: ['integer', 'null'], minimum: 1 }, selectedAt: { type: ['string', 'null'], format: 'date-time' } };
for (const [method, status] of [['get', '200'], ['post', '201']]) {
  const operation = api.paths['/class-sections/{classSectionId}/roster-basis'][method];
  operation.description = 'Responsible teacher reads or selects a previously confirmed electronic/OCR roster snapshot. Selection requires current basis version and reason, retains immutable snapshots and membership, and appends basis history and audit. Archived semesters reject changes; closed courses require pre-close source. Version 0 indicates no basis.';
  operation.responses[status].content['application/json'].schema.properties.data = { type: 'object', additionalProperties: false,
    required: Object.keys(basisProperties), properties: basisProperties };
}
const snapshotList = api.paths['/class-sections/{classSectionId}/roster-basis/snapshots'].get;
snapshotList.parameters = snapshotList.parameters.filter(p => p.in !== 'query').concat([
  { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
  { name: 'beforeVersion', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 2147483647 } },
]);
const snapshotSummaryProperties = { id: { type: 'string', format: 'uuid' }, version: { type: 'integer', minimum: 1 },
  sourceKind: { enum: ['ELECTRONIC', 'OCR'] }, rosterImportId: { type: ['string', 'null'], format: 'uuid' },
  ocrBatchId: { type: ['string', 'null'], format: 'uuid' }, sourceVersion: { type: 'integer', minimum: 1 },
  sourceRowCount: { type: 'integer', minimum: 1, maximum: 500 }, confirmedAt: { type: 'string', format: 'date-time' }, selected: { type: 'boolean' } };
snapshotList.description = 'Responsible teacher lists immutable confirmed snapshot metadata, newest version first. selected reflects the current basis at read time. No roster rows or private media are included.';
snapshotList.responses['200'].content['application/json'].schema.properties.data = { type: 'object', additionalProperties: false,
  required: ['classSectionId', 'nextBeforeVersion', 'items'], properties: { classSectionId: { type: 'string', format: 'uuid' },
    nextBeforeVersion: { type: ['integer', 'null'], minimum: 1 }, items: { type: 'array', maxItems: 100, items: {
      type: 'object', additionalProperties: false, required: Object.keys(snapshotSummaryProperties), properties: snapshotSummaryProperties } } } };
const makeupProperties = { id: { type: 'string', format: 'uuid' }, classSectionId: { type: 'string', format: 'uuid' },
  enrollmentId: { type: 'string', format: 'uuid' }, ruleVersion: { type: 'integer', minimum: 1 },
  startsAt: { type: 'string', format: 'date-time' }, endsAt: { type: 'string', format: 'date-time' }, acceptedAt: { type: 'string', format: 'date-time' },
  version: { enum: [1, 2] }, windowState: { enum: ['SCHEDULED', 'OPEN', 'ENDED', 'REVOKED'] }, revocation: {
    type: ['object', 'null'], additionalProperties: false, required: ['revokedAt', 'reason'], properties: {
      revokedAt: { type: 'string', format: 'date-time' }, reason: { type: 'string', maxLength: 1000 } } } };
const makeupResponse = { type: 'object', additionalProperties: false, required: Object.keys(makeupProperties), properties: makeupProperties };
for (const route of ['/class-sections/{classSectionId}/makeup-windows', '/makeup-windows/{windowId}/revocation']) {
  api.paths[route].post.responses['201'].content['application/json'].schema.properties.data = makeupResponse;
  api.paths[route].post.description = 'Responsible teacher grants or revokes a specific member closing-period window. Does not alter existing sessions or credited time. WindowState is temporal metadata, not proof that a session may start; current membership, semester, course and system mode must still be checked.';
}
const makeupList = api.paths['/class-sections/{classSectionId}/makeup-windows'].get;
makeupList.parameters = makeupList.parameters.filter(p => p.in !== 'query').concat([
  { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
  { name: 'beforeId', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } },
]);
makeupList.responses['200'].content['application/json'].schema.properties.data = { type: 'object', additionalProperties: false,
  required: ['classSectionId', 'evaluatedAt', 'nextBeforeId', 'items'], properties: { classSectionId: { type: 'string', format: 'uuid' },
    evaluatedAt: { type: 'string', format: 'date-time' }, nextBeforeId: { type: ['string', 'null'], format: 'uuid' },
    items: { type: 'array', maxItems: 100, items: makeupResponse } } };
api.paths['/exercise-sessions'].post.description = 'Student starts a server-timed session. Before the published regular deadline use ordinary course windows; after it require an accepted, currently open, unrevoked makeup grant for this enrollment. Recheck current semester, active course and member, system mode and absence of another active session. Store the makeup source atomically and preserve actual server business date; grant expiry or revocation never rewrites an existing session.';
const ownMakeupList = api.paths['/enrollments/{enrollmentId}/makeup-windows'].get;
ownMakeupList.parameters = ownMakeupList.parameters.filter(p => p.in !== 'query').concat(makeupList.parameters.filter(p => p.in === 'query'));
ownMakeupList.description = 'Student reads only their own enrollment windows, including revoked and expired history. WindowState describes time and revocation only; session start separately checks current eligibility. Teacher grant and revocation create one localized in-app notification in the same idempotent transaction.';
ownMakeupList.responses['200'].content['application/json'].schema.properties.data = structuredClone(makeupList.responses['200'].content['application/json'].schema.properties.data);
ownMakeupList.responses['200'].content['application/json'].schema.properties.data.required.push('enrollmentId');
ownMakeupList.responses['200'].content['application/json'].schema.properties.data.properties.enrollmentId = { type: 'string', format: 'uuid' };
const semesterSwitchCheck = api.paths['/admin/semesters/{id}/switch-check'].get;
semesterSwitchCheck.parameters = semesterSwitchCheck.parameters.filter(p => p.in !== 'query').concat(api.paths['/admin/semesters'].get.parameters.filter(p => p.in === 'query'));
semesterSwitchCheck.description = 'SEMESTER_MANAGE read-only preflight, evaluated in organization timezone. Course details are paginated over the old current semester; totalCourseCount covers all its courses. Formal settlement source is UNAVAILABLE whenever old courses exist until that source is implemented. No archive, switch, grade change or invalidation occurs. Recheck all prerequisites transactionally before a future switch command.';
const semesterSummary = { type: 'object', additionalProperties: false, required: ['id', 'version', 'displayName', 'status', 'startDate', 'endDate'], properties: {
  id: { type: 'string', format: 'uuid' }, version: { type: 'integer', minimum: 1 }, displayName: { type: 'string' },
  status: { enum: ['UPCOMING', 'CURRENT', 'ARCHIVED'] }, startDate: { type: 'string', format: 'date' }, endDate: { type: 'string', format: 'date' } } };
const courseSettlementCheck = api.paths['/class-sections/{classSectionId}/settlement-check'].get.responses['200'].content['application/json'].schema.properties.data;
semesterSwitchCheck.responses['200'].content['application/json'].schema.properties.data = { type: 'object', additionalProperties: false,
  required: ['checkedAt', 'businessDate', 'timezone', 'target', 'current', 'ready', 'checks', 'totalCourseCount', 'courses', 'nextCursor'], properties: {
    checkedAt: { type: 'string', format: 'date-time' }, businessDate: { type: 'string', format: 'date' }, timezone: { type: 'string' },
    target: semesterSummary, current: { ...semesterSummary, type: ['object', 'null'] }, ready: { type: 'boolean' },
    checks: { type: 'array', items: courseSettlementCheck.properties.checks.items }, totalCourseCount: { type: 'integer', minimum: 0 },
    courses: { type: 'array', maxItems: 100, items: courseSettlementCheck }, nextCursor: { type: ['string', 'null'], format: 'uuid' } } };
schemas.V81CourseRulesInput.properties.templateId = { type: 'string', format: 'uuid', description: 'Required when publish=true; published same-organization template. Drafts may omit it. Existing published rules without provenance are preserved as legacy facts.' };
const fixedTemplateRules = { ruleSet: 'V8_1', totalTargetMinutes: 1200, minimumMinutesOptions: [30, 45, 60], defaultMinimumMinutes: 30,
  weeklyLimitOptions: [2, 3, 4], defaultWeeklyLimit: 3, maximumCreditedMinutes: 60, dailyLimit: 1,
  creditedUnit: 'WHOLE_MINUTE', supplementHours: 24, specialSupplementHours: 72, closingDays: 7 };
const templateResponse = { type: 'object', additionalProperties: false, required: ['id', 'version', 'displayName', 'rules', 'publishedAt'], properties: {
  id: { type: 'string', format: 'uuid' }, version: { type: 'integer', minimum: 1 }, displayName: { type: 'string', maxLength: 100 },
  rules: { const: fixedTemplateRules }, publishedAt: { type: 'string', format: 'date-time' } } };
api.paths['/rule-templates'].post.responses['201'].content['application/json'].schema.properties.data = templateResponse;
api.paths['/rule-templates/{id}'].get.responses['200'].content['application/json'].schema.properties.data = templateResponse;
api.paths['/rule-templates'].post.description = 'Only a super administrator may publish immutable consecutive versions of approved V8.1 rules. No arbitrary formula or rule parameters accepted. Idempotent with organization lock; existing course rules and historical credit facts do not change.';
const templateList = api.paths['/rule-templates'].get;
templateList.parameters = [
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
  { name: 'beforeVersion', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 2147483647 } },
];
templateList.responses['200'].content['application/json'].schema.properties.data = { type: 'object', additionalProperties: false,
  required: ['items', 'nextBeforeVersion'], properties: { items: { type: 'array', maxItems: 100, items: templateResponse },
    nextBeforeVersion: { type: ['integer', 'null'], minimum: 1 } } };
const ocrRevision = { type: 'object', additionalProperties: false,
  required: ['id','version','provider','region','timeoutMs','enabled','reason','actorUserId','createdAt'], properties: {
    id: { type:'string',format:'uuid' }, version: { type:'integer',minimum:1 },
    provider: { enum:['DISABLED','TENCENT_TABLE_V3'] }, region: { type:['string','null'] }, timeoutMs: { type:'integer',minimum:1000,maximum:60000 },
    enabled: { type:'boolean' }, reason: { type:'string' }, actorUserId: { type:'string',format:'uuid' }, createdAt: { type:'string',format:'date-time' } } };
const ocrServiceStatus = api.paths['/admin/review-services/ocr'].get;
ocrServiceStatus.description = 'SUPER only, including maintenance. Organization configuration and retained OCR job counts; connectivity and automatic-pass validation are not asserted. CVM role credentials remain outside this API. Deployment OCR worker enablement remains an independent execution gate.';
ocrServiceStatus.responses['200'].content['application/json'].schema.properties.data = { type:'object',additionalProperties:false,
  required:['scope','configurationSource','configuration','runtimeWorkerEnabled','executionEnabled','systemMode','credentialSource','providerConnectivity','automaticPassValidation','formalFactsRequireTeacherConfirmation','jobs','observedAt'],properties:{
    scope:{const:'ORGANIZATION'},configurationSource:{enum:['ADMIN_REVISION','DEPLOYMENT_ENVIRONMENT']},configuration:{type:'object',additionalProperties:false,
      required:['version','provider','region','timeoutMs','enabled'],properties:{version:{type:'integer',minimum:0},provider:{enum:['DISABLED','TENCENT_TABLE_V3']},
        region:{type:['string','null']},timeoutMs:{type:'integer',minimum:1000,maximum:60000},enabled:{type:'boolean'}}},
    runtimeWorkerEnabled:{type:'boolean'},executionEnabled:{type:'boolean'},systemMode:{enum:['NORMAL','MAINTENANCE']},credentialSource:{const:'CVM_ROLE'},
    providerConnectivity:{const:'UNVERIFIED'},automaticPassValidation:{const:'NOT_PROVIDED'},formalFactsRequireTeacherConfirmation:{const:true},
    jobs:{type:'object',additionalProperties:false,description:'Counts of all retained jobs, including failed jobs followed by successful retries; not a count of unresolved pages.',
      required:['queued','running','succeeded','failed','oldestWaitingAt','lastFinishedAt'],properties:{
        ...Object.fromEntries(['queued','running','succeeded','failed'].map(k=>[k,{type:'integer',minimum:0}])),
        oldestWaitingAt:{type:['string','null'],format:'date-time'},lastFinishedAt:{type:['string','null'],format:'date-time'}}},observedAt:{type:'string',format:'date-time'}}};
const ocrHistory = api.paths['/admin/review-services/ocr/revisions'].get;
ocrHistory.parameters.push({name:'limit',in:'query',schema:{type:'integer',minimum:1,maximum:100,default:20}},
  {name:'beforeVersion',in:'query',schema:{type:'integer',minimum:1,maximum:2147483647}});
ocrHistory.responses['200'].content['application/json'].schema.properties.data={type:'object',additionalProperties:false,required:['items','nextBeforeVersion'],
  properties:{items:{type:'array',maxItems:100,items:ocrRevision},nextBeforeVersion:{type:['integer','null'],minimum:1}}};
const ocrSave = api.paths['/admin/review-services/ocr/revisions'].post;
ocrSave.description='SUPER only, including maintenance. Append an immutable organization configuration with optimistic version and idempotency. DISABLED requires enabled=false and region=null. Tencent requires region. Pausing blocks new recognition jobs and claims; a configuration change makes previous in-flight results stale. Already dispatched provider requests may finish; source media, teaching facts, and student deadlines are unchanged.';
ocrSave.responses['201'].content['application/json'].schema.properties.data=ocrRevision;
const auditProjection = { type:'object',additionalProperties:false,
  required:['id','source','actorUserId','actorRoleSnapshot','actionType','targetType','targetId','requestId','outcome','reasonCode','safeMetadata','occurredAt'],properties:{
    id:{type:'string',format:'uuid'},source:{enum:['FOUNDATION','V81']},actorUserId:{type:['string','null'],format:'uuid'},
    actorRoleSnapshot:{type:['string','null'],description:'Stored actor role; SYSTEM identifies explicitly recorded system actions and has a null actorUserId. Missing historical provenance remains null.'},actionType:{type:'string'},targetType:{type:'string'},targetId:{type:['string','null'],format:'uuid'},
    requestId:{type:'string'},outcome:{type:['string','null']},reasonCode:{type:['string','null']},safeMetadata:{type:'object',additionalProperties:true},occurredAt:{type:'string',format:'date-time'} } };
const auditList=api.paths['/admin/audit-events'].get;
auditList.parameters=[{name:'limit',in:'query',schema:{type:'integer',minimum:1,maximum:50,default:50}},
  {name:'cursor',in:'query',schema:{type:'string',maxLength:2048}},{name:'source',in:'query',schema:{enum:['FOUNDATION','V81']}},
  ...['action','outcome','targetType'].map(name=>({name,in:'query',schema:{type:'string',maxLength:100,pattern:'\\S'}})),
  {name:'requestId',in:'query',schema:{type:'string',maxLength:64,pattern:'\\S'}},
  ...['actorUserId','targetId'].map(name=>({name,in:'query',schema:{type:'string',format:'uuid'}})),
  ...['startDate','endDate'].map(name=>({name,in:'query',schema:{type:'string',format:'date',pattern:'^\\d{4}-\\d{2}-\\d{2}$'}}))];
auditList.description='AUDIT_QUERY permission. Union of immutable foundation audit and V8.1 events; all filters apply before pagination, inclusive dates in organization timezone, maximum 50. Unknown operation/result strings are not remapped. V8.1 sources lacking stored actor role, outcome or reason return null; raw business facts are never returned, only version metadata. Server runtime-log ZIP remains a separate capability.';
auditList.responses['200'].content['application/json'].schema.properties.data={type:'object',additionalProperties:false,required:['items','timezone','nextCursor'],properties:{
  items:{type:'array',maxItems:50,items:auditProjection},timezone:{type:'string'},nextCursor:{type:['string','null'],maxLength:2048}}};
const auditDetail=api.paths['/admin/audit-events/{source}/{eventId}'].get;
auditDetail.parameters=auditDetail.parameters.map(p=>p.name==='source'?{...p,schema:{enum:['FOUNDATION','V81']}}:p);
auditDetail.responses['200'].content['application/json'].schema.properties.data=auditProjection;
const archiveCreate = api.paths['/admin/runtime-archives'].post;
api.paths['/me/account-deletion-challenges'].post.description = 'Student requests deletion OTP only at current verified email. Bound to user version and current session; 10-minute expiry, 60-second resend interval and maximum three requests in 15 minutes. Hash-only database storage; SMTP activation staged outside transaction. This challenge does not delete an account.';
api.paths['/me/account-deletion-challenges'].post.responses['201'].content['application/json'].schema.properties.data = {
  type: 'object', additionalProperties: false, required: ['challengeId', 'mode', 'expiresAt', 'version'], properties: {
    challengeId: { type: 'string', format: 'uuid' }, mode: { const: 'STUDENT_EMAIL_OTP' }, expiresAt: { type: 'string', format: 'date-time' },
    version: { type: 'integer', minimum: 1 } } };
api.paths['/admin/subadmins/{id}/permissions'].post.description = 'Only SUPER may replace the eight assignable permissions for an existing same-organization SUB administrator, including revoking all. Current session requests recheck stored permissions. Does not enable a disabled account or change login identity/password. Idempotent, expectedVersion and immutable change audit.';
api.paths['/admin/subadmins/{id}/permissions'].post.responses['201'].content['application/json'].schema.properties.data = {
  type: 'object', additionalProperties: false, required: ['id', 'permissions', 'version', 'updatedAt'], properties: {
    id: { type: 'string', format: 'uuid' }, permissions: schemas.V81SubadminPermissionsInput.properties.permissions,
    version: { type: 'integer', minimum: 2 }, updatedAt: { type: 'string', format: 'date-time' } } };
const archiveProjection = { type: 'object', additionalProperties: false,
  required: ['id', 'startDate', 'endDate', 'timezone', 'status', 'version', 'createdAt', 'updatedAt', 'expiresAt', 'byteLength', 'recordCount', 'sha256', 'failureCode', 'coverage'], properties: {
    id: { type: 'string', format: 'uuid' }, startDate: { type: 'string', format: 'date' }, endDate: { type: 'string', format: 'date' }, timezone: { type: 'string' },
    status: { enum: ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'] }, version: { type: 'integer', minimum: 1 },
    ...Object.fromEntries(['createdAt', 'updatedAt', 'expiresAt'].map(name => [name, { type: 'string', format: 'date-time' }])),
    byteLength: { type: ['integer', 'null'], minimum: 1 }, recordCount: { type: ['integer', 'null'], minimum: 0 },
    sha256: { type: ['string', 'null'], pattern: '^[a-f0-9]{64}$' }, failureCode: { type: ['string', 'null'] }, coverage: { const: 'AVAILABLE_SCOPED_HTTP_RECORDS_ONLY' } } };
for (const [route, method, status] of [['/admin/runtime-archives', 'post', '201'], ['/admin/runtime-archives/{id}', 'get', '200'], ['/admin/runtime-archives/{id}/cancellation', 'post', '201']])
  api.paths[route][method].responses[status].content['application/json'].schema.properties.data = archiveProjection;
api.paths['/admin/runtime-archives/{id}/download-url'].post.responses['201'].content['application/json'].schema.properties.data = {
  type: 'object', additionalProperties: false, required: ['downloadUrl', 'expiresAt'], properties: {
    downloadUrl: { type: 'string', format: 'uri-reference', description: 'Same-origin path; current bearer session required. Capability expires within 120 seconds.' },
    expiresAt: { type: 'string', format: 'date-time' } } };
archiveCreate.responses['202'] = archiveCreate.responses['201'];
delete archiveCreate.responses['201'];
archiveCreate.description = 'AUDIT_QUERY; durable private ZIP task scoped to requesting administrator and organization. Inclusive dates use organization timezone. Covers available scoped HTTP diagnostic records only; source unavailable fails explicitly. Task expires after 24 hours.';
const archiveContent = api.paths['/admin/runtime-archives/{id}/content'].get;
archiveContent.parameters.push({ name: 'capability', in: 'query', required: true, schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' } });
archiveContent.description = 'Authenticated binary download. Rechecks current AUDIT_QUERY permission, requester, session, job version and short-lived capability before returning the verified private ZIP. No JSON envelope.';
archiveContent.responses['200'] = { description: 'Private runtime ZIP', content: { 'application/zip': { schema: { type: 'string', format: 'binary' } } } };
for (const [route, status] of [['/admin/subadmin-identity-challenges','ACTIVE'], ['/admin/subadmin-identity-challenges/{id}/verify','VERIFIED']]) {
  const operation = api.paths[route].post;
  operation.description = 'SUPER only, NORMAL mode. Email OTP for subadministrator creation; bound to organization and requesting administrator. Ten-minute expiry, five incorrect attempts, one-time consumption by account creation. No OTP in response.';
  operation.responses['201'].content['application/json'].schema.properties.data = feedbackObject({
    id: { type: 'string', format: 'uuid' }, email: { type: 'string', format: 'email' }, status: { type: 'string', enum: [status] },
    version: { type: 'integer', minimum: 1 }, expiresAt: { type: 'string', format: 'date-time' } });
}
api.paths['/admin/subadmins'].post.description = 'SUPER only. Atomically consumes an unexpired verified identity challenge belonging to the same administrator and organization. Creates ACTIVE SUB with immutable normalized login account and mandatory first password change. Initial passwords need only be nonempty and equal.';
api.paths['/admin/subadmins'].post.responses['201'].content['application/json'].schema.properties.data = feedbackObject({
  id: { type: 'string', format: 'uuid' }, account: { type: 'string' }, name: { type: 'string' }, email: { type: 'string', format: 'email' },
  department: { type: ['string','null'] }, permissions: schemas.CreateVerifiedSubadminInput.properties.permissions,
  status: { type: 'string', enum: ['ACTIVE'] }, version: { type: 'integer', minimum: 1 }, updatedAt: { type: 'string', format: 'date-time' } });
api.paths['/admin/subadmins/{id}/profile'].post.description = 'SUPER only in NORMAL mode. Atomically updates same-organization SUB profile and permissions with expectedVersion. Login account, password and status are unchanged. A changed email requires a matching unexpired VERIFIED OTP challenge belonging to the same organization and requesting administrator; consumed once. An unchanged email must omit identityChallengeId. Empty permissions revoke all assignable access.';
api.paths['/admin/subadmins/{id}/profile'].post.responses['201'].content['application/json'].schema.properties.data = feedbackObject({
  ...api.paths['/admin/subadmins'].post.responses['201'].content['application/json'].schema.properties.data.properties,
  permissions: schemas.UpdateVerifiedSubadminInput.properties.permissions, status: { type: 'string', enum: ['ACTIVE','DISABLED'] } });
api.paths['/admin/subadmins/{id}/delete'].post.description = 'SUPER only in NORMAL mode; same-organization SUB only, expectedVersion and explicit completed responsibility handover required. Atomically removes current credentials, sessions, identity challenges, related encrypted receipts and profile. Preserves immutable historical subjects and business events. Replaying the same successful deletion returns its receipt.';
api.paths['/admin/subadmins/{id}/delete'].post.responses['201'].content['application/json'].schema.properties.data = feedbackObject({
  id:{type:'string',format:'uuid'},deleted:{type:'boolean',const:true},deletedAt:{type:'string',format:'date-time'},version:{type:'integer',minimum:1} });
api.paths['/teacher/courses'].post.description = 'Active responsible teacher in NORMAL mode creates an unpublished course and teaching section in the current organization semester. Uses UUID v7 identifiers, closed enrollment and unavailable check-in window until configured. Creation is atomic and idempotent.';
api.paths['/class-sections/{classSectionId}/v81-rules'].post.description = 'Responsible teacher saves draft rules or publishes an ACTIVE current-semester section after template and achievable-capacity validation. First successful publication atomically opens enrollment and records ENROLLMENT_OPENED when needed. Rejected publication leaves enrollment closed; published rules and schedules are immutable.';
api.paths['/teacher/courses'].post.responses['201'].content['application/json'].schema.properties.data = feedbackObject({
  id:{type:'string',format:'uuid'},courseId:{type:'string',format:'uuid'},semesterId:{type:'string',format:'uuid'},teacherId:{type:'string',format:'uuid'},
  displayName:{type:'string',minLength:1,maxLength:200},version:{type:'integer',const:1} });
api.paths['/class-sections/{classSectionId}/course-invites/revocations'].post.description = 'Active responsible teacher in NORMAL mode revokes the exact supplied invite in the same organization and section. Does not issue a replacement or remove established enrollments. Invite checks reject pending join capabilities after revocation. Atomic, idempotent, audited without storing tokens in event facts.';
api.paths['/class-sections/{classSectionId}/course-invites/revocations'].post.responses['201'].content['application/json'].schema.properties.data=feedbackObject({
  id:{type:'string',format:'uuid'},classSectionId:{type:'string',format:'uuid'},status:{type:'string',const:'REVOKED'},version:{type:'integer',minimum:2},revokedAt:{type:'string',format:'date-time'} });
const {addTeacherSemestersContract}=await import('./teacher-semesters-contract.mjs');
addTeacherSemestersContract(api);
const {addRecognitionAdjustmentContract}=await import('./recognition-adjust-contract.mjs');
addRecognitionAdjustmentContract(api);
fs.writeFileSync(file, stringify(api));
