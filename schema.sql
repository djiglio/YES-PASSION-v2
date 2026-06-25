-- ==========================================
-- YES PASSION V2 - SUPABASE SQL SCHEMA
-- ==========================================

-- 1. Tabella Profili Utente
CREATE TABLE public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  username text unique not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Permessi (RLS) per profili
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profili leggibili da tutti gli utenti autenticati" ON public.profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Utenti possono aggiornare il proprio profilo" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Trigger per creare automaticamente il profilo quando tu (admin) crei l'utente
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (new.id, split_part(new.email, '@', 1)); -- Usa la parte prima della @ come username provvisorio
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 2. Tabella Classifiche (Aggregate)
CREATE TABLE public.leaderboards (
  user_id uuid references public.profiles(id) on delete cascade not null,
  mode text not null check (mode in ('classica', 'budget')),
  total_points integer default 0,
  championships integer default 0,
  wins integer default 0,
  draws integer default 0,
  losses integer default 0,
  runs_played integer default 0,
  abandons integer default 0,
  avg_points numeric generated always as (
    case when runs_played > 0 then (total_points::numeric / runs_played) else 0 end
  ) stored,
  PRIMARY KEY (user_id, mode)
);

-- Permessi (RLS) per classifiche (sola lettura per i client, le Edge Functions possono scrivere)
ALTER TABLE public.leaderboards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Classifiche leggibili da tutti" ON public.leaderboards FOR SELECT USING (true);
-- Nota: I client non possono scrivere (INSERT/UPDATE), lo farà solo l'Edge Function con la Service Role Key!

-- 3. Tabella Lobby (Stanze Multiplayer)
CREATE TABLE public.lobbies (
  id uuid default gen_random_uuid() primary key,
  code varchar(4) unique not null,
  host_id uuid references public.profiles(id) not null,
  mode text not null check (mode in ('classica', 'budget', 'custom')),
  status text not null default 'waiting' check (status in ('waiting', 'drafting', 'simulating', 'finished')),
  season_state jsonb default null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

ALTER TABLE public.lobbies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lobby visibili a tutti" ON public.lobbies FOR SELECT USING (true);
CREATE POLICY "Utenti possono creare lobby" ON public.lobbies FOR INSERT WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Host può aggiornare la lobby" ON public.lobbies FOR UPDATE USING (auth.uid() = host_id);

-- 4. Giocatori nelle Lobby
CREATE TABLE public.lobby_players (
  lobby_id uuid references public.lobbies(id) on delete cascade not null,
  user_id uuid references public.profiles(id) not null,
  turn_position integer, -- 1, 2, 3, 4
  status text default 'joined',
  PRIMARY KEY (lobby_id, user_id)
);

ALTER TABLE public.lobby_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Giocatori visibili a tutti" ON public.lobby_players FOR SELECT USING (true);
CREATE POLICY "Utenti possono unirsi" ON public.lobby_players FOR INSERT WITH CHECK (auth.uid() = user_id);
-- Update riservato all'host o al server

-- Nota finale: la sincronizzazione real-time del draft userà i Supabase Realtime Channels (in memoria, senza intasare il database).
