import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import Ajv from '../../backend/node_modules/ajv/dist/2020.js';
import addFormats from '../../backend/node_modules/ajv-formats/dist/index.js';
import {seedExerciseSessionStudent} from '../../backend/test/helpers/exercise-session.ts';

export async function probeStudentSettlement({request,baseUrl,prisma,fixture,student,token,teacherToken,adminToken}) {
  const path=`/student/enrollments/${student.enrollmentId}/settlement-result`;
  const result=await request(path,token);
  assert.equal(result.available,true);assert.equal(result.reportVersion,2);
  assert.equal(result.result.progress.creditedSeconds,0);assert.equal(result.result.progress.invalidActualSeconds,3600);
  assert.equal(result.result.progress.remainingSeconds,72000);
  assert.doesNotMatch(JSON.stringify(result),/finalGrade|fullName|studentNumber|actorId|correctionReason|reportSha256|"rank"/);
  const [snapshot]=await prisma.$queryRaw`SELECT report FROM v81_settlement_report_revisions
    WHERE class_section_id=${fixture.teacherAActiveSectionId}::uuid AND version=2`;
  assert.equal(result.generatedAt,snapshot.report.generatedAt);
  assert.ok(snapshot.report.rows[0].finalGrade); // Teacher data is present in storage but absent from the student response.
  const document=JSON.parse(fs.readFileSync(new URL('../../backend/src/generated/openapi.document.generated.json',import.meta.url),'utf8'));
  const schema=document.paths['/student/enrollments/{enrollmentId}/settlement-result'].get.responses['200'].content['application/json'].schema.properties.data;
  const ajv=new Ajv({strict:false,allErrors:true});addFormats(ajv);
  const validate=ajv.compile({...schema,components:document.components});assert.ok(validate(result),JSON.stringify(validate.errors));
  const status=async(route,access)=>(await fetch(baseUrl+route,{headers:access?{authorization:`Bearer ${access}`}:{}})).status;
  assert.equal(await status(path),401);
  for(const access of [teacherToken,adminToken])assert.equal(await status(path,access),403);
  const other=await seedExerciseSessionStudent(prisma,{...fixture,teacherAActiveSectionId:fixture.teacherBActiveSectionId},randomUUID().slice(0,8).toUpperCase(),'ACTIVE',false);
  assert.equal(await status(`/student/enrollments/${other.enrollmentId}/settlement-result`,token),404);
  assert.equal(await status('/student/enrollments/invalid/settlement-result',token),422);
  console.log(JSON.stringify({check:'STUDENT_OWN_LATEST_SETTLEMENT_SNAPSHOT_SCHEMA_NO_INTERNAL_GRADES_OTHER_STUDENT_DENIED',result:'PASS'}));
}
