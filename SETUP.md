# Setup walkthrough

5 minutes from zero to a working dashboard. Two parts: Supabase (cloud sync + audio hosting) and AI keys (the actual generation).

---

## Part 1 · Supabase

### 1. Create a Supabase project

Go to <https://supabase.com> and sign in (use GitHub for the fastest path). Click **New project**.

Fill in:
- **Name** — `zero-video-generator`
- **Database password** — anything strong (you'll never need it again unless you SSH in)
- **Region** — pick the one closest to you
- **Plan** — Free tier is plenty. The whole app fits inside the free quota for normal use.

Click **Create**. Wait ~60 seconds for provisioning to finish.

### 2. Run the migration SQL

Once the project is up, open the **SQL Editor** (sidebar, looks like `</>`).

Click **+ New query**.

Open `SUPABASE_SETUP.sql` from this folder, copy its entire contents, paste into the editor, and click **Run**.

You should see "Success. No rows returned." This created:
- The `sessions` table with all 26 columns
- The `videos` public storage bucket
- 8 RLS policies that let the anon key read/write both

### 3. Grab your URL and anon key

In the Supabase sidebar, click **Settings** → **API**.

Two values to copy:
- **Project URL** — looks like `https://abcdefghijk.supabase.co`
- **anon public key** — starts with `eyJ...` (this is safe to ship to the browser; it's the public read/write key, gated by RLS)

Keep this tab open. You'll paste these into the dashboard in a moment.

---

## Part 2 · API keys

You need at least one script provider key (Claude / OpenAI / Gemini) and the ElevenLabs key for voice.

| Provider     | Where to get a key                                | Free tier? |
|--------------|---------------------------------------------------|------------|
| Anthropic    | <https://console.anthropic.com/settings/keys>     | $5 trial credit |
| OpenAI       | <https://platform.openai.com/api-keys>            | None — pay-as-you-go |
| Google       | <https://aistudio.google.com/apikey>              | Yes, generous free tier |
| ElevenLabs   | <https://elevenlabs.io/app/settings/api-keys>     | Yes, 10k chars/month free |

You don't need all four. **One script provider + ElevenLabs** is enough.

---

## Part 3 · Connect the dashboard

Open the dashboard (either via `index.html` opened locally, or your deployed GitHub Pages URL — see `DEPLOY.md`).

Click the **gear icon** in the top-left to open Settings.

Paste your keys:
- One or more of: Anthropic / OpenAI / Google
- ElevenLabs (required for voice)
- Supabase Project URL
- Supabase anon key

Click **Test connection** under Supabase — you should see "✓ Connection works."

Click **Save**. The dashboard reloads and you're ready.

---

## What gets stored where

| Data                    | Location                                    |
|-------------------------|---------------------------------------------|
| API keys                | Browser localStorage (your machine only)    |
| Concept briefs + scripts | Supabase `sessions` table                  |
| Generated MP3s          | Supabase Storage `videos` bucket            |
| Assembled HTML videos   | Supabase Storage `videos` bucket            |

If Supabase isn't configured, sessions fall back to localStorage and audio generation is disabled (the static site can't host MP3s itself).

---

## First test run

Once everything is connected:

1. Click **+ New concept** in the rail.
2. Concept name: `Root Cause Analysis`.
3. Audience focus: `Software engineering`.
4. Tone: `Warm mentor`.
5. Duration: `130s`.
6. Pick Claude / OpenAI / Gemini (whichever you keyed).
7. Click **Generate script** — takes ~15s.
8. Skim the 10 beats. Edit anything. Click **Voice →**.
9. Pick a voice (Eryn is the canonical Avery if you have it; otherwise pick any calm female voice). Defaults are tuned for the Avery persona.
10. Click **Generate narration** — takes ~30s for ElevenLabs + ~5s for Supabase upload.
11. Click **Render** in the next step. Click **Assemble HTML video**.
12. The preview iframe lights up. Press play. Watch your concept come alive.

If anything fails, the toast at the bottom names the exact error. Most issues are key-related — double-check the Settings drawer.

---

## Troubleshooting

**"Supabase needed to host the audio"** — connect Supabase in Settings. The static dashboard can't store binary audio without it.

**"401 Invalid API key" from Anthropic** — re-paste the key. Anthropic keys start with `sk-ant-`.

**"403 The resource was not found" from ElevenLabs** — your account might not have access to the voice. Pick a different voice in step 3.

**"insert sessions: 401"** from Supabase — the migration didn't run completely. Re-run `SUPABASE_SETUP.sql` from the SQL Editor.

**Voice page is empty** — your ElevenLabs key works but you haven't loaded any custom voices into your account. Use the default ElevenLabs voices that come with every account.

**The video preview iframe shows "Audio is the clock; press play"** — that's normal. Click play.

---

## Resetting

To wipe local state and start fresh:

```js
// Paste in browser console:
Object.keys(localStorage).filter(k => k.startsWith('zero_vg_')).forEach(k => localStorage.removeItem(k));
location.reload();
```

To wipe Supabase: in the SQL Editor, run:
```sql
TRUNCATE TABLE public.sessions;
DELETE FROM storage.objects WHERE bucket_id = 'videos';
```
