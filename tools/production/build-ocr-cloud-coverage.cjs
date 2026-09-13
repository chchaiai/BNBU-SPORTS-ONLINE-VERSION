// Evidence index, not a replacement for cloud acceptance or response-schema validation.
const fs=require('node:fs'),assert=require('node:assert/strict'),yaml=require('../../backend/node_modules/yaml');
const dir='evidence/ocr-triplatform-20260913/';
const doc=yaml.parse(fs.readFileSync('docs/backend-contracts/openapi.yaml','utf8'));
const operations=[];
for(const [path,item] of Object.entries(doc.paths))for(const [method,operation]of Object.entries(item))if(operation.operationId)
 operations.push({operationId:operation.operationId,method:method.toUpperCase(),path,cloudEvidence:[]});
function add(id,file,kind){const op=operations.find(o=>o.operationId===id);assert.ok(op,id);if(!op.cloudEvidence.some(e=>e.file===file&&e.kind===kind))op.cloudEvidence.push({file,kind});}
for(const file of ['cloud-read-regression.json','cloud-read-extended.json','cloud-utc-read-regression.json']){
const reads=JSON.parse(fs.readFileSync(dir+file));
for(const check of reads.checks.filter(c=>c.pass)){
 const path=check.path.split('?')[0],op=operations.find(o=>o.method===(check.method??'GET')&&new RegExp('^'+o.path.replace(/\{[^}]+\}/g,'[^/]+')+'$').test(path));assert.ok(op,path);
 add(op.operationId,file,check.status>=200&&check.status<300?'SUCCESS_OBSERVED':'DENIAL_OBSERVED');
}
}
const groups={
 'cloud-subadmin-governance.json':['listV81Subadmins','createV81VerifiedSubadmin','setV81SubadminStatus','setV81SubadminPermissions','deleteV81Subadmin'],
 'cloud-utc-public-manual-enrollment.json':['issueJoinCapability','manuallyEnrollStudent'],
 'cloud-ocr-http.json':['createV81OcrRosterBatch','createV81OcrPhysicalBatch','getV81OcrPageSource','getV81OcrPageRecognition','createV81OcrJob','createV81OcrDraft','reviseV81OcrDraft','confirmV81OcrPhysicalRows','confirmV81OcrRoster','saveV81OcrService'],
 'cloud-media-exercise.json':['startExerciseSession','pauseExerciseSession','resumeExerciseSession','finishExerciseSession','createExerciseRecordDraft','initiateMediaUpload','confirmMediaUpload','bindMediaEvidence','getMediaEvidence','submitExerciseRecord','createMediaAccessUrl','getExerciseRecordEvidenceContext'],
 'cloud-manual-review.json':['reviewV81Record'],
 'cloud-manual-review-readback.json':['getV81RecordWorkflow'],
 'cloud-closure-applications.json':['createExemptionApplication','submitExemptionApplication','reviewExemptionApplication','closeClassSection'],
 'cloud-history-lifecycle.json':['completeCurrentStudentProfile','saveV81ExerciseGoal','createClassSection','updateClassSection','publishV81RuleTemplate','saveV81CourseRules','createCourseInvite','issueMemberJoinCapability','joinClassSectionWithInvite','saveV81HistorySettings','createV81HistoricalSession','deleteV81Course','getExerciseSession'],
 'cloud-student-erasure.json':['deleteV81StudentAccount'],
 'cloud-semester-governance.json':['createV81Semester','updateV81Semester','getV81SemesterSwitchCheck']
 ,'cloud-notification-auth.json':['markNotificationRead','updateCurrentUserPreferences','refreshSession','logoutSession']
 ,'cloud-internal-grades.json':['appendV81FinalGrade','listV81FinalGrades']
 ,'cloud-own-password.json':['changeOwnV81Password']
 ,'cloud-makeup-windows.json':['createV81MakeupWindow','revokeV81MakeupWindow']
 ,'cloud-session-reconcile.json':['reconcileExerciseSession','cancelExerciseSession']
 ,'cloud-record-correction.json':['correctV81Record','getExerciseRecord','listExerciseRecordReviews']
 ,'cloud-record-draft.json':['updateExerciseRecordDraft','discardExerciseRecord']
 ,'cloud-client-diagnostics.json':['reportClientError','getAuditLog']
 ,'cloud-invite-revocation.json':['previewCourseInvite','revokeV81CourseInvite']
 ,'cloud-membership-restore.json':['removeEnrollment','restoreEnrollment']
 ,'cloud-import-readback.json':['getV81OcrJob','getCurrentRosterImport']
 ,'cloud-teacher-course.json':['createV81TeacherCourse']
 ,'cloud-teacher-import.json':['previewV81TeacherImport','confirmV81TeacherImport','deleteV81TeacherAccount']
 ,'cloud-system-mode.json':['changeV81SystemMode']
 ,'cloud-unsettled-corrections.json':['listV81PhysicalResults']
 ,'cloud-certification-revisions.json':['getExemptionApplication','updateExemptionApplication','listV81RecognitionRevisions','adjustV81Recognition','revokeV81Certification']
 ,'cloud-manual-config.json':['setV81ManualMode']
 ,'cloud-push-registration.json':['registerPushDevice','unregisterPushDevice']
 ,'cloud-roster-rollback.json':['selectV81RosterBasis','rollbackRosterImport']
 ,'cloud-roster-difference.json':['confirmRosterAlignmentResult','resolveRosterAlignmentResult','reopenRosterAlignmentResult']
 ,'cloud-swim-batch.json':['acceptV81SwimIntake','getV81SwimIntake','batchReviewExerciseRecords']
 ,'cloud-supplement-maintenance.json':['reviewExerciseRecord']
 ,'cloud-manual-physical.json':['appendV81PhysicalResult']
 ,'cloud-utc-settlement-corrections.json':['confirmV81Settlement','getV81SettlementReport','exportV81SettlementReport','correctV81PhysicalResult','correctV81FinalGrade']
 ,'cloud-settlement-corrections.json':['confirmV81Settlement','getV81SettlementReport','exportV81SettlementReport','correctV81PhysicalResult','correctV81FinalGrade']
 ,'cloud-runtime-archive.json':['createV81RuntimeArchive','getV81RuntimeArchive','createV81RuntimeArchiveDownload','downloadV81RuntimeArchive','cancelV81RuntimeArchive']
 ,'cloud-supplement-flow.json':['submitV81Supplement','getV81SupplementClock']
 ,'cloud-endurance-rules.json':['createV81EnduranceRule','updateV81EnduranceRule','deleteV81EnduranceRule']
 ,'cloud-help-feedback.json':['createV81HelpArticle','saveV81HelpArticle','getV81HelpArticle','getV81StudentHelpArticle','createFeedback','handleV81Feedback','getV81FeedbackDetail','getV81StudentFeedbackHistory','getFeedback']
};
for(const [file,ids]of Object.entries(groups)){const evidence=JSON.parse(fs.readFileSync(dir+file));assert.ok(evidence.allChecksCompleted===true||file==='cloud-media-exercise.json'&&evidence.results.length===3,file);for(const id of ids)add(id,file,'SUCCESS_OBSERVED');}
add('switchV81Semester','cloud-semester-governance.json','DENIAL_OBSERVED');
const emailBinding=JSON.parse(fs.readFileSync(dir+'student-email-binding-readback.json'));
const emailRequest=JSON.parse(fs.readFileSync(dir+'student-email-challenge-browser.json'));
assert.equal(emailRequest.requestAcceptedByUi,true);
assert.equal(emailBinding.authorizedEmailMatches,true);
assert.ok(emailBinding.emailVerifiedAt);
assert.equal(emailBinding.browserReachedAuthenticatedHome,true);
add('requestCurrentUserEmailChallenge','student-email-challenge-browser.json','SUCCESS_OBSERVED');
add('verifyCurrentUserEmailChallenge','student-email-binding-readback.json','SUCCESS_OBSERVED');
const legacyCorrection=JSON.parse(fs.readFileSync(dir+'cloud-legacy-correction.json'));
assert.equal(legacyCorrection.allChecksCompleted,true);
assert.ok(legacyCorrection.checks.some(c=>c.code==='SCORE_CORRECTION_NOT_ALLOWED'&&c.disabledGateObserved));
add('openStudentScoreCorrection','cloud-legacy-correction.json','DENIAL_OBSERVED');
add('confirmV81Settlement','cloud-record-correction.json','DENIAL_OBSERVED');
for(const id of ['correctV81PhysicalResult','correctV81FinalGrade'])add(id,'cloud-unsettled-corrections.json','DENIAL_OBSERVED');
for(const id of ['reopenExerciseRecordReview','reviewExerciseRecord','batchReviewExerciseRecords'])add(id,'cloud-review-boundaries.json','DENIAL_OBSERVED');
const deferred=JSON.parse(fs.readFileSync(dir+'cloud-deferred-boundaries.json'));assert.equal(deferred.allChecksCompleted,true);for(const c of deferred.checks)add(c.operationId,'cloud-deferred-boundaries.json','DENIAL_OBSERVED');
const closed=JSON.parse(fs.readFileSync(dir+'cloud-closed-operations.json'));
for(const check of closed.checks.filter(c=>c.disabledGateObserved))add(check.operationId,'cloud-closed-operations.json','DENIAL_OBSERVED');
const closedExisting=JSON.parse(fs.readFileSync(dir+'cloud-disabled-existing.json'));
for(const check of closedExisting.checks.filter(c=>c.disabledGateObserved))add(check.operationId,'cloud-disabled-existing.json','DENIAL_OBSERVED');
const electronic=JSON.parse(fs.readFileSync(dir+'cloud-electronic-imports.json'));
if(electronic.checks.includes('ELECTRONIC_CONFIRM_ALIGN_DETAIL_STUDENT_MATCH'))for(const id of ['createRosterImport','getV81RosterSource','confirmV81Roster','getV81RosterConfirmation','alignRosterImport','getRosterImport','listRosterEntries','previewV81RosterRegistration','getRosterAlignmentResult'])add(id,'cloud-electronic-imports.json','SUCCESS_OBSERVED');
const subadminProfile=JSON.parse(fs.readFileSync(dir+'subadmin-profile-regression.json'));
assert.equal(subadminProfile.result,'PASS');assert.equal(subadminProfile.cleanup,'TEST_ACCOUNT_DELETED');
assert.ok(subadminProfile.checks.some(c=>c.path.endsWith('/profile')&&c.status===201));
add('updateV81VerifiedSubadmin','subadmin-profile-regression.json','SUCCESS_OBSERVED');
const physicalCsv=JSON.parse(fs.readFileSync(dir+'cloud-physical-csv-revision.json'));assert.equal(physicalCsv.result,'PASS');
for(const id of ['createV81PhysicalImport','getV81PhysicalImport','reviseV81PhysicalImport','listV81PhysicalImportRevisions','confirmV81PhysicalImport','getV81PhysicalImportSource'])add(id,'cloud-physical-csv-revision.json','SUCCESS_OBSERVED');
assert.ok(electronic.checks.includes('XLSX_SELECTED_SHEET_COS_SOURCE_CONFIRM_REPLAY_STUDENT_RESULT'));add('createV81PhysicalXlsxImport','cloud-electronic-imports.json','SUCCESS_OBSERVED');
const summary={total:operations.length,successObserved:operations.filter(o=>o.cloudEvidence.some(e=>e.kind==='SUCCESS_OBSERVED')).length,denialOnlyObserved:operations.filter(o=>o.cloudEvidence.length&&!o.cloudEvidence.some(e=>e.kind==='SUCCESS_OBSERVED')).length,noCloudEvidence:operations.filter(o=>!o.cloudEvidence.length).length};
const report={check:'CLOUD_OPERATION_EVIDENCE_INDEX',generatedAt:new Date().toISOString(),productionBaseSourceCommit:'a46fbe41f44b0724c00ee6d91944f5fdfc58cdf0',productionPatchCommit:'619cfc1ee2e9315c0f89f9f2cc158f8ba3ed030b',productionRelease:'student-local-player-20260913',studentLocalPlayerCommit:'c7566129b7ba157b1325cc668dd617b8d5687d26',studentVideoPatchCommit:'cfc916c91109153edb087a995dfd2676ae41c261',studentReceiptPatchCommit:'7009e6a2428145591e5806371dc31fea9b499844',submissionAtomicPatchCommit:'d0f3150f514f3f862ec5196063006a033931866b',portalPatchCommits:['867cf39b','7ba41895','9592c912'],studentUiPatchCommit:'aa832e80',studentRecognitionCopyCommit:'365b93aa',limitations:['Pre-UTC time-sensitive evidence requires revalidation; inspect individual evidence timestamps and release metadata for later checks','Observed successful paths do not prove all branches, page interaction or full cloud schema conformance','Historic snapshots precede intentional synthetic student deletion; do not treat them as current fixture state','Local runtime conformance is indexed separately and is not cloud evidence'],summary,operations};
fs.writeFileSync(dir+'cloud-operation-coverage.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(summary));
