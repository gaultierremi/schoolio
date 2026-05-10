-- Force PostgREST to reload its schema cache so that the columns
-- projected_question_id and show_answer (added in migration 040000)
-- are visible to REST API SELECT queries.
-- Without this, SELECT * on live_sessions silently omits those columns
-- because PostgREST was started before they existed.
SELECT pg_notify('pgrst', 'reload schema');
