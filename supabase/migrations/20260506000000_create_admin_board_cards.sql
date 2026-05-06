CREATE TABLE IF NOT EXISTS admin_board_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by text NOT NULL,
  type text NOT NULL CHECK (type IN ('bug', 'feature', 'idea', 'comment', 'task')),
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'in_progress', 'review', 'done', 'archived')),
  assigned_to text,
  tags text[] DEFAULT ARRAY[]::text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Index pour requêtes fréquentes
CREATE INDEX IF NOT EXISTS admin_board_cards_status_idx ON admin_board_cards(status);
CREATE INDEX IF NOT EXISTS admin_board_cards_created_by_idx ON admin_board_cards(created_by);
CREATE INDEX IF NOT EXISTS admin_board_cards_priority_idx ON admin_board_cards(priority);
CREATE INDEX IF NOT EXISTS admin_board_cards_created_at_idx ON admin_board_cards(created_at DESC);

-- RLS : pas de policy publique. Toutes les opérations passent par les routes API admin avec service role + whitelist check.
ALTER TABLE admin_board_cards ENABLE ROW LEVEL SECURITY;

-- Trigger pour updated_at automatique
CREATE OR REPLACE FUNCTION update_admin_board_cards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  -- Si statut passe à 'done', set completed_at automatiquement
  IF NEW.status = 'done' AND OLD.status != 'done' THEN
    NEW.completed_at = now();
  END IF;
  -- Si statut sort de 'done', clear completed_at
  IF NEW.status != 'done' AND OLD.status = 'done' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER admin_board_cards_updated_at_trigger
BEFORE UPDATE ON admin_board_cards
FOR EACH ROW
EXECUTE FUNCTION update_admin_board_cards_updated_at();
