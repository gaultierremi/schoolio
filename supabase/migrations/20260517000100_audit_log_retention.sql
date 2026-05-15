-- Sprint 1B — Helper fonction de purge audit_log > 5 ans.
--
-- Pourquoi pas un trigger ? Parce que les triggers de purge auraient un coût
-- à chaque INSERT, alors qu'un cron mensuel suffit largement (l'audit log
-- n'a pas de contrainte temps-réel sur la suppression).
--
-- Architecture (cf. plan Sprint 1A critique #7) :
-- - Fonction SQL `purge_old_audit_log()` qui DELETE > 5 ans
-- - Invocable via Trigger.dev cron mensuel OU via la console SQL Supabase
-- - 5 ans = durée de conservation mentionnée dans politique de confidentialité
-- - Idempotent : peut être appelée plusieurs fois sans effet de bord

BEGIN;

CREATE OR REPLACE FUNCTION public.purge_old_audit_log(retention_years INT DEFAULT 5)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  IF retention_years < 1 OR retention_years > 100 THEN
    RAISE EXCEPTION 'retention_years must be between 1 and 100';
  END IF;

  WITH del AS (
    DELETE FROM public.audit_log
    WHERE occurred_at < NOW() - (retention_years || ' years')::INTERVAL
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM del;

  -- Log la purge elle-même dans audit_log (méta-trace utile)
  INSERT INTO public.audit_log (event_type, actor_role, details)
  VALUES (
    'audit_log_purge',
    'system',
    jsonb_build_object('rows_deleted', deleted_count, 'retention_years', retention_years)
  );

  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.purge_old_audit_log IS
  'Sprint 1B — RGPD retention policy : purge audit_log > N années (5 par défaut). Idempotent. À déclencher mensuellement via Trigger.dev cron OU manuellement. Log la purge elle-même dans audit_log avec event_type=audit_log_purge.';

-- Permettre invocation via service role uniquement (jamais via anon/authenticated)
REVOKE ALL ON FUNCTION public.purge_old_audit_log FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_old_audit_log FROM authenticated;
REVOKE ALL ON FUNCTION public.purge_old_audit_log FROM anon;
GRANT EXECUTE ON FUNCTION public.purge_old_audit_log TO service_role;

COMMIT;
