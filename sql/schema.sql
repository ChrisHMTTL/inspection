-- ============================================================
-- HMTTL Receipt / Strip-Down / Inspection App — Supabase Schema
-- Run this once in Supabase → SQL Editor → New Query → Run
-- Safe to run on the SAME project as the visitor management app
-- (tables are self-contained, no naming clashes expected)
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Equipment type templates ----------
create table if not exists equipment_types (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,              -- 'cylinder', 'pump', etc.
  name text not null,
  intake_fields jsonb not null default '[]',
  checklist jsonb not null default '[]',
  fault_taxonomy jsonb not null default '[]',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Jobs ----------
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  wo_number text,
  customer_name text,
  site text,
  equipment_type_key text references equipment_types(key),
  equipment_details jsonb not null default '{}',
  received_by text,
  received_at date default current_date,
  priority text default 'Standard',
  customer_reported_fault text,
  status text not null default 'Received',   -- Received / Stripped / Inspected / Reported
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- As-received photos ----------
create table if not exists receipt_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  photo_url text not null,
  caption text,
  taken_at timestamptz not null default now()
);

-- ---------- Strip-down checklist steps ----------
create table if not exists stripdown_steps (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  component text not null,
  photo_url text,
  measurement text,
  notes text,
  complete boolean not null default false,
  completed_at timestamptz,
  unique(job_id, component)
);

-- ---------- Fault findings ----------
create table if not exists fault_findings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  component text not null,
  fault_type text not null,
  severity text not null,               -- Critical / Major / Minor / Monitor
  root_cause text,
  recommended_action text not null,     -- Required repair / Recommended repair / Monitor / No action
  photo_url text,
  internal_repair_code text,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Trigger: keep jobs.updated_at current ----------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_jobs_updated on jobs;
create trigger trg_jobs_updated before update on jobs
  for each row execute function set_updated_at();

-- ============================================================
-- Seed data — starter equipment type templates
-- (all editable later from the app's Settings screen)
-- ============================================================
insert into equipment_types (key, name, intake_fields, checklist, fault_taxonomy) values
('cylinder', 'Cylinder',
  '[{"key":"bore","label":"Bore (mm)","type":"number"},{"key":"rod","label":"Rod Diameter (mm)","type":"number"},{"key":"stroke","label":"Stroke (mm)","type":"number"},{"key":"serial","label":"Serial Number","type":"text"}]',
  '["Barrel","Rod","Gland / Bearing","Piston","Seals","Ports","Mounting / Trunnion"]',
  '["Rod scoring","Chrome flaking","Seal extrusion","Bore taper / scoring","Mounting eye wear","Weld crack","Corrosion"]'
),
('pump', 'Pump / Motor',
  '[{"key":"displacement","label":"Displacement (cc/rev)","type":"number"},{"key":"shaft","label":"Shaft Type","type":"text"},{"key":"serial","label":"Serial Number","type":"text"}]',
  '["Shaft / Spline","Bearings","Case Drain","Ports","Housing"]',
  '["Shaft spline wear","Bearing wear / noise","Case drain contamination","Housing crack","Seal leak"]'
),
('valve', 'Valve',
  '[{"key":"valveType","label":"Valve Type","type":"text"},{"key":"ports","label":"Number of Ports","type":"number"},{"key":"serial","label":"Serial Number","type":"text"}]',
  '["Spool","Ports","Solenoid","Housing"]',
  '["Spool sticking","Port thread damage","Solenoid failure","Housing crack"]'
),
('hose', 'Hose Assembly',
  '[{"key":"hoseSpec","label":"Hose Spec","type":"text"},{"key":"length","label":"Length (mm)","type":"number"},{"key":"fitting","label":"Fitting Type","type":"text"}]',
  '["Cover","Fittings","Crimp"]',
  '["Cover abrasion","Fitting corrosion","Crimp failure"]'
)
on conflict (key) do nothing;

-- ============================================================
-- Row Level Security
-- MVP note: this app has no login screen yet (same pattern as the
-- visitor management app — PIN-locked settings only, no per-user
-- auth). These policies allow the public anon key full read/write,
-- which is fine for a workshop-internal tool on an unlisted URL,
-- but worth revisiting once real customer fault data is involved —
-- see README "Security note" before going live.
-- ============================================================
alter table equipment_types enable row level security;
alter table jobs enable row level security;
alter table receipt_photos enable row level security;
alter table stripdown_steps enable row level security;
alter table fault_findings enable row level security;

create policy "anon full access" on equipment_types for all using (true) with check (true);
create policy "anon full access" on jobs for all using (true) with check (true);
create policy "anon full access" on receipt_photos for all using (true) with check (true);
create policy "anon full access" on stripdown_steps for all using (true) with check (true);
create policy "anon full access" on fault_findings for all using (true) with check (true);
