-- Permit already-authorized administrative operations during maintenance.
-- Preserve each function's permission, history, version and erasure protections.
DO $$
DECLARE
  signature text;
  definition text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'guard_v81_rule_template()',
    'guard_v81_runtime_archive()',
    'erase_v81_student(uuid,uuid,uuid)'
  ] LOOP
    definition := pg_get_functiondef(signature::regprocedure);
    IF (length(definition) - length(replace(definition, 'system_mode=''NORMAL''', ''))) / length('system_mode=''NORMAL''') <> 1 THEN
      RAISE EXCEPTION 'Expected exactly one maintenance restriction in %', signature;
    END IF;
    definition := replace(definition, 'system_mode=''NORMAL''', 'system_mode IN (''NORMAL'',''MAINTENANCE'')');
    definition := replace(definition, 'in normal mode', 'in an available administration mode');
    definition := replace(definition, 'Student erasure requires NORMAL mode', 'Student erasure requires an available administration mode');
    EXECUTE definition;
  END LOOP;
END;
$$;
