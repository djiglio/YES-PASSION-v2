-- Aggiunta della colonna per lo stato della stagione multiplayer
ALTER TABLE public.lobbies ADD COLUMN IF NOT EXISTS season_state JSONB DEFAULT NULL;
