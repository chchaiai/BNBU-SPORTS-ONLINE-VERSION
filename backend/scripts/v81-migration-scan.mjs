// Recognize explicitly reviewed V8.1 constraint replacements; retain the destructive SQL scan.
const replacementMigrations=new Set([
  '0021_v81_business_foundation','0024_v81_certification_revocation','0027_v81_feedback_history','0059_v81_recognition_adjustment',
  '0035_v81_roster_source_format','0047_v81_history_references','0049_v81_session_history_subjects','0051_v81_system_event_provenance','0055_v81_invite_revocation','0057_v81_roster_duplicates',
]);

export function maskSql(source,maskStrings=false){
  let output='',state='code',depth=0;
  const blank=c=>c==='\n'||c==='\r'?c:' ';
  for(let i=0;i<source.length;i++){
    const c=source[i],next=source[i+1];
    if(state==='line'){output+=blank(c);if(c==='\n')state='code';continue;}
    if(state==='block'){
      if(c==='/'&&next==='*'){output+='  ';i++;depth++;}
      else if(c==='*'&&next==='/'){output+='  ';i++;if(--depth===0)state='code';}
      else output+=blank(c);
      continue;
    }
    if(state==='single'||state==='double'){
      const quote=state==='single'?"'":'"',hide=state==='single'&&maskStrings;
      output+=hide?blank(c):c;
      if(c===quote&&next===quote){output+=hide?' ':next;i++;}
      else if(c===quote)state='code';
      continue;
    }
    if(c==='-'&&next==='-'){output+='  ';i++;state='line';}
    else if(c==='/'&&next==='*'){output+='  ';i++;state='block';depth=1;}
    else if(c==="'"){state='single';output+=maskStrings?' ':c;}
    else {output+=c;if(c==='"')state='double';}
  }
  return output;
}

export function prepareV81MigrationScan(migrationId,sql){
  if(migrationId==='0061_admin_student_erasure') {
    // Installing this explicitly authorized runtime command does not execute its DELETEs.
    // Leave every statement outside the one named function subject to the normal scan.
    const declaration=/CREATE FUNCTION erase_v81_student\(target_organization uuid,target_student uuid,target_actor uuid\)\s+RETURNS jsonb LANGUAGE plpgsql AS \$\$[\s\S]*?\$\$;/g;
    if([...sql.matchAll(declaration)].length!==1)throw new Error('Student erasure command declaration must occur exactly once');
    sql=sql.replace(declaration,'-- Reviewed runtime student erasure function definition.');
  }
  let scan=maskSql(sql),code=maskSql(sql,true);
  const normalize=value=>value.replaceAll('"','').replace(/\s+/g,' ').trim().toLowerCase();
  const normalized=normalize(code);
  if(replacementMigrations.has(migrationId)){
    const replacements=[];
    for(const match of code.matchAll(/\bALTER\s+TABLE\s+("[^"]+"|\w+)\s+DROP\s+CONSTRAINT\s+("[^"]+"|\w+)\s*;/gi)){
      const table=normalize(match[1]),constraint=normalize(match[2]);
      const replacement=`alter table ${table} add constraint ${constraint} `;
      const removesLegacyCredit=migrationId==='0021_v81_business_foundation'&&table==='exercise_records'&&constraint==='exercise_records_duration_credit_check'&&
        normalized.includes('add constraint exercise_records_duration_range_check check (')&&normalized.includes('minimum_minutes in (30,45,60)');
      if(!normalized.includes(replacement)&&!removesLegacyCredit)throw new Error(`${migrationId}: removed constraint ${constraint} has no verified replacement`);
      if(['0047_v81_history_references','0049_v81_session_history_subjects'].includes(migrationId)){
        const start=normalized.indexOf(replacement),statement=normalized.slice(start,normalized.indexOf(';',start));
        if(!statement.includes('foreign key')||/\bon delete (?!restrict\b|no action\b)/.test(statement))
          throw new Error(`${migrationId}: historical reference ${constraint} must retain non-cascading deletion`);
      }
      replacements.push(match);
    }
    for(const match of replacements.reverse())scan=scan.slice(0,match.index)+scan.slice(match.index,match.index+match[0].length).replace(/\bDROP\b/i,'REPLACE')+scan.slice(match.index+match[0].length);
  }
  if(migrationId==='0040_v81_unified_roster_basis'){
    if(!normalized.includes('add constraint v81_confirmed_roster_one_source')||!normalized.includes('create trigger v81_confirmed_roster_guard before insert'))
      throw new Error(`${migrationId}: source exclusivity and replacement guard required`);
    scan=scan.replace('ALTER COLUMN roster_import_id DROP NOT NULL','ALTER COLUMN roster_import_id REMOVE NOT NULL');
  }
  return scan;
}
