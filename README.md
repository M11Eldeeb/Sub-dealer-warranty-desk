# WarrantyDesk — Warranty Claims Workflow

Sub-dealers submit warranty claims with evidence. Dealers approve, reject,
or return them for edits. Approved claims track parts arrival per-part.
Once all parts arrive and the sub-dealer submits after-repair evidence,
the claim closes and stays in history forever.

This is a real, working app (Next.js + Supabase) — not a demo. Follow the
steps below to put it in front of actual sub-dealers. No coding required,
about 30–45 minutes.

## 1. Create your Supabase project

1. Go to https://supabase.com → New project (free tier is fine to start).
2. Wait for it to finish provisioning (~2 min).
3. In the left sidebar: **SQL Editor** → New query → paste the entire
   contents of `supabase/schema.sql` → **Run**.
   This creates every table, security rule, and the private file-storage
   bucket for evidence photos.
4. In **Project Settings → API**, copy:
   - `Project URL`
   - `anon public` key

## 2. Configure the app

1. Copy `.env.local.example` to `.env.local`.
2. Paste in the Project URL and anon key from step 1.

## 3. Run it locally to check everything works

```
npm install
npm run dev
```

Open http://localhost:3000 → **Create account** → sign up once as a
**Dealer**, and once as a **Sub-Dealer** (pick a branch name on signup).
Log in as the sub-dealer, submit a test claim, then switch to the dealer
account and approve it. Walk it through to Closed.

## 4. Deploy so it's live on the internet

The easiest path (free, no server to manage):

1. Push this folder to a GitHub repo.
2. Go to https://vercel.com → **Add New Project** → import that repo.
3. In the Vercel project's **Environment Variables**, add the same two
   values from `.env.local`.
4. Deploy. You'll get a live URL like `warrantydesk.vercel.app`.

That URL is what you send to sub-dealers.

## 5. Before real sub-dealers start using it, lock down signup

Right now, anyone who visits `/login` can create a **Dealer** account —
fine for testing, not fine for production. Before rolling this out for
real, do one of:

- **Simplest:** remove the "Dealer" option from the signup screen
  (`app/login/page.js`) so only sub-dealer signup is self-serve, and
  create dealer accounts yourself directly in Supabase
  (Authentication → Users → Add user, then add a matching row in the
  `profiles` table with `role = 'dealer'`).
- **More robust:** replace open signup with an invite-link flow. I can
  build this next if you want it.

## 6. Onboarding sub-dealers

For each sub-dealer branch: have them go to your live URL → **Create
account** → **Sub-Dealer** → enter their branch name. That's it — no
manual setup per branch needed, the branch is created automatically on
first signup.

## What's intentionally left simple (v1)

- No email notifications yet on status changes (everyone has to check
  the app). Easy to add with Supabase's built-in triggers or Resend.
- No admin screen for managing branches/users — done via the Supabase
  dashboard for now.
- No PDF export of claim history — data's all in Postgres if you want
  a reporting view later.

## Project structure

```
app/
  login/              sign in / sign up
  dashboard/
    sub-dealer/        claim list, scoped to their branch (RLS-enforced)
    dealer/             claim list, all branches + "Needs Review" tab
  claims/
    new/                submit a claim + attach evidence
    [id]/                claim detail: approve/reject/return, parts
                          tracking, after-repair evidence, full history
components/ui.js       shared status pill, header, colors
lib/supabase/          browser + server Supabase clients
supabase/schema.sql    run this once in Supabase's SQL editor
```

## Need changes?

The cleanest way to keep building on this is **Claude Code** — point it
at this folder and it can run `npm run dev`, make edits, and use its own
terminal/network access to actually deploy, which I can't do from this
chat.
