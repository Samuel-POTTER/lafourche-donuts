-- Channels enregistrés
CREATE TABLE channels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slack_channel_id TEXT NOT NULL UNIQUE,
  slack_channel_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Historique des matchs
CREATE TABLE matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  user_a TEXT NOT NULL,    -- Slack user ID
  user_b TEXT NOT NULL,    -- Slack user ID
  week_date DATE NOT NULL, -- Lundi de la semaine du match
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Personnes sans match la semaine précédente (odd-one-out)
CREATE TABLE unpaired_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  slack_user_id TEXT NOT NULL,
  week_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Utilisateurs exclus temporairement du pool de matching
CREATE TABLE skipped_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  slack_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel_id, slack_user_id)
);

-- Index utiles
CREATE INDEX idx_matches_channel_id ON matches(channel_id);
CREATE INDEX idx_matches_users ON matches(user_a, user_b);
CREATE INDEX idx_unpaired_channel ON unpaired_users(channel_id);
CREATE INDEX idx_skipped_channel ON skipped_users(channel_id);
