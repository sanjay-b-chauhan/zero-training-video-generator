# Quickstart — get the dashboard running in 60 seconds

Pick the path that matches what you want to do. **You don't need to do all of them — pick one.**

---

## Path A · Just want to try it on your Mac (no GitHub, no deploy)

This is the fastest path. Zero setup.

1. In Finder, open the `video-generator-web` folder.
2. **Double-click** `run.command`.
3. A Terminal window opens. Chrome opens automatically to `http://localhost:8000`.
4. The dashboard loads. You're done.

To stop the server, close the Terminal window.

> **First-time-only on Mac:** macOS may say `"run.command" cannot be opened because it is from an unidentified developer.` Right-click → Open → Open. After that one-time approval, double-click works forever.

---

## Path B · Just want to try it on Windows

1. In Explorer, open the `video-generator-web` folder.
2. **Double-click** `run.bat`.
3. A black command window opens. Chrome opens to `http://localhost:8000`.
4. The dashboard loads. You're done.

To stop the server, close the command window.

> Requires Python — install from <https://python.org> if you don't have it.

---

## Path C · Deploy to GitHub Pages (live URL anyone can visit)

This puts the dashboard on the web at `https://YOUR_USERNAME.github.io/REPO_NAME/`. Best when you want to test from your phone, share with others, or have a permanent URL.

Run these in Terminal, replacing `YOUR_USERNAME` with your GitHub handle:

```bash
# 1. Inside the video-generator-web folder
cd "video-generator-web"

# 2. Initialize git
git init
git add .
git commit -m "zero video generator"

# 3. Create a public repo on GitHub.com first (call it whatever you like)
#    e.g. "zero-video-generator"
#    Then come back and run:
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/zero-video-generator.git
git push -u origin main
```

**Then enable Pages:**

1. Go to your repo on github.com.
2. Click **Settings** (top nav).
3. In the left sidebar, click **Pages**.
4. **Source** → "Deploy from a branch". **Branch** → `main` / `(root)`. Click **Save**.
5. Wait ~30 seconds. The page shows the live URL: `https://YOUR_USERNAME.github.io/zero-video-generator/`
6. Open that URL. The dashboard loads.

**To push updates after the first deploy:**

```bash
git add .
git commit -m "tweak the script editor"
git push
```

GitHub auto-redeploys in ~30 seconds.

---

## After the dashboard loads (any path)

1. **You should see a yellow banner** that says "Your Supabase project is reachable, but the sessions table doesn't exist yet."
2. Click **Copy SQL** in the banner.
3. Click **Open SQL editor →** — it deep-links straight into your project's SQL editor.
4. **Paste** (Cmd+V or Ctrl+V) into the empty query box.
5. Click the green **Run** button (top-right of the editor).
6. You'll see: `Success. No rows returned.`
7. Switch back to the dashboard tab. Refresh. Banner gone.

Now click the gear icon (top-right of the dashboard), paste your AI keys:

| Provider     | Where                                                           |
|--------------|-----------------------------------------------------------------|
| Anthropic    | <https://console.anthropic.com/settings/keys>                   |
| OpenAI       | <https://platform.openai.com/api-keys>                          |
| Google       | <https://aistudio.google.com/apikey> (free tier)                |
| ElevenLabs   | <https://elevenlabs.io/app/settings/api-keys> (10k chars/mo free) |

You only need **one** of Anthropic / OpenAI / Google + **ElevenLabs**. Click Save.

Click **+ New video**. Type a concept. Click Continue. You're generating.

---

## Troubleshooting

**"Page is blank / nothing happens when I click + New video"**
→ You opened `index.html` by double-clicking it. Chrome blocks ES modules from `file://` URLs. Use `run.command` (Mac) or `run.bat` (Windows) instead.

**"Yellow banner says 'Schema missing'"**
→ Click Copy SQL, then Open SQL editor →, paste, Run. (See the steps above.)

**"401 Unauthorized" when generating script**
→ The AI provider key isn't set or is wrong. Open Settings (gear icon) and re-paste.

**"Supabase needed to host audio"**
→ Either the Supabase setup banner is still showing (run the SQL), or your Supabase URL/key were entered wrong.

**Other issue?**
→ Open Chrome DevTools (Cmd+Opt+I) → Console tab. Any red error message tells you exactly what failed.
