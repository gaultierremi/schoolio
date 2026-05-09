-- Remove legacy HistoGuess tables (duels, timeline, anachronism questions).
-- These tables had no active UI in Schoolio; their API routes and lib functions
-- were removed in the same cleanup commit.
-- duel_results is the audit table written by saveDuelResult (also removed).
-- quiz_scores and question_concepts are retained (used by active study/SM-2 features).

DROP TABLE IF EXISTS duel_results CASCADE;
DROP TABLE IF EXISTS duels CASCADE;
DROP TABLE IF EXISTS timeline_events CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
