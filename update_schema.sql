-- Esegui questo script per aggiungere il supporto al Draft State

ALTER TABLE public.lobbies ADD COLUMN draft_state jsonb DEFAULT '{}'::jsonb;
