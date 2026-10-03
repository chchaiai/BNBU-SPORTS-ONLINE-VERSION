import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import {createStrictPgClientConfig} from '/app/scripts/postgres-tls.mjs';
// Executed only by the migration container; credentials stay in memory.
const secret=JSON.parse(await readFile(process.env.MIGRATOR_SECRET_FILE,'utf8'));
const db=new Client(createStrictPgClientConfig(secret.MIGRATION_DATABASE_URL,process.env.TENCENTDB_CA_FILE));await db.connect();
try {
 await db.query('BEGIN');
 const {rows}=await db.query(`SELECT s.id,s.organization_id,s.full_name,s.student_number,u.id AS user_id,e.semester_id
 FROM student_profiles s JOIN users u ON u.id=s.user_id JOIN organizations o ON o.id=s.organization_id
 JOIN enrollments e ON e.student_id=s.id AND e.status='ACTIVE' JOIN semesters term ON term.id=e.semester_id AND term.status='CURRENT'
 WHERE o.organization_code='BNBU' AND u.primary_email_normalized=$1 AND u.email_verified_at IS NOT NULL AND s.deleted_at IS NULL AND u.deleted_at IS NULL FOR UPDATE OF s`,['s230025090@mail.bnbu.edu.cn']);
 assert.ok(rows.length>=1 && rows.length<=2);const s=rows[0];
 assert.equal(s.id,'01a0a385-8409-7546-829a-84d121b8da4c');assert.equal(s.full_name,'杨昊忻');assert.equal(s.student_number,'2230025090');assert.equal(s.semester_id,'01a08920-1f5f-712f-99ae-63724ddca0a5');
 const result=await db.query(`INSERT INTO student_enrollment_capacities(organization_id,student_id,semester_id,maximum_active,reason)
 VALUES($1,$2,$3,2,$4) ON CONFLICT DO NOTHING RETURNING student_id`,[s.organization_id,s.id,s.semester_id,'用户明确授权：本学期选修两门体育课，最多两个有效班级，打卡及学时按班独立。2026-09-22']);
 if(result.rowCount===1)await db.query(`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts)
 VALUES($1,$2,'STUDENT_ENROLLMENT_CAPACITY',$3,'DUAL_CLASS_GRANTED',NULL,'dual-class-20260922',1,$4::jsonb)`,[randomUUID(),s.organization_id,s.id,JSON.stringify({semesterId:s.semester_id,maximumActive:2,independentCredits:true,authorization:'User request 2026-09-22'})]);
 assert.equal((await db.query('SELECT maximum_active FROM student_enrollment_capacities WHERE organization_id=$1 AND student_id=$2 AND semester_id=$3',[s.organization_id,s.id,s.semester_id])).rows[0].maximum_active,2);
 await db.query('COMMIT');console.log(JSON.stringify({result:'PASS',studentId:s.id,semesterId:s.semester_id,maximumActive:2,newGrant:result.rowCount===1,activeClasses:rows.length}));
}catch(e){await db.query('ROLLBACK');throw e}finally{await db.end()}
