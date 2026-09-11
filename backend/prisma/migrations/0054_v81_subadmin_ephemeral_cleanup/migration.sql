-- Current SUB account deletion may remove private preferences and push tokens.
-- Immutable event references already point to the non-login subjects from 0049.
-- Preserve every existing update guard and retain DELETE denial for other roles.
DO $$
DECLARE function_name TEXT; definition TEXT; needle TEXT; replacement TEXT;
BEGIN
  FOREACH function_name IN ARRAY ARRAY['guard_push_device_mutation','guard_user_preference_mutation'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO STRICT definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=function_name AND p.pronargs=0;
    needle := CASE function_name
      WHEN 'guard_push_device_mutation' THEN 'RAISE EXCEPTION ''push devices cannot be deleted before retention policy approval'';'
      ELSE 'RAISE EXCEPTION ''user preferences cannot be deleted'';' END;
    replacement := 'IF EXISTS (SELECT 1 FROM v81_admin_access a JOIN users u ON u.id=a.user_id AND u.organization_id=a.organization_id
      WHERE a.user_id=OLD.user_id AND a.organization_id=OLD.organization_id AND a.kind=''SUB'' AND u.role=''ADMIN'') THEN
      RETURN OLD;
    END IF;
    ' || needle;
    IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'Expected ephemeral deletion guard missing: %',function_name; END IF;
    EXECUTE replace(definition,needle,replacement);
  END LOOP;
END;
$$;
