# ContentOS — Database Schema

## Fixes Applied
- C7: RLS policies added for competitor_profiles table
- M3: competitor_type includes 'reference' for intake form creators
- M5: content_pillars has recommended_format + best_hook_types columns
- M5: ICP JSON includes content_sensitivities field

---

## Extensions Required

```sql
create extension if not exists "uuid-ossp";
create extension if not exists "vector";
```

---

## Migration: 001_initial_schema.sql

```sql
-- ============================================================
-- AGENCIES
-- ============================================================
create table agencies (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  slug       text unique not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
create table profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  agency_id uuid not null references agencies(id) on delete cascade,
  full_name text,
  role      text not null default 'writer'
              check (role in ('owner', 'manager', 'writer', 'viewer')),
  avatar_url text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- CLIENTS
-- ============================================================
create table clients (
  id                   uuid primary key default uuid_generate_v4(),
  agency_id            uuid not null references agencies(id) on delete cascade,
  name                 text not null,
  instagram_handle     text not null,
  niche                text not null,
  business_description text,
  client_type          text not null default 'new'
                         check (client_type in ('new', 'returning')),
  research_status      text not null default 'not_started'
                         check (research_status in ('not_started','running','complete','failed','failed_partial')),

  -- ICP stored as JSONB
  -- M5 fix: content_sensitivities field included
  icp jsonb default '{}'::jsonb,
  -- {
  --   "audience_age_range": [22, 35],
  --   "pain_points": ["low engagement"],
  --   "hinglish_level": 2,
  --   "content_tone": ["Educational"],
  --   "content_sensitivities": ["avoid weight loss claims"],  ← M5 fix
  --   "primary_emotions": ["curiosity", "inspiration"],
  --   "reference_creators": ["@ankur_warikoo"]
  -- }

  assigned_to uuid references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- RESEARCH RUNS
-- ============================================================
create table research_runs (
  id          uuid primary key default uuid_generate_v4(),
  client_id   uuid not null references clients(id) on delete cascade,
  agency_id   uuid not null references agencies(id) on delete cascade,
  run_type    text not null check (run_type in ('new_client','returning_client','manual_rerun')),
  status      text not null default 'pending'
                check (status in ('pending','running','complete','failed','failed_partial')),

  -- Current step (for real-time UI updates)
  current_step text,
  -- 'generating_keywords' | 'finding_competitors' | 'scraping_profiles'
  -- | 'reading_reels' | 'classifying_reels' | 'analysing_reels'
  -- | 'building_hooks' | 'building_pillars' | 'done'

  steps_json jsonb default '[]'::jsonb,
  -- [{ "id": "scraping_profiles", "label": "Scraping top reels...", "status": "active", "count": "34/100" }]

  -- Results summary
  reels_scraped       int default 0,
  reels_analysed      int default 0,
  pillars_created     int default 0,
  hooks_added         int default 0,
  competitors_found   int default 0,
  error_message       text,

  inngest_run_id  text,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- COMPETITOR PROFILES
-- ============================================================
create table competitor_profiles (
  id              uuid primary key default uuid_generate_v4(),
  client_id       uuid not null references clients(id) on delete cascade,
  agency_id       uuid not null references agencies(id) on delete cascade,
  research_run_id uuid references research_runs(id),

  handle          text not null,
  followers       bigint,
  -- M3 fix: 'reference' type added for intake form creators
  competitor_type text not null check (competitor_type in ('big', 'fastest_growing', 'reference')),
  avg_recent_virality  numeric,
  recent_reel_count    int,
  profile_url          text,
  thumbnail_url        text,

  scraped_at timestamptz not null default now()
);

create index idx_competitor_profiles_client on competitor_profiles (client_id, competitor_type);

-- ============================================================
-- NICHE REEL CACHE
-- ============================================================
create table niche_reel_cache (
  id         uuid primary key default uuid_generate_v4(),
  cache_key  text unique not null,  -- format: niche_hashtags_YYYYwWW (L1 fix: year included)
  agency_id  uuid not null references agencies(id) on delete cascade,
  reels      jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index idx_niche_cache_key on niche_reel_cache (cache_key, expires_at);

-- ============================================================
-- KEYWORD CLUSTERS
-- ============================================================
create table keyword_clusters (
  id              uuid primary key default uuid_generate_v4(),
  client_id       uuid not null references clients(id) on delete cascade,
  agency_id       uuid not null references agencies(id) on delete cascade,
  research_run_id uuid references research_runs(id),
  keywords        text[] not null,
  hashtags        text[] not null,
  intent          text not null check (intent in ('awareness','pain','aspiration','authority','trend')),
  language        text check (language in ('english','hindi','hinglish')),
  created_at      timestamptz not null default now()
);

-- ============================================================
-- SCRAPED REELS
-- ============================================================
create table scraped_reels (
  id                     uuid primary key default uuid_generate_v4(),
  client_id              uuid not null references clients(id) on delete cascade,
  agency_id              uuid not null references agencies(id) on delete cascade,
  research_run_id        uuid references research_runs(id),
  competitor_profile_id  uuid references competitor_profiles(id),

  -- Instagram data
  instagram_url          text not null,
  creator_handle         text,
  -- M3 fix: 'reference' included in competitor_type
  competitor_type        text check (competitor_type in ('big','fastest_growing','reference')),
  thumbnail_url          text,
  views                  bigint default 0,
  likes                  bigint default 0,
  comments               bigint default 0,
  saves                  bigint default 0,
  audio_name             text,
  audio_uses             bigint default 0,
  caption                text,
  hashtags               text[],
  published_at           timestamptz,

  -- Virality
  followers_at_scrape    bigint,
  virality_score         numeric generated always as (
    case when followers_at_scrape > 0
    then round((views::numeric / followers_at_scrape::numeric)::numeric, 2)
    else 0 end
  ) stored,

  -- Transcript
  transcript             text,
  transcript_source      text check (transcript_source in ('caption','whisper','manual')),
  transcript_word_count  int,

  -- Format classification (from Classifier Agent — Gemini video URL, no ffmpeg)
  format                 text check (format in ('talking_head','faceless','transition','text_based')),
  face_visible           boolean,
  uses_cuts              boolean,
  text_driven            boolean,
  cut_count              text,
  classifier_confidence  numeric,

  -- Full dissection (from Dissector Agent — top 30 reels only)
  dissection jsonb,
  -- {
  --   "hook": { "text": "...", "type": "relatability", "duration_sec": 4, "why_it_works": "...", "strength": 8 },
  --   "structure": { "opening": "...", "middle": "...", "close": "...", "pattern": "listicle" },
  --   "content": { "core_message": "...", "primary_emotion": "fear_of_loss", "key_phrases": [...] },
  --   "cta": { "type": "save", "text": "...", "placement": "end", "feel": "organic" },
  --   "format_analysis": { ... },
  --   "replicability": { "difficulty": 2, "unique_factor": "...", "key_insight": "..." }
  -- }

  scraped_at timestamptz not null default now()
);

create index idx_scraped_reels_virality on scraped_reels (virality_score desc);
create index idx_scraped_reels_client on scraped_reels (client_id, scraped_at desc);

-- ============================================================
-- CONTENT PILLARS
-- ============================================================
create table content_pillars (
  id              uuid primary key default uuid_generate_v4(),
  client_id       uuid not null references clients(id) on delete cascade,
  agency_id       uuid not null references agencies(id) on delete cascade,
  research_run_id uuid references research_runs(id),

  name            text not null,
  purpose         text not null,
  emotion_target  text,
  cta_type        text check (cta_type in ('follow','save','comment','dm','none')),
  topic_ideas     text[] default '{}',

  -- M5 fix: these columns were missing — required by script writer agent
  recommended_format text check (recommended_format in ('talking_head','faceless','transition','text_based')),
  best_hook_types    text[] default '{}',

  -- Performance
  health_score  numeric,   -- 0–1, updated by performance loop
  scripts_count int default 0,

  display_order int default 0,
  is_custom     boolean default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- HOOK BANK
-- ============================================================
create table hook_bank (
  id              uuid primary key default uuid_generate_v4(),
  agency_id       uuid not null references agencies(id) on delete cascade,
  client_id       uuid references clients(id),
  source_reel_id  uuid references scraped_reels(id),

  hook_text  text not null,
  hook_type  text not null check (hook_type in (
    'question','bold_claim','relatability','shock','stat','story','contrast'
  )),
  niche      text,

  performance_score  numeric,
  scripts_used_count int default 0,

  -- pgvector for semantic search (text-embedding-004 = 768 dims)
  embedding vector(768),

  is_manual  boolean default false,
  created_at timestamptz not null default now()
);

create index idx_hook_bank_embedding on hook_bank using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
create index idx_hook_bank_agency on hook_bank (agency_id, hook_type, niche);

-- ============================================================
-- SCRIPTS
-- ============================================================
create table scripts (
  id        uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete cascade,
  agency_id uuid not null references agencies(id) on delete cascade,
  pillar_id uuid references content_pillars(id),
  hook_id   uuid references hook_bank(id),

  title    text,
  topic    text,
  content  text not null default '',

  -- M5 note: COALESCE handles empty string edge case
  word_count int generated always as (
    coalesce(array_length(string_to_array(trim(content), ' '), 1), 0)
  ) stored,
  estimated_duration_sec int generated always as (
    round(coalesce(array_length(string_to_array(trim(content), ' '), 1), 0)::numeric / 130 * 60)
  ) stored,

  audio_suggestion  text,
  hinglish_level    int check (hinglish_level between 0 and 5),

  status text not null default 'draft'
           check (status in ('draft','review','approved','published')),
  instagram_reel_url text,

  version          int not null default 1,
  parent_script_id uuid references scripts(id),

  created_by  uuid references profiles(id),
  reviewed_by uuid references profiles(id),
  approved_by uuid references profiles(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_scripts_client on scripts (client_id, status, created_at desc);

-- ============================================================
-- REEL PERFORMANCE
-- ============================================================
create table reel_performance (
  id        uuid primary key default uuid_generate_v4(),
  script_id uuid not null references scripts(id) on delete cascade,
  agency_id uuid not null references agencies(id) on delete cascade,

  snapshot_type text not null check (snapshot_type in ('24h','72h','7d','30d','manual')),
  snapshot_at   timestamptz not null default now(),

  views           bigint default 0,
  likes           bigint default 0,
  comments        bigint default 0,
  saves           bigint default 0,
  avg_watch_pct   numeric,
  followers_at_time bigint,

  virality_score numeric generated always as (
    case when followers_at_time > 0
    then round((views::numeric / followers_at_time::numeric)::numeric, 2)
    else 0 end
  ) stored,

  data_source text default 'manual' check (data_source in ('manual','meta_api','apify'))
);

create index idx_perf_script on reel_performance (script_id, snapshot_at desc);

-- ============================================================
-- FAILURE AUDITS (for returning clients with no performing content)
-- ============================================================
create table failure_audits (
  id              uuid primary key default uuid_generate_v4(),
  client_id       uuid not null references clients(id) on delete cascade,
  agency_id       uuid not null references agencies(id) on delete cascade,
  research_run_id uuid references research_runs(id),

  dimensions         jsonb not null,   -- array of { name, rating, finding, recommendation }
  overall_diagnosis  text,
  recommended_action text check (recommended_action in ('new_client_flow','targeted_fixes')),
  priority_fix       text,

  created_at timestamptz not null default now()
);
```

---

## Migration: 002_rls_policies.sql

```sql
-- Enable RLS on all tables
alter table agencies enable row level security;
alter table profiles enable row level security;
alter table clients enable row level security;
alter table research_runs enable row level security;
alter table competitor_profiles enable row level security;
alter table niche_reel_cache enable row level security;
alter table keyword_clusters enable row level security;
alter table scraped_reels enable row level security;
alter table content_pillars enable row level security;
alter table hook_bank enable row level security;
alter table scripts enable row level security;
alter table reel_performance enable row level security;
alter table failure_audits enable row level security;

-- Helper: get current user's agency_id
create or replace function auth.agency_id()
returns uuid as $$
  select agency_id from public.profiles where id = auth.uid()
$$ language sql security definer stable;

-- PROFILES
create policy "Own profile select" on profiles for select using (id = auth.uid());
create policy "Own profile update" on profiles for update using (id = auth.uid());

-- AGENCIES
create policy "Agency select" on agencies for select using (id = auth.agency_id());
create policy "Owner agency update" on agencies for update using (
  id = auth.agency_id()
  and exists (select 1 from profiles where id = auth.uid() and role = 'owner')
);

-- CLIENTS
create policy "Agency clients select" on clients for select using (agency_id = auth.agency_id());
create policy "Manager clients insert" on clients for insert with check (
  agency_id = auth.agency_id()
  and exists (select 1 from profiles where id = auth.uid() and role in ('owner','manager'))
);
create policy "Manager clients update" on clients for update using (
  agency_id = auth.agency_id()
  and exists (select 1 from profiles where id = auth.uid() and role in ('owner','manager'))
);

-- RESEARCH RUNS
create policy "Agency research select" on research_runs for select using (agency_id = auth.agency_id());
create policy "Agency research insert" on research_runs for insert with check (agency_id = auth.agency_id());
create policy "Agency research update" on research_runs for update using (agency_id = auth.agency_id());

-- COMPETITOR PROFILES (C7 fix — was missing)
create policy "Agency competitor select" on competitor_profiles for select using (agency_id = auth.agency_id());
create policy "Agency competitor insert" on competitor_profiles for insert with check (agency_id = auth.agency_id());
create policy "Agency competitor update" on competitor_profiles for update using (agency_id = auth.agency_id());

-- NICHE REEL CACHE
create policy "Agency cache select" on niche_reel_cache for select using (agency_id = auth.agency_id());
create policy "Agency cache insert" on niche_reel_cache for insert with check (agency_id = auth.agency_id());

-- Apply same pattern to remaining tables
-- (keyword_clusters, scraped_reels, content_pillars, hook_bank, scripts, reel_performance, failure_audits)
-- Each gets 3 policies: select / insert / update scoped to auth.agency_id()

create policy "Agency kw select" on keyword_clusters for select using (agency_id = auth.agency_id());
create policy "Agency kw insert" on keyword_clusters for insert with check (agency_id = auth.agency_id());

create policy "Agency reels select" on scraped_reels for select using (agency_id = auth.agency_id());
create policy "Agency reels insert" on scraped_reels for insert with check (agency_id = auth.agency_id());

create policy "Agency pillars select" on content_pillars for select using (agency_id = auth.agency_id());
create policy "Agency pillars insert" on content_pillars for insert with check (agency_id = auth.agency_id());
create policy "Agency pillars update" on content_pillars for update using (agency_id = auth.agency_id());
create policy "Agency pillars delete" on content_pillars for delete using (agency_id = auth.agency_id());

create policy "Agency hooks select" on hook_bank for select using (agency_id = auth.agency_id());
create policy "Agency hooks insert" on hook_bank for insert with check (agency_id = auth.agency_id());
create policy "Agency hooks update" on hook_bank for update using (agency_id = auth.agency_id());

create policy "Agency scripts select" on scripts for select using (agency_id = auth.agency_id());
create policy "Agency scripts insert" on scripts for insert with check (agency_id = auth.agency_id());
create policy "Agency scripts update" on scripts for update using (agency_id = auth.agency_id());
create policy "Agency scripts delete" on scripts for delete using (agency_id = auth.agency_id());

create policy "Agency perf select" on reel_performance for select using (agency_id = auth.agency_id());
create policy "Agency perf insert" on reel_performance for insert with check (agency_id = auth.agency_id());
create policy "Agency perf update" on reel_performance for update using (agency_id = auth.agency_id());

create policy "Agency audits select" on failure_audits for select using (agency_id = auth.agency_id());
create policy "Agency audits insert" on failure_audits for insert with check (agency_id = auth.agency_id());
```

---

## Migration: 003_match_hooks_function.sql

```sql
create or replace function match_hooks (
  query_embedding vector(768),
  agency_id_param uuid,
  match_threshold float default 0.7,
  match_count int default 5,
  hook_type_filter text default null,
  niche_filter text default null
)
returns table (
  id uuid, hook_text text, hook_type text, niche text, performance_score numeric, similarity float
)
language plpgsql as $$
begin
  return query
  select
    hb.id, hb.hook_text, hb.hook_type, hb.niche, hb.performance_score,
    1 - (hb.embedding <=> query_embedding) as similarity
  from hook_bank hb
  where
    hb.agency_id = agency_id_param
    and 1 - (hb.embedding <=> query_embedding) > match_threshold
    and (hook_type_filter is null or hb.hook_type = hook_type_filter)
    and (niche_filter is null or hb.niche = niche_filter)
  order by hb.embedding <=> query_embedding
  limit match_count;
end;
$$;
```

---

## TypeScript Types

```bash
supabase gen types typescript --local > types/supabase.ts
```

```typescript
// types/index.ts — app-level types
export type Client = Database['public']['Tables']['clients']['Row']
export type Script = Database['public']['Tables']['scripts']['Row']
export type ContentPillar = Database['public']['Tables']['content_pillars']['Row']
export type HookBankEntry = Database['public']['Tables']['hook_bank']['Row']
export type ResearchRun = Database['public']['Tables']['research_runs']['Row']
export type CompetitorProfile = Database['public']['Tables']['competitor_profiles']['Row']
export type ScrapedReel = Database['public']['Tables']['scraped_reels']['Row']

export type ReelFormat = 'talking_head' | 'faceless' | 'transition' | 'text_based'
// M3 fix: reference type added
export type CompetitorType = 'big' | 'fastest_growing' | 'reference'

// M5 fix: content_sensitivities is now a required field in ICP
export type ICP = {
  audience_age_range: [number, number]
  pain_points: string[]
  hinglish_level: 0 | 1 | 2 | 3 | 4 | 5
  content_tone: string[]
  content_sensitivities: string[]   // M5 fix: was missing
  primary_emotions: string[]
  reference_creators: string[]
}

export type ReelDissection = {
  hook: {
    text: string
    type: 'question' | 'bold_claim' | 'relatability' | 'shock' | 'stat' | 'story' | 'contrast'
    duration_sec: number
    why_it_works: string
    strength: number
  }
  structure: {
    opening: string
    middle: string
    close: string
    pattern: 'problem_solution' | 'listicle' | 'story' | 'tutorial' | 'hot_take' | 'other'
  }
  content: {
    core_message: string
    primary_emotion: string
    secondary_emotion?: string
    appeal: 'broad' | 'niche' | 'both'
    key_phrases: string[]
  }
  cta: {
    type: 'follow' | 'save' | 'comment' | 'dm' | 'link' | 'none'
    text?: string
    placement: 'beginning' | 'middle' | 'end'
    feel: 'forced' | 'organic' | 'seamless'
  }
  format_analysis: Record<string, unknown>
  replicability: {
    difficulty: number
    unique_factor: string
    key_insight: string
  }
}

export type DissectionSummary = {
  top_hook_types: string[]
  top_formats: string[]
  top_emotions: string[]
  top_patterns: string[]
  top_ctas: string[]
  avg_hook_strength: number
  avg_virality: number
  key_insights: string[]
  format_virality: Record<ReelFormat, number>
  hook_virality: Record<string, number>
  total_reels_analysed: number
}
```
