# Deploy to GitHub Pages

The dashboard is a pure static site — three top-level files (`index.html`, `styles.css`, `app.js`), one `lib/` folder, no build step. It runs anywhere a browser can fetch HTML.

## Option A · GitHub Pages (zero config)

### 1. Push to a public GitHub repo

```bash
cd video-generator-web
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin git@github.com:YOUR_USERNAME/zero-video-generator.git
git push -u origin main
```

### 2. Enable Pages

On GitHub: **Settings → Pages**.

- **Source**: Deploy from a branch.
- **Branch**: `main` / root (`/`).

Click **Save**. After ~30 seconds your site is live at:

```
https://YOUR_USERNAME.github.io/zero-video-generator/
```

### 3. Open it in Chrome

Visit the URL above. The first-run setup card greets you. Click the gear icon, paste your keys (per `SETUP.md`), and you're running.

That's the whole deployment.

---

## Option B · Local preview (no GitHub)

You can run the static site directly from your machine in two ways.

### B.1 — Just open the file

Double-click `index.html`. Some browsers will refuse to run ES modules from `file://` URLs. If that happens, use B.2.

### B.2 — Tiny local server

From inside `video-generator-web/`:

```bash
# any of these work:
python3 -m http.server 8000
# or
npx serve .
# or
npx http-server -p 8000
```

Open <http://localhost:8000>.

### B.3 — VS Code Live Server

Install the "Live Server" extension, right-click `index.html`, "Open with Live Server".

---

## Option C · Vercel / Netlify / Cloudflare Pages

All three accept static sites with zero config. Drag-and-drop the `video-generator-web/` folder onto Vercel's deploy box, or run `netlify deploy --dir=video-generator-web --prod` after `npm i -g netlify-cli`.

---

## Custom domain

In GitHub Pages settings, add a custom domain (e.g. `vg.yoursite.com`). Add a CNAME record at your DNS provider pointing to `YOUR_USERNAME.github.io`.

---

## Notes on security

The dashboard puts your API keys in **localStorage**, scoped to whatever origin you serve it from.

- If you deploy to `your-username.github.io/zero-video-generator/`, only pages on `your-username.github.io` can read those keys.
- Anyone who can open the deployed page in their own browser will have an empty key store — they'd need to paste their own keys. The deployed code does not contain any keys.
- The Supabase anon key is safe to ship in the page — it's gated by Row Level Security policies (`SUPABASE_SETUP.sql`).

If you'd rather not have AI keys in browser storage at all, see the README's "Tightening security" section for the Edge Function variant (later upgrade — current version is keys-in-browser by design for solo founder use).

---

## Updating

After making changes:

```bash
git add .
git commit -m "Tweak the script editor"
git push
```

GitHub Pages redeploys automatically in ~30 seconds. Hard refresh (Cmd+Shift+R) to bypass cache.

---

## Cost ceiling

- **GitHub Pages** — free, unlimited bandwidth for public repos.
- **Supabase free tier** — 500 MB database, 1 GB file storage, 2 GB bandwidth/month. A typical session uses ~3 MB (audio + HTML), so you can store ~300 generated videos before hitting the storage cap.
- **AI costs** are pay-per-use:
  - Claude Sonnet 4.5 script: ~$0.04
  - GPT-4o script: ~$0.06
  - Gemini 2.5 Pro script: free under the AI Studio tier
  - ElevenLabs voice (130s narration): ~$0.30 on the Starter plan, free under 10k chars/month

A typical full session = $0.10–$0.40 of API costs.
