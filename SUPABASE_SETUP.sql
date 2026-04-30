-- =============================================================
-- zero · video generator — Supabase schema
-- Idempotent. Safe to re-run any time. Adds new columns the
-- dashboard needs (outline, voice_instructions, script_approved,
-- framework_json) without dropping data.
-- =============================================================
-- Paste into Supabase → SQL Editor → New query → Run.
-- =============================================================

-- ---- sessions table ----------------------------------------

CREATE TABLE IF NOT EXISTS public.sessions (
  id               TEXT PRIMARY KEY,
  parent_id        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  concept          TEXT NOT NULL,
  focus            TEXT,
  audience_level   TEXT,
  tone             TEXT,
  duration_target  INTEGER DEFAULT 130,
  tool_url         TEXT,

  outline          TEXT,
  framework_json   TEXT,

  script_provider  TEXT,
  script_model     TEXT,
  script_json      TEXT,
  screenplay_text  TEXT,
  script_approved  BOOLEAN DEFAULT false,

  voice_id            TEXT,
  voice_instructions  TEXT,
  voice_stability     REAL DEFAULT 0.78,
  voice_style         REAL DEFAULT 0.10,
  voice_similarity    REAL DEFAULT 0.82,
  voice_speed         REAL DEFAULT 1.0,

  anchors_json     TEXT,
  audio_url        TEXT,
  video_url        TEXT,

  status           TEXT NOT NULL DEFAULT 'draft',
  error            TEXT,
  notes            TEXT,
  favorite         BOOLEAN DEFAULT false
);

-- ---- additive migrations for projects already on v1 schema -

ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS outline           TEXT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS framework_json    TEXT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS screenplay_text   TEXT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS script_approved   BOOLEAN DEFAULT false;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS voice_instructions TEXT;

-- ---- indexes ------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_sessions_created ON public.sessions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_status  ON public.sessions (status);

-- ---- row level security ------------------------------------

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read sessions"   ON public.sessions;
DROP POLICY IF EXISTS "anon insert sessions" ON public.sessions;
DROP POLICY IF EXISTS "anon update sessions" ON public.sessions;
DROP POLICY IF EXISTS "anon delete sessions" ON public.sessions;

CREATE POLICY "anon read sessions"   ON public.sessions FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert sessions" ON public.sessions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update sessions" ON public.sessions FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon delete sessions" ON public.sessions FOR DELETE TO anon USING (true);

-- ---- storage bucket ----------------------------------------

INSERT INTO storage.buckets (id, name, public)
  VALUES ('videos', 'videos', true)
  ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "videos read all"    ON storage.objects;
DROP POLICY IF EXISTS "videos write anon"  ON storage.objects;
DROP POLICY IF EXISTS "videos update anon" ON storage.objects;
DROP POLICY IF EXISTS "videos delete anon" ON storage.objects;

CREATE POLICY "videos read all"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'videos');

CREATE POLICY "videos write anon"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'videos');

CREATE POLICY "videos update anon"
  ON storage.objects FOR UPDATE TO anon
  USING (bucket_id = 'videos')
  WITH CHECK (bucket_id = 'videos');

CREATE POLICY "videos delete anon"
  ON storage.objects FOR DELETE TO anon
  USING (bucket_id = 'videos');

-- =============================================================
-- Done. The dashboard's setup banner should disappear on next
-- page reload.
-- =============================================================
