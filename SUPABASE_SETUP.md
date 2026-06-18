# Supabase Setup Guide

## Step 1 — Run the Schema SQL

1. Go to https://supabase.com/dashboard → Your Project → **SQL Editor**
2. Click **New Query**
3. Copy the entire contents of `supabase/schema.sql`
4. Paste it into the editor and click **Run**
5. Wait for "Success. No rows returned" (or similar)

This creates all tables, RLS policies, triggers, storage buckets, and enables Realtime.

## Step 2 — Enable Realtime in Dashboard

Even after running the SQL above, you must also verify in the dashboard:

1. Go to **Database → Replication** in the left sidebar
2. Under the **supabase_realtime** section, verify these tables are toggled **ON**:
   - `messages`
   - `profiles`
   - `reactions`
   - `pinned_messages`
3. If any are OFF, toggle them ON and click **Save**

## Step 3 — Disable Email Confirmation (Optional but Recommended)

1. Go to **Authentication → Providers**
2. Under **Email**, click **Edit**
3. Toggle **Confirm email** to **OFF** (so users are auto-logged in after signup)
4. Click **Save**

If you keep email confirmation ON, users will need to click a confirmation link before they can sign in.

## Step 4 — Set Site URL in Auth Settings

1. Go to **Authentication → Settings**
2. Under **Redirect URLs**, add:
   - `http://localhost:4321` (for local dev)
   - `https://chat-together-neon.vercel.app` (for production)
3. Under **Site URL**, set: `https://chat-together-neon.vercel.app`
4. Click **Save**

## Step 5 — Set Up Env Variables

Copy `.env.example` to `.env` and fill in:

```
PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
ADMIN_EMAIL=your_email@example.com
LOG_LEVEL=info
SITE_URL=http://localhost:4321
```

Get `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` from:
- **Settings → API → Project URL** and **anon public** key

For Vercel deployment, add ALL env vars in **Vercel → Project → Settings → Environment Variables**.

## Step 6 — Why This Fixes Realtime

There are 3 things that must be true for realtime to work:

| Requirement | Where to check |
|---|---|
| `messages` table added to `supabase_realtime` publication | Database → Replication (Step 2) |
| `REPLICA IDENTITY FULL` set on `messages` table | SQL Editor — run `ALTER TABLE messages REPLICA IDENTITY FULL;` (included in schema.sql) |
| WebSocket connects from browser | Open browser DevTools → Network → WS tab → look for `wss://*.supabase.co/realtime/v1` with status 101 |

Without **all three**, messages will only appear after page refresh.
