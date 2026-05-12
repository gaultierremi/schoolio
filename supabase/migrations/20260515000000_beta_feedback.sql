-- ============================================================================
-- Beta Feedback — tables de persistance du système de retour utilisateur.
--
-- WHY: Première confrontation au réel (Adrien, DIC Liège, 18 mai). On
-- collecte des feedbacks vocaux + texte en contexte de classe. Ce schéma
-- doit être self-contained et peu couplé — Alex pourrait restructurer
-- Schoolio sans casser ce système.
--
-- Trois tables :
--   beta_feedback              — un feedback par soumission
--   beta_feedback_comments     — commentaires internes / publics par les admins
--   beta_feedback_status_history — audit trail des changements de statut
--
-- Sécurité :
--   - Authenticated users : INSERT leurs propres feedbacks, SELECT les leurs
--   - UPDATE/admin ops : service_role uniquement (API admin bypass RLS)
--   - user_id nullable + SET NULL : les rows survivent à une suppression de compte
-- ============================================================================

-- ── beta_feedback ──────────────────────────────────────────────────────────────

CREATE TABLE public.beta_feedback (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Auteur
  user_id               UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  user_email_snapshot   TEXT        NOT NULL,

  -- Contenu brut (envoyé par Coco)
  transcript            TEXT        NOT NULL,
  input_method          TEXT        NOT NULL CHECK (input_method IN ('voice', 'text', 'mixed')),
  suggested_type        TEXT        CHECK (suggested_type IN ('bug', 'feature_request', 'general')),

  -- Contexte navigateur
  page_url              TEXT,
  page_title            TEXT,
  user_agent            TEXT,
  viewport              TEXT,
  duration_sec          INT,

  -- Classification AI (remplie par la Part 2 — Edge Function)
  ai_type               TEXT,
  ai_severity           TEXT        CHECK (ai_severity IN ('critical', 'high', 'medium', 'low')),
  ai_feature            TEXT,
  ai_summary            TEXT,
  ai_suggested_action   TEXT,
  ai_confidence         NUMERIC(3,2),
  ai_classified_at      TIMESTAMPTZ,
  ai_model              TEXT,

  -- Workflow admin
  status                TEXT        NOT NULL DEFAULT 'new'
                                    CHECK (status IN ('new','triaged','investigating','in_progress','resolved','wontfix','duplicate')),
  assignee_id           UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  priority_override     INT,
  duplicate_of_id       UUID        REFERENCES public.beta_feedback(id) ON DELETE SET NULL,
  github_issue_url      TEXT,
  internal_notes        TEXT,
  resolution_note       TEXT,
  resolved_at           TIMESTAMPTZ
);

-- ── beta_feedback_comments ─────────────────────────────────────────────────────

CREATE TABLE public.beta_feedback_comments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID        NOT NULL REFERENCES public.beta_feedback(id) ON DELETE CASCADE,
  author_id   UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  content     TEXT        NOT NULL,
  is_internal BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── beta_feedback_status_history ───────────────────────────────────────────────

CREATE TABLE public.beta_feedback_status_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID        NOT NULL REFERENCES public.beta_feedback(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT        NOT NULL,
  changed_by  UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  reason      TEXT,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────────

CREATE INDEX idx_beta_feedback_status_severity
  ON public.beta_feedback (status, ai_severity);

CREATE INDEX idx_beta_feedback_created_at
  ON public.beta_feedback (created_at DESC);

CREATE INDEX idx_beta_feedback_assignee_status
  ON public.beta_feedback (assignee_id, status);

-- ── RLS ────────────────────────────────────────────────────────────────────────

ALTER TABLE public.beta_feedback              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_feedback_comments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_feedback_status_history ENABLE ROW LEVEL SECURITY;

-- beta_feedback : INSERT — utilisateur authentifié insère son propre row
CREATE POLICY "beta_feedback_insert_own"
  ON public.beta_feedback FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- beta_feedback : SELECT — chaque user voit seulement ses propres feedbacks
-- (les admins lisent via service_role depuis l'API, ce qui bypasse RLS)
CREATE POLICY "beta_feedback_select_own"
  ON public.beta_feedback FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- beta_feedback : UPDATE — bloqué pour authenticated ; l'API admin utilise service_role
CREATE POLICY "beta_feedback_update_blocked"
  ON public.beta_feedback FOR UPDATE
  TO authenticated
  USING (false);

-- comments : SELECT — utilisateur voit les commentaires publics sur ses propres feedbacks
CREATE POLICY "beta_feedback_comments_select_own"
  ON public.beta_feedback_comments FOR SELECT
  TO authenticated
  USING (
    is_internal = false
    AND EXISTS (
      SELECT 1 FROM public.beta_feedback f
      WHERE f.id = feedback_id
        AND f.user_id = auth.uid()
    )
  );

-- comments : INSERT — bloqué pour authenticated ; admins via service_role
CREATE POLICY "beta_feedback_comments_insert_blocked"
  ON public.beta_feedback_comments FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- status_history : SELECT — utilisateur voit l'historique de ses propres feedbacks
CREATE POLICY "beta_feedback_history_select_own"
  ON public.beta_feedback_status_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.beta_feedback f
      WHERE f.id = feedback_id
        AND f.user_id = auth.uid()
    )
  );

-- status_history : INSERT — bloqué pour authenticated ; admins via service_role
CREATE POLICY "beta_feedback_history_insert_blocked"
  ON public.beta_feedback_status_history FOR INSERT
  TO authenticated
  WITH CHECK (false);
