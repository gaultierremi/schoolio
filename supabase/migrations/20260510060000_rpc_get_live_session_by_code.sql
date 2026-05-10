-- RPC function to read live_sessions including columns added after PostgREST
-- started (projected_question_id, show_answer). SQL functions bypass
-- PostgREST's schema cache, so they always see the real column list.
CREATE OR REPLACE FUNCTION get_live_session_by_code(p_code TEXT)
RETURNS TABLE(
  id                  UUID,
  projected_question_id UUID,
  show_answer         BOOLEAN,
  ended_at            TIMESTAMPTZ
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, projected_question_id, show_answer, ended_at
  FROM live_sessions
  WHERE code = UPPER(p_code)
  ORDER BY started_at DESC
  LIMIT 1;
$$;

-- Allow anon to call the function (slave page is public)
GRANT EXECUTE ON FUNCTION get_live_session_by_code(TEXT) TO anon, authenticated;
