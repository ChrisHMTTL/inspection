-- ============================================================
-- Storage bucket for job photos
-- Run AFTER schema.sql, also in the Supabase SQL Editor
-- ============================================================

insert into storage.buckets (id, name, public)
values ('inspection-photos', 'inspection-photos', true)
on conflict (id) do nothing;

-- Allow the app (anon key) to upload and read photos in this bucket.
-- Same risk-profile note as schema.sql — fine for an internal,
-- unlisted-URL workshop tool; revisit if/when proper login is added.
create policy "anon upload inspection photos"
  on storage.objects for insert
  with check (bucket_id = 'inspection-photos');

create policy "anon read inspection photos"
  on storage.objects for select
  using (bucket_id = 'inspection-photos');

create policy "anon update inspection photos"
  on storage.objects for update
  using (bucket_id = 'inspection-photos');
