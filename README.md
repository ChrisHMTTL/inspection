# HMTTL Receipt / Strip-Down / Inspection App

Live version of the mockup — same look and flow, backed by a real Supabase database. Same architecture pattern as the visitor management app (static site + Supabase + GitHub Pages).

## Current status

- **Supabase project:** HMTTL Inspection (Sydney region) — schema, seed data, and photo storage bucket all created and live.
- **Repo:** this one (`ChrisHMTTL/inspection`) — all files pushed to `main`.
- **Config:** `js/config.js` already has the real Project URL and publishable key wired in.
- **Still to do:** turn on GitHub Pages (Settings → Pages → deploy from `main` branch, root folder) if it isn't already live at `https://chrishmttl.github.io/inspection/`.

## What's in this folder

```
index.html          — app shell
css/styles.css       — all styling
js/config.js          — Supabase URL + key (already filled in)
js/app.js             — app logic (Dashboard, Receipt, Strip-Down, Inspection, Report, Settings)
sql/schema.sql         — database tables + starter equipment templates (already run)
sql/storage.sql        — photo storage bucket + upload permissions (already run)
```

## How it works

- **New Job** creates a row in Supabase immediately and everything from then on saves as you go — field edits save on leaving the field, photos upload straight to Supabase Storage, faults save the moment you click "Add Fault."
- **Job status** (Received → Stripped → Inspected → Reported) updates automatically as you move through the stages, and drives the dashboard status badges.
- **Report screen** toggles between the Customer version (faults + recommended action, no pricing) and an Internal version (adds a generated reference code per fault for hand-off to quoting). "Print / Save as PDF" uses the browser's print dialog — pick "Save as PDF" as the destination.
- **Equipment types** are configurable — add a new type by inserting a row into `equipment_types` in Supabase (Table Editor is easiest) with its own intake fields, checklist, and fault list. It shows up in New Job and Settings immediately.

## Security note — read before this touches real customer data

There's no login screen yet — same as the visitor app, it's a workshop-internal tool on an unlisted URL. The database policies currently give anyone with the page URL and anon key full read/write access to every job, including customer names and fault findings. That's a reasonable starting point to trial the workflow, but worth tightening before it's holding live customer data day to day — options range from a simple shared PIN gate (like the visitor app's settings panel) up to proper per-user Supabase Auth.

## Not built yet (flagged in the original spec as later phases)

- In-app equipment template editor (currently: edit directly in Supabase)
- Emailing the customer report directly from the app (currently: Print/Save as PDF, sent manually)
- Offline queueing for patchy workshop wifi
- Infusion integration beyond the manual job-number field
