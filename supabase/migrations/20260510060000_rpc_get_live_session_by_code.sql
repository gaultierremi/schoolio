-- RPC function returning JSONB so PostgREST passes the blob as-is without
-- mapping columns through its schema cache (which doesn't know about
-- projected_question_id / show_answer added in migration 040000).
-- Returning TABLE(…) causes PostgREST to re-serialize results via the cache,
-- silently nulling unknown columns. JSONB bypasses that entirely.
CREATE OR REPLACE FUNCTION get_live_session_by_code(p_code TEXT)
RETURNS JSONB
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(ls)
  FROM (
    SELECT id, projected_question_id, show_answer, ended_at
    FROM live_sessions
    WHERE code = UPPER(p_code)
    ORDER BY started_at DESC
    LIMIT 1
  ) ls;
$$;

-- Allow anon to call the function (slave page is public)
GRANT EXECUTE ON FUNCTION get_live_session_by_code(TEXT) TO anon, authenticated;
