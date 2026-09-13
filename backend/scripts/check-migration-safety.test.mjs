import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {migrationIds} from './migration-registry.mjs';

const scripts=path.dirname(fileURLToPath(import.meta.url));
const workspace=path.resolve(scripts,'../..');
const fixtureRoot=path.join(workspace,'.local','migration-safety-tests');
function fixture(t){
  fs.mkdirSync(fixtureRoot,{recursive:true});
  const root=fs.mkdtempSync(path.join(fixtureRoot,'case-'));
  fs.mkdirSync(path.join(root,'backend','scripts'),{recursive:true});
  for(const name of ['check-migration-safety.mjs','migration-registry.mjs','v81-migration-scan.mjs'])fs.copyFileSync(path.join(scripts,name),path.join(root,'backend','scripts',name));
  const migrations=path.join(root,'backend','prisma','migrations');
  fs.cpSync(path.resolve(scripts,'../prisma/migrations'),migrations,{recursive:true});
  t.after(()=>{
    const resolved=fs.realpathSync(root),parent=fs.realpathSync(fixtureRoot);
    assert.equal(path.dirname(resolved),parent);assert.ok(path.basename(resolved).startsWith('case-'));
    fs.rmSync(resolved,{recursive:true,force:false});
  });
  return {migrations,run:()=>execFileSync(process.execPath,[path.join(root,'backend','scripts','check-migration-safety.mjs')],{encoding:'utf8',stdio:['ignore','pipe','pipe']}),
    change(id,transform,updateChecksum=true){
      const dir=path.join(migrations,id),sql=transform(fs.readFileSync(path.join(dir,'migration.sql'),'utf8'));
      fs.writeFileSync(path.join(dir,'migration.sql'),sql);
      if(updateChecksum){const file=path.join(dir,'manifest.json'),manifest=JSON.parse(fs.readFileSync(file,'utf8'));manifest.sha256=crypto.createHash('sha256').update(sql).digest('hex');fs.writeFileSync(file,JSON.stringify(manifest));}
    }};
}
test('all registered migrations pass the real checker',t=>{assert.ok(fixture(t).run().includes(`Migration safety: PASS (${migrationIds.length} registered migrations`));});
test('demand constraint replacements cannot execute deletion',t=>{
  const f=fixture(t);f.change('0067_historical_backfill',sql=>sql+'\nDELETE FROM exercise_records;');
  assert.throws(f.run,/forbidden destructive SQL/);
});
test('demand constraints require an executable replacement',t=>{
  const f=fixture(t);f.change('0065_course_rule_customization',sql=>sql.replace('ADD CONSTRAINT v81_course_rules_weekly_limit_check','ADD CONSTRAINT unrecognized_weekly_guard'));
  assert.throws(f.run,/no verified replacement/);
});

test('student erasure migration cannot execute deletion during deployment',t=>{
  const f=fixture(t);f.change('0061_admin_student_erasure',sql=>sql+'\nDELETE FROM exercise_records;');
  assert.throws(f.run,/forbidden destructive SQL/);
});
test('unknown migration directory is rejected',t=>{const f=fixture(t);fs.mkdirSync(path.join(f.migrations,'9999_unregistered'));assert.throws(f.run,/Expected exactly/);});
test('SQL checksum changes are rejected',t=>{const f=fixture(t);f.change('0055_v81_invite_revocation',sql=>sql+'\n-- altered\n',false);assert.throws(f.run,/checksum mismatch/);});
for(const sql of ['DROP TABLE course_invites;','TRUNCATE course_invites;','DELETE FROM course_invites;','ALTER TABLE course_invites DROP COLUMN token_hash;']){
  test(`data-destructive statement is rejected: ${sql}`,t=>{const f=fixture(t);f.change('0055_v81_invite_revocation',value=>value+'\n'+sql);assert.throws(f.run,/forbidden destructive SQL/);});
}
test('comments and strings cannot forge replacement constraints',t=>{
  const f=fixture(t);f.change('0055_v81_invite_revocation',sql=>sql+"\nALTER TABLE course_invites DROP CONSTRAINT missing_guard;\n-- ALTER TABLE course_invites ADD CONSTRAINT missing_guard CHECK(true);\nSELECT 'ALTER TABLE course_invites ADD CONSTRAINT missing_guard CHECK(true);';");
  assert.throws(f.run,/no verified replacement/);
});
test('history reference cannot acquire cascading deletion',t=>{
  const f=fixture(t);f.change('0047_v81_history_references',sql=>sql.replace('ON DELETE RESTRICT','ON DELETE CASCADE'));
  assert.throws(f.run,/non-cascading deletion/);
});

test('course erasure migration cannot execute deletion during deployment',t=>{const f=fixture(t);f.change('0062_teacher_course_erasure',sql=>sql+'\nDELETE FROM class_sections;');assert.throws(f.run,/forbidden destructive SQL/);});
