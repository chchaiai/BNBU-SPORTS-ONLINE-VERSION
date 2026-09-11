import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve('docs/implementation/evidence/bugfix-20260910');
const logs=[
 'bugfix-fragment-unit','bugfix-fragment-docker-suites','bugfix-fragment-lint',
 'bugfix-final-backend-typecheck','bugfix-final-portal-retest','bugfix-final-student-smoke','bugfix-final-student-unit',
 'bugfix-final-contract-schema','bugfix-final-openapi-lint','bugfix-contract-parity',
 'bugfix-new-course-browser','bugfix-join-browser','bugfix-applications-browser',
 'bugfix-1000m-browser','bugfix-1000m-join-browser','bugfix-maintenance-browser',
 'bugfix-runtime-archive-browser','bugfix-portal-browser','bugfix-mp4-camera-qr-final',
 'bugfix-student-policy-browser-retest','bugfix-teacher-delete-browser','bugfix-student-remove-browser-pass',
 'bugfix-teacher-real-video','bugfix-fragment-mp4-submit',
 'bugfix-production-smoke-local-media-final','bugfix-production-smoke-local-archives-retest',
 // Keep initial failures alongside successful retests; never replace them with a pass.
 'bugfix-real-30min-camera','bugfix-native-mp4-submit','bugfix-native-mp4-diagnostic',
 'bugfix-student-remove-browser-final','bugfix-final-docker-suites',
 'bugfix-real-30min-mp4','bugfix-release-backend-build','bugfix-release-portal-build',
 'bugfix-release-runtime-smoke','bugfix-production-deployment','bugfix-production-smoke',
 'bugfix-real-30min-teacher-video','bugfix-real-30min-teacher-review-final','bugfix-real-30min-student-credit',
 'bugfix-production-deployment-first-rollback','bugfix-production-smoke-media','bugfix-production-smoke-archives',
 'bugfix-production-static','bugfix-production-policy','bugfix-production-final-state','bugfix-nginx-syntax',
];
const images=[
 '1000m-exemption-approved','admin-create-footer','admin-notifications','mobile-video',
 'student-enrollment-removed','student-progress-without-score-button','student-teacher-minimum-45',
 'teacher-application-list','teacher-delete-retry','teacher-notifications',
 'teacher-original-application-images','teacher-real-image','teacher-real-video',
];
const index=[];
function copy(source,name,text){
 if(!fs.existsSync(source))return;
 const bytes=fs.readFileSync(source);
 if(text && /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|(?:q-signature|X-Amz-Signature)=|"(?:accessToken|refreshToken|password|secretKey)"\s*:\s*"[^"\s]+"/i.test(bytes.toString()))throw new Error(`Private material detected in ${name}; archive stopped`);
 fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),bytes);
 index.push({file:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
for(const name of logs)copy(`.local/${name}.log`,`logs/${name}.log`,true);
for(const name of images)copy(`.local/bugfix-evidence/${name}.png`,`screenshots/${name}.png`,false);
copy('.local/v81-browser-state/application-real-upload.png','screenshots/student-three-application-images.png',false);
copy('.local/v81-browser-state/runtime-archive-browser.png','screenshots/runtime-archive-download.png',false);
copy('.local/local-validation.json','local-validation.json',true);
copy('.local/bugfix-nginx-release.conf','production-nginx.conf',true);
fs.writeFileSync(path.join(root,'index.json'),JSON.stringify({scope:'Local synthetic test evidence; production status is stated in the handoff, not inferred from this index.',files:index},null,2)+'\n');
console.log(JSON.stringify({check:'BUGFIX_EVIDENCE_ARCHIVE',files:index.length,result:'PASS'}));
