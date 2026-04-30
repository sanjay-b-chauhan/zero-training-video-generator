// zero · video generator — workspace logic (simplified)
//
// Two routes: #/ (homepage) and #/s/:id (workspace).
// Workspace has 4 tabs: Brief → Script → Voice → Render.
//
// The script is shown + edited as a screenplay textarea. The structured
// 10-beat JSON is kept internally so the video assembler still has what
// it needs to draw visuals; the screenplay is the founder-facing artifact.

import { generateScript, MODEL_CATALOG } from './lib/ai/scriptGenerator.js';
import { generateNarration } from './lib/ai/voicePipeline.js';
import { extractAnchors, buildSections, buildProbeList, sceneAnchorId } from './lib/ai/anchorExtractor.js';
import { assembleVideoHTML } from './lib/ai/videoAssembler.js';
import { renderPreviewHTML } from './lib/previewRenderer.js';
import { generateMockScript } from './lib/mockScript.js';
import { toScreenplay, beatChipDefinitions, detectBeats } from './lib/screenplay.js';
import { startLoaderSequence, LOADER_TRACKS, renderLoaderPreviewHTML } from './lib/loaders.js';
import {
  getKey, setKey, providersAvailable,
  getSupabase, setSupabase, hasSupabase, maskKey,
} from './lib/settings.js';
import * as sessionsStore from './lib/sessions.js';
import * as sbApi from './lib/supabase.js';

const $  = (id) => document.getElementById(id);
const $$ = (sel, root = document) => root.querySelectorAll(sel);

const state = {
  providers: providersAvailable(),
  currentSession: null,
  currentTab: 'brief',
  previewMode: 'screenplay',   // 'screenplay' | 'visual'
  route: { name: 'home', params: {} },
  supabaseStatus: 'unconfigured',
};
let activeProvider = 'mock';

// ---- toast + loader ----
function toast(msg, kind = 'info') {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'toast' + (kind === 'error' ? ' error' : kind === 'success' ? ' success' : '');
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 3500);
}
// The fullscreen loader is now only used for short, non-AI ops (loading
// a session, deleting, etc.). AI ops use the in-iframe loader via beginOp.
function showLoader(msg, sub = '') {
  $('loader').hidden = false;
  $('loaderMsg').textContent = msg || 'Working…';
  $('loaderSub').textContent = sub || '';
  $('loaderCancel').hidden = true;
}
function hideLoader() {
  $('loader').hidden = true;
  $('loaderCancel').hidden = true;
}

// Begin an interruptible long-running operation. Replaces the right
// preview iframe content with the "AI is writing" loader page, and
// returns a cleanup() that the caller MUST invoke in finally().
function beginOp(loaderTrack, intervalMs, opTitle = 'AI is working on your video') {
  const abort = new AbortController();
  state.activeAbort = abort;
  state.opActive = true;

  // Take over the right preview iframe with the loader page.
  const iframe = $('wsPreview');
  iframe.removeAttribute('src');
  iframe.dataset.loadedUrl = '';
  iframe.dataset.assemblyKey = '';
  iframe.srcdoc = renderLoaderPreviewHTML(opTitle);

  // Wait for iframe to load before starting the sequence (otherwise the
  // first postMessage gets lost).
  const waitForLoad = new Promise((res) => {
    if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') return res();
    iframe.addEventListener('load', () => res(), { once: true });
  });
  let stopSeq = () => {};
  waitForLoad.then(() => {
    if (state.activeAbort !== abort) return;   // already cleaned up
    stopSeq = startLoaderSequence(loaderTrack, intervalMs);
  });

  return {
    signal: abort.signal,
    cleanup: () => {
      stopSeq();
      state.opActive = false;
      state.activeAbort = null;
      // Restore the natural preview for the current tab + state
      refreshPreview();
    },
  };
}

// Listen for cancel posts from inside the loader iframe.
window.addEventListener('message', (e) => {
  if (e.data?.type === 'loader-cancel' && state.activeAbort) {
    state.activeAbort.abort();
    state.activeAbort = null;
  }
});

// Detect AbortError so we can show a clean toast instead of an error.
function isAbort(err) {
  return err && (err.name === 'AbortError' || /aborted/i.test(err.message || ''));
}

function escapeHTML(s) {
  return String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
}
function fmtTimeAgo(ts) {
  const d = new Date(ts); const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// =====================================================================
// router
// =====================================================================

function parseHash() {
  const h = (location.hash || '#/').replace(/^#/, '');
  if (h === '/' || h === '') return { name: 'home', params: {} };
  if (h === '/new') return { name: 'new', params: {} };
  const m = h.match(/^\/s\/([^\/]+)$/);
  if (m) return { name: 'workspace', params: { id: m[1] } };
  return { name: 'home', params: {} };
}

async function handleRoute() {
  const route = parseHash();
  state.route = route;
  $$('.view').forEach(v => v.hidden = true);

  if (route.name === 'home') {
    document.querySelector('.view-home').hidden = false;
    state.currentSession = null;
    await renderHome();
    return;
  }
  if (route.name === 'new') {
    const session = await sessionsStore.createSession({
      concept: '', focus: null, audience_level: 'intermediate', tone: 'warm-mentor',
      duration_target: 130, status: 'draft',
    });
    location.hash = `#/s/${session.id}`;
    return;
  }
  if (route.name === 'workspace') {
    document.querySelector('.view-workspace').hidden = false;
    showLoader('Loading session…');
    try {
      const row = await sessionsStore.getSession(route.params.id);
      if (!row) { toast('Session not found', 'error'); location.hash = '#/'; return; }
      state.currentSession = sessionsStore.hydrate(row);
      renderWorkspace();
    } finally { hideLoader(); }
  }
}
window.addEventListener('hashchange', handleRoute);

// =====================================================================
// supabase health
// =====================================================================

async function checkSupabaseHealth() {
  if (!hasSupabase()) { state.supabaseStatus = 'unconfigured'; return; }
  try {
    const r = await sbApi.testConnection();
    if (r.ok) { state.supabaseStatus = 'ok'; return; }
    if (/relation "public\.sessions"|PGRST205|does not exist/i.test(r.error || '')) {
      state.supabaseStatus = 'needs-migration';
    } else { state.supabaseStatus = 'unreachable'; }
  } catch { state.supabaseStatus = 'unreachable'; }
}

function renderSetupBanner() {
  const banner = $('setupBanner'); const msg = $('setupBannerMsg'); const actions = $('setupBannerActions');
  if (state.supabaseStatus === 'needs-migration') {
    const sb = getSupabase();
    const projectRef = (sb.url.match(/https?:\/\/([^.]+)\.supabase\.co/) || [])[1];
    const sqlEditor = projectRef ? `https://supabase.com/dashboard/project/${projectRef}/sql/new` : 'https://supabase.com/dashboard';
    msg.innerHTML = `Your Supabase project is reachable, but the <code>sessions</code> table doesn't exist yet. Until you run the migration, sessions stay in this browser.`;
    actions.innerHTML = `<button class="btn btn-secondary" id="copySqlBtn">Copy SQL</button><a class="btn btn-brand" href="${sqlEditor}" target="_blank">Open SQL editor →</a>`;
    banner.hidden = false;
    $('copySqlBtn')?.addEventListener('click', copySqlToClipboard);
  } else if (state.supabaseStatus === 'unreachable') {
    msg.innerHTML = `Supabase URL or key looks wrong. Sessions saving locally instead.`;
    actions.innerHTML = `<button class="btn btn-secondary" id="bannerOpenSettings">Open settings</button>`;
    banner.hidden = false;
    $('bannerOpenSettings')?.addEventListener('click', openSettings);
  } else { banner.hidden = true; }
}

async function copySqlToClipboard() {
  try {
    const res = await fetch('./SUPABASE_SETUP.sql');
    const sql = await res.text();
    await navigator.clipboard.writeText(sql);
    toast('SQL copied. Paste into Supabase SQL editor → Run.', 'success');
  } catch (err) { toast('Copy failed: ' + err.message, 'error'); }
}

// =====================================================================
// homepage
// =====================================================================

async function renderHome() {
  state.providers = providersAvailable();
  await checkSupabaseHealth();
  renderSetupBanner();
  refreshTopbarPills();

  const rows = await sessionsStore.listSessions();
  const grid = $('homeGrid');
  const stats = $('homeStats');

  if (rows.length > 0) {
    const total = rows.length;
    const rendered = rows.filter(r => r.status === 'rendered').length;
    const voiced = rows.filter(r => r.status === 'voiced').length;
    const drafts = rows.filter(r => r.status === 'scripted' || r.status === 'draft').length;
    stats.innerHTML = `
      <div class="stat-pill"><div class="stat-num">${total}</div><div class="stat-label">total</div></div>
      <div class="stat-pill"><div class="stat-num">${rendered}</div><div class="stat-label">rendered</div></div>
      <div class="stat-pill"><div class="stat-num">${voiced}</div><div class="stat-label">voiced</div></div>
      <div class="stat-pill"><div class="stat-num">${drafts}</div><div class="stat-label">drafts</div></div>`;
  } else { stats.innerHTML = ''; }

  const newCard = `
    <a href="#/new" class="session-card new-card">
      <div class="nc-plus">+</div>
      <div><div class="nc-text">New video</div><div class="nc-sub">Start from a concept</div></div>
    </a>`;
  const cards = rows.map(s => sessionCardHTML(s)).join('');
  grid.innerHTML = newCard + cards;

  grid.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    const id = b.dataset.delete;
    const s = rows.find(r => r.id === id);
    confirmDelete(s);
  }));
}

function sessionCardHTML(s) {
  const status = s.status || 'draft';
  const focus = s.focus || '—';
  const dur = s.duration_target ? `${s.duration_target}s` : '—';
  return `
    <a href="#/s/${s.id}" class="session-card" data-id="${s.id}">
      <button class="sc-delete" title="Delete" data-delete="${s.id}">✕</button>
      <span class="sc-status ${status}">${status}</span>
      <div class="sc-concept">${escapeHTML(s.concept || 'Untitled')}</div>
      <div class="sc-focus">${escapeHTML(focus)}</div>
      <div class="sc-meta">
        <span>${escapeHTML(dur)}</span><span>·</span>
        <span>${fmtTimeAgo(s.created_at)}</span>
      </div>
    </a>`;
}

function refreshTopbarPills() {
  const cp = $('cloudPill'); const cpt = $('cloudPillText');
  const mp = $('mockPill'); const wsmp = $('wsMockPill');
  const isCloud = hasSupabase() && state.supabaseStatus === 'ok';
  if (cp) {
    cp.classList.toggle('is-cloud', isCloud);
    cpt.textContent = isCloud ? 'cloud · supabase' : (hasSupabase() ? 'local fallback' : 'local only');
  }
  const anyAi = state.providers.anthropic || state.providers.google;
  const isMock = !anyAi;
  if (mp) mp.hidden = !isMock;
  if (wsmp) wsmp.hidden = !isMock;
}

// =====================================================================
// confirm delete
// =====================================================================

function confirmDelete(session) {
  const dlg = $('confirmDialog');
  $('confirmTitle').textContent = `Delete "${session.concept || 'Untitled'}"?`;
  $('confirmMsg').textContent = `This removes the session, the script, the audio, and the rendered HTML. Cannot be undone.`;
  dlg.hidden = false;
  const onCancel = () => { dlg.hidden = true; cleanup(); };
  const onOk = async () => {
    dlg.hidden = true; cleanup();
    showLoader('Deleting…');
    try {
      await sessionsStore.deleteSession(session.id);
      toast('Deleted', 'success');
      if (state.route.name === 'workspace' && state.currentSession?.id === session.id) {
        location.hash = '#/';
      } else { await renderHome(); }
    } catch (err) { toast(err.message, 'error'); }
    finally { hideLoader(); }
  };
  function cleanup() {
    $('confirmCancel').removeEventListener('click', onCancel);
    $('confirmOk').removeEventListener('click', onOk);
  }
  $('confirmCancel').addEventListener('click', onCancel);
  $('confirmOk').addEventListener('click', onOk);
}

// =====================================================================
// workspace orchestration
// =====================================================================

function renderWorkspace() {
  const s = state.currentSession;
  state.providers = providersAvailable();
  refreshTopbarPills();
  setupRichEditors();

  $('wsTitle').value = s.concept || '';
  $('wsStatus').textContent = s.status || 'draft';

  // brief tab — restore RTE content (HTML or empty)
  $('b_concept').value = s.concept || '';
  $('b_focus').value = s.focus || '';
  $('b_outline').innerHTML = s.outline || '';
  $('b_duration').value = s.duration_target || 130;
  $('b_duration_val').textContent = ($('b_duration').value) + 's';

  refreshProviderButtons();

  // Pick the right starting tab. If the user lands on a session that's
  // partially through the flow, drop them at the next-active step.
  let startTab = 'brief';
  if (s.video_url)        startTab = 'render';
  else if (s.audio_url)   startTab = 'render';
  else if (s.script_approved) startTab = 'voice';
  else if (s.script)      startTab = 'script';
  state.currentTab = startTab;

  refreshPreview();
  switchTab(state.currentTab);
}

// =====================================================================
// rich-text editor (contenteditable + toolbar)
// =====================================================================

function setupRichEditors() {
  $$('.rich-editor').forEach(wrap => {
    if (wrap.dataset.wired === '1') return;
    wrap.dataset.wired = '1';
    const content = wrap.querySelector('.re-content');
    wrap.querySelectorAll('.re-btn').forEach(btn => {
      btn.addEventListener('mousedown', e => {
        e.preventDefault();
        const cmd = btn.dataset.cmd;
        if (cmd.startsWith('formatBlock-')) {
          document.execCommand('formatBlock', false, cmd.split('-')[1]);
        } else {
          document.execCommand(cmd, false);
        }
        content.focus();
      });
    });
    // Persist on blur (debounced for typing)
    content.addEventListener('input', () => {
      clearTimeout(content._t);
      content._t = setTimeout(() => persistRichEditor(content), 600);
    });
  });
}

async function persistRichEditor(contentEl) {
  if (!state.currentSession) return;
  const id = contentEl.id;
  const html = contentEl.innerHTML.trim();
  if (id === 'b_outline') await persist({ outline: html });
  else if (id === 's_framework') {
    // Same column as Brief's outline — the framework editor on Script tab
    // is just a continuation of it. Keep the two surfaces in sync so the
    // founder can flip between Brief and Script without losing edits.
    await persist({ outline: html });
    const briefEl = $('b_outline');
    if (briefEl && !briefEl.matches(':focus')) briefEl.innerHTML = html;
  }
  else if (id === 'v_instructions') await persist({ voice_instructions: html });
}

function rtePlainText(htmlOrEl) {
  // Best-effort plain text from HTML for sending to AI / TTS
  const tmp = document.createElement('div');
  tmp.innerHTML = typeof htmlOrEl === 'string' ? htmlOrEl : htmlOrEl.innerHTML;
  return tmp.textContent.trim();
}

// =====================================================================
// Default framework — the founder's canonical "mentor style + concept
// explanation + application process" structure. Inserted into either
// framework editor (Brief or Script tab) when the founder clicks
// "Use sample". Authored once, reused everywhere.
// =====================================================================
const DEFAULT_FRAMEWORK_HTML = `
<h3>Mentor style &amp; narration framework</h3>
<ol>
  <li>
    <strong>Mentor Introduction</strong>
    <p>Opens with a burst of genuine enthusiasm — signal that what's coming is exciting, valuable, and worth paying attention to. Short, but enough to get the student leaned in. Then delivers the one-liner of exactly what will be learned, followed by a personal story — a real project the mentor worked on and how they applied this skill. Makes it credible and relatable from the start.</p>
  </li>
  <li>
    <strong>Concept Explanation</strong>
    <p>Three parts that build understanding progressively:</p>
    <ul>
      <li><strong>What it is</strong> — A clear, in-depth explanation of the concept, delivered visually. Think whiteboard-style: process maps, diagrams, or visuals that make the concept easier to grasp than words alone.</li>
      <li><strong>Real-world examples</strong> — Three quick examples using well-known companies (Google, Netflix, Uber, Spotify, etc.) so no additional context is needed. The familiarity lets the concept land faster.</li>
      <li><strong>Analogy</strong> — One simple analogy that ties it all together and makes it easy to remember.</li>
    </ul>
  </li>
  <li>
    <strong>Application Process</strong>
    <p>A concise, high-level step-by-step walkthrough of exactly how to apply the concept, including:</p>
    <ul>
      <li>The specific tools being used.</li>
      <li>Clear sequential steps from start to finish.</li>
      <li>Callouts for common mistakes or things to keep in mind along the way.</li>
      <li><strong>AI hallucination warnings</strong> — wherever AI is used in the process, flag exactly where it tends to hallucinate, what it might get wrong, and what the student should always double-check. Never assume AI output is correct.</li>
    </ul>
    <p><em>Condense the process into a maximum of 5 steps.</em></p>
  </li>
</ol>
`.trim();

// Wire BOTH "Use sample" buttons (Brief + Script tab) to insert the
// default framework. data-target tells us which contenteditable to fill.
// We:
//   1. Confirm before overwriting non-empty content (don't blow away
//      something the founder typed by accident).
//   2. Inject the HTML.
//   3. Persist immediately (bypass the debounce).
//   4. Sync the sibling editor (Brief ↔ Script share the `outline` column).
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.lbl-action[data-target]');
  if (!btn) return;
  const targetId = btn.dataset.target;
  const target = document.getElementById(targetId);
  if (!target) return;
  const existing = target.innerHTML.trim();
  const hasContent = existing && rtePlainText(existing).length > 8;
  if (hasContent && !confirm('Replace your current framework with the Zero sample?')) {
    return;
  }
  target.innerHTML = DEFAULT_FRAMEWORK_HTML;

  // Persist + sync the sibling editor on the OTHER tab.
  if (state.currentSession) {
    await persist({ outline: DEFAULT_FRAMEWORK_HTML });
  }
  const sibling = targetId === 'b_outline' ? document.getElementById('s_framework')
                : targetId === 's_framework' ? document.getElementById('b_outline')
                : null;
  if (sibling && !sibling.matches(':focus')) sibling.innerHTML = DEFAULT_FRAMEWORK_HTML;
  toast('Sample framework inserted', 'success');
});

// ---- Linear flow tab gating ----
// A tab is locked until its prerequisite is satisfied:
//   brief   → always available
//   script  → script_json exists (after Generate)
//   voice   → script_approved is true (Continue clicked on Script tab)
//   render  → audio_url exists (after Generate narration)
function tabUnlocked(tab) {
  const s = state.currentSession;
  if (!s) return tab === 'brief';
  switch (tab) {
    case 'brief':  return true;
    case 'script': return !!s.script;
    case 'voice':  return !!s.script_approved;
    case 'render': return !!s.audio_url;
    default: return false;
  }
}

function refreshTabStates() {
  const tabs = ['brief', 'script', 'voice', 'render'];
  const s = state.currentSession;
  tabs.forEach((tab, i) => {
    const el = document.querySelector(`.ws-tab[data-tab="${tab}"]`);
    if (!el) return;
    const unlocked = tabUnlocked(tab);
    const stateLabel = el.querySelector('.wt-state');
    el.classList.remove('is-active', 'is-locked', 'is-done');
    // active
    if (state.currentTab === tab) { el.classList.add('is-active'); stateLabel.textContent = ''; return; }
    // locked
    if (!unlocked) { el.classList.add('is-locked'); stateLabel.textContent = 'locked'; return; }
    // done check (current step completed)
    let done = false;
    if (tab === 'brief'  && s?.script) done = true;
    if (tab === 'script' && s?.script_approved) done = true;
    if (tab === 'voice'  && s?.audio_url) done = true;
    if (tab === 'render' && s?.video_url) done = true;
    if (done) { el.classList.add('is-done'); stateLabel.textContent = 'done'; return; }
    stateLabel.textContent = '';
  });
}

function switchTab(tab) {
  if (!tabUnlocked(tab)) {
    toast('Complete the previous step first', 'error');
    return;
  }
  state.currentTab = tab;
  $$('.ws-panel').forEach(p => p.classList.toggle('is-active', p.dataset.tab === tab));
  refreshTabStates();
  // Per-tab default preview mode (dynamic — Visual is only available on
  // Render tab once the video has been assembled).
  const allowed = tabPreviewModes(tab, state.currentSession);
  if (!allowed.includes(state.previewMode)) state.previewMode = allowed[0];
  if (tab === 'script') renderScriptTab();
  if (tab === 'voice')  renderVoiceTab();
  if (tab === 'render') renderRenderTab();
  refreshPreview();
}
$$('.ws-tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

// =====================================================================
// preview
// =====================================================================

$$('.preview-toggle').forEach(b => b.addEventListener('click', () => {
  state.previewMode = b.dataset.mode;
  $$('.preview-toggle').forEach(x => x.classList.toggle('is-active', x === b));
  refreshPreview();
}));

// Tab-aware preview toggles.
//   - Once a video has been assembled, the "Visual" mode is available
//     EVERYWHERE so the user can keep watching it while tweaking later steps.
//   - The old standalone "voice" (caption highlighter) mode is gone — the
//     screenplay preview now embeds the audio player at the top when audio
//     exists, so we don't need a duplicate view.
function tabPreviewModes(tab, session) {
  const hasVideo = !!session?.video_url;
  const modes = [];
  if (hasVideo) modes.push('visual');
  modes.push('screenplay');
  return modes;
}
// Backwards-compatible static map (kept for any code that still reads it).
const TAB_PREVIEW_MODES = {
  brief:  ['screenplay'],
  script: ['screenplay'],
  voice:  ['voice', 'screenplay'],
  render: ['screenplay'],
};
const PREVIEW_LABELS = {
  screenplay: 'Screenplay',
  visual: 'Visual preview',
  voice: 'Voice + caption',
};

function renderPreviewToggles() {
  const wrap = $('wpbToggles');
  if (!wrap) return;
  const modes = tabPreviewModes(state.currentTab, state.currentSession);
  // If the current preview mode isn't in the allowed set, snap to the first
  if (!modes.includes(state.previewMode)) state.previewMode = modes[0];
  if (modes.length <= 1) {
    wrap.innerHTML = `<span class="wpb-single type-mono-label">${PREVIEW_LABELS[modes[0]]}</span>`;
    return;
  }
  wrap.innerHTML = modes.map(m => `
    <button class="preview-toggle ${m === state.previewMode ? 'is-active' : ''}" data-mode="${m}">${PREVIEW_LABELS[m]}</button>
  `).join('');
  wrap.querySelectorAll('.preview-toggle').forEach(b => b.addEventListener('click', () => {
    state.previewMode = b.dataset.mode;
    renderPreviewToggles();
    refreshPreview();
  }));
}

function refreshPreview() {
  // While a loader iframe is in flight, leave it alone.
  if (state.opActive) return;

  const iframe = $('wsPreview');
  const s = state.currentSession;
  const script = s?.script;
  const mode = $('wpbMode');

  renderPreviewToggles();

  // VISUAL mode + assembled video. Two paths:
  //
  // 1. MOCK session (script_provider === 'mock') — load the bundled
  //    sample video directly. It's a hand-built explainer the founder
  //    already knows, so it's the most honest preview of "what the final
  //    output will look like" until real generation is wired.
  //
  // 2. Real session — render the assembled HTML INLINE via srcdoc. We
  //    deliberately don't use iframe.src on the Supabase URL because
  //    Storage sometimes serves the file with the wrong MIME and Chrome
  //    falls back to "view source". srcdoc bypasses that.
  if (state.previewMode === 'visual' && s?.video_url) {
    const isMock = s.script_provider === 'mock';
    if (isMock) {
      const mockUrl = './mock-assets/avery-mock-video.html';
      if (iframe.dataset.loadedUrl !== mockUrl) {
        iframe.removeAttribute('srcdoc');
        iframe.src = mockUrl;
        iframe.dataset.loadedUrl = mockUrl;
        iframe.dataset.assemblyKey = '';
      }
      if (mode) { mode.textContent = 'sample video · mock'; mode.classList.add('is-real'); }
      return;
    }

    if (s?.script && s?.anchors) {
      const cacheKey = `${s.id}::${s.audio_url || ''}::${(s.anchors.total || 0).toFixed(2)}`;
      if (iframe.dataset.assemblyKey !== cacheKey) {
        try {
          const html = assembleVideoHTML({
            script: s.script,
            anchors: s.anchors.A,
            sections: s.anchors.sections,
            total: s.anchors.total,
            audioFilename: s.audio_url,
            sessionId: s.id,
          });
          iframe.removeAttribute('src');
          iframe.srcdoc = html;
          iframe.dataset.assemblyKey = cacheKey;
          iframe.dataset.loadedUrl = '';
        } catch (err) {
          console.error('Inline assembly failed, falling back to URL', err);
          iframe.removeAttribute('srcdoc');
          iframe.src = s.video_url;
        }
      }
      if (mode) { mode.textContent = 'real video'; mode.classList.add('is-real'); }
      return;
    }
  }

  // Else we render an inline doc into the iframe via srcdoc
  iframe.removeAttribute('src');
  iframe.dataset.loadedUrl = '';
  if (state.previewMode === 'screenplay') {
    // Pass audio_url so the screenplay embeds an audio player at the top
    // when narration exists. Replaces the old separate "voice" mode.
    iframe.srcdoc = renderScreenplayPage(script, { audioUrl: s?.audio_url || '' });
  } else {
    iframe.srcdoc = renderPreviewHTML(script);
  }
  if (mode) {
    if (state.previewMode === 'visual') {
      mode.textContent = 'static preview · assemble for real video';
      mode.classList.remove('is-real');
    } else {
      // Pill on the preview header — show the actual SCRIPT source, not
      // the render state. "Mock" here means the script came from the
      // bundled mock generator; otherwise show which provider wrote it
      // (Gemini / Claude / GPT). This was previously labeling everything
      // "mock" until a video was assembled, which made it look like the
      // script wasn't from AI even when it clearly was.
      const provider = s?.script_provider;
      const PROVIDER_LABELS = { mock: 'Mock script', google: 'Gemini', anthropic: 'Claude', openai: 'GPT', ollama: 'Kimi · Ollama' };
      const providerLabel = PROVIDER_LABELS[provider] || (provider ? provider : 'No script');
      mode.textContent = providerLabel;
      mode.classList.toggle('is-real', provider && provider !== 'mock');
      mode.classList.toggle('is-real', !!s?.video_url);
    }
  }
}

// Build the voice preview iframe: sticky audio at the top, screenplay
// underneath split into per-scene chunks. As audio plays, the current
// scene gets `is-current` and auto-scrolls into view (caption-style).
function renderVoicePreviewPage(s) {
  const audioUrl = s?.audio_url || '';
  const sections = s?.anchors?.sections || [];
  const script = s?.script;

  if (!audioUrl) {
    // No audio yet — friendly placeholder
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Faculty+Glyphic&family=Google+Sans+Flex:opsz,wght@6..144,100..1000&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  body { margin: 0; height: 100vh; background: rgb(246,245,243); font-family: 'Google Sans Flex', system-ui, sans-serif; display: grid; place-items: center; padding: 40px; }
  .empty { text-align: center; max-width: 380px; color: rgba(31,29,30,0.5); font-family: 'JetBrains Mono', monospace; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
  .empty .big { font-family: 'Faculty Glyphic', Georgia, serif; font-size: 32px; color: rgb(24,67,47); text-transform: none; letter-spacing: -0.02em; margin-bottom: 12px; line-height: 1.1; }
</style>
</head><body><div class="empty"><div class="big">Voice preview lives here</div>Click Generate narration on the left.</div></body></html>`;
  }

  // Build scene blocks. Each scene includes the narration as the spoken
  // text, with v3 cues rendered as outlined chips so they don't read as words.
  const blocks = sections.map((sec) => {
    const beat = script?.[sec.id] || {};
    const narration = beat.narration || '';
    return {
      id: sec.id,
      label: BEAT_DISPLAY_LABEL[sec.id] || sec.id,
      start: sec.start,
      end: sec.end,
      narration,
    };
  });

  const blocksHTML = blocks.map((b, i) => `
    <section class="scene" data-i="${i}" data-start="${b.start}" data-end="${b.end}">
      <div class="scene-meta">
        <span class="scene-num">${String(i + 1).padStart(2, '0')}</span>
        <span class="scene-name">${escapeHTML(b.label)}</span>
        <span class="scene-time">${formatClock(b.start)} – ${formatClock(b.end)}</span>
      </div>
      <p class="scene-line">${highlightCues(escapeHTML(b.narration))}</p>
    </section>
  `).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Faculty+Glyphic&family=Google+Sans+Flex:opsz,wght@6..144,100..1000&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root {
    --font-display: 'Faculty Glyphic', Georgia, serif;
    --font-sans:    'Google Sans Flex', system-ui, sans-serif;
    --font-mono:    'JetBrains Mono', monospace;
    --bg-app: rgb(246,245,243);
    --bg-surface: rgb(255,255,255);
    --bg-cream: rgb(242,240,237);
    --fg-1: rgb(31,29,30);
    --fg-2: rgba(31,29,30,0.7);
    --fg-3: rgba(31,29,30,0.5);
    --green-500: rgb(73,186,97);
    --green-700: rgb(42,110,72);
    --green-800: rgb(24,67,47);
    --green-50:  rgb(232,249,237);
    --success-tint: rgb(240,249,242);
    --success-soft: rgb(219,241,223);
    --border-hair: rgba(31,29,30,0.06);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; background: var(--bg-app); font-family: var(--font-sans); color: var(--fg-1); -webkit-font-smoothing: antialiased; }
  body { display: flex; flex-direction: column; }

  .voice-bar {
    position: sticky; top: 0; z-index: 10;
    background: rgba(246,245,243,0.96);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--border-hair);
    padding: 18px 32px;
    display: flex; flex-direction: column; gap: 8px;
  }
  .vb-meta { display: flex; align-items: center; gap: 10px; font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--fg-3); }
  .vb-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green-500); animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 0.4 } 50% { opacity: 1 } }
  audio { width: 100%; height: 38px; }

  .scenes { padding: 32px 40px 80px; max-width: 760px; margin: 0 auto; width: 100%; }
  .scene {
    border-left: 3px solid transparent;
    padding: 18px 22px;
    margin-bottom: 8px;
    border-radius: 14px;
    background: transparent;
    transition: all 220ms cubic-bezier(0.22,1,0.36,1);
    scroll-margin-top: 100px;
  }
  .scene.is-current {
    background: var(--success-tint);
    border-color: var(--green-500);
    box-shadow: 0 0 0 3px var(--success-soft);
  }
  .scene.is-past { opacity: 0.55; }
  .scene-meta {
    display: flex; align-items: baseline; gap: 10px;
    font-family: var(--font-mono); font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.04em;
    color: var(--fg-3);
    margin-bottom: 8px;
  }
  .scene.is-current .scene-meta { color: var(--green-700); }
  .scene-num { color: var(--fg-3); }
  .scene-name { color: var(--fg-1); font-weight: 600; }
  .scene.is-current .scene-name { color: var(--green-800); }
  .scene-time { margin-left: auto; }
  .scene-line {
    font-family: var(--font-sans);
    font-size: 17px; line-height: 1.65;
    color: var(--fg-1);
    text-wrap: pretty;
    letter-spacing: -0.01em;
  }
  .scene.is-current .scene-line { color: var(--green-800); }
  .scene.is-past .scene-line { color: var(--fg-3); }
  .cue {
    display: inline-flex; align-items: center;
    background: transparent;
    color: var(--green-700);
    border: 1px solid var(--green-500);
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 12px; font-weight: 500;
    margin: 0 2px;
    vertical-align: 1px;
  }
</style>
</head><body>
  <header class="voice-bar">
    <div class="vb-meta"><span class="vb-dot"></span> voice preview · ${escapeHTML(s?.voice_id || 'mock voice')}</div>
    <audio id="aud" controls preload="auto" src="${escapeHTML(audioUrl)}"></audio>
  </header>
  <main class="scenes" id="scenes">${blocksHTML}</main>

<script>
(function () {
  const aud = document.getElementById('aud');
  const scenes = Array.from(document.querySelectorAll('.scene'));
  let last = -1;
  function tick() {
    const t = aud.currentTime;
    let cur = -1;
    for (let i = 0; i < scenes.length; i++) {
      const s = +scenes[i].dataset.start, e = +scenes[i].dataset.end;
      if (t >= s && t < e) { cur = i; break; }
    }
    if (cur === last) return;
    last = cur;
    scenes.forEach((el, i) => {
      el.classList.toggle('is-current', i === cur);
      el.classList.toggle('is-past', cur >= 0 && i < cur);
    });
    if (cur >= 0) scenes[cur].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  aud.addEventListener('timeupdate', tick);
  aud.addEventListener('seeked', tick);
})();
<\\/script>
</body></html>`;
}

const BEAT_DISPLAY_LABEL = {
  hook: 'Hook', promise: 'Promise', definition: 'Definition',
  anatomy: 'Anatomy', cousins: 'Cousins', analogy: 'Analogy',
  method: 'Method', example: 'Case', recap: 'Recap', cta: 'CTA',
};

// Render v3 cues inline as outlined pills, both in the voice preview
// and the screenplay preview.
function highlightCues(htmlSafeText) {
  return htmlSafeText.replace(
    /\[(laugh|pause|inhale|exhale|emphasize|warm|smile|sigh|whisper|excited|concerned tone|thoughtful|worried tone|crisp|direct|listing|rushed|deep breadth|deep inhale|slow|think|curious|beat)\]/gi,
    '<span class="cue">$1</span>'
  );
}

function formatClock(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function renderScreenplayPage(script, opts = {}) {
  const text = script ? toScreenplay(script) : '';
  const empty = !text;
  const audioUrl = opts.audioUrl || '';
  // Iframe uses srcdoc → relative paths to ../zds/colors_and_type.css
  // don't resolve, which means the design-system CSS variables come back
  // empty and `<pre>` falls back to its user-agent monospace.
  // Fix: load Google Fonts directly from the CDN (works in srcdoc) and
  // define just the tokens we actually use right here in the iframe.
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Faculty+Glyphic&family=Google+Sans+Flex:opsz,wght@6..144,100..1000&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root {
    --font-display: 'Faculty Glyphic', ui-serif, Georgia, serif;
    --font-sans:    'Google Sans Flex', 'Inter Tight', ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    --font-mono:    'JetBrains Mono', ui-monospace, Menlo, monospace;
    --bg-app:      rgb(246, 245, 243);
    --bg-surface:  rgb(255, 255, 255);
    --bg-cream:    rgb(242, 240, 237);
    --fg-1:        rgb(31, 29, 30);
    --fg-2:        rgba(31, 29, 30, 0.70);
    --fg-3:        rgba(31, 29, 30, 0.50);
    --fg-4:        rgba(31, 29, 30, 0.30);
    --green-500:   rgb(73, 186, 97);
    --green-700:   rgb(42, 110, 72);
    --green-800:   rgb(24, 67, 47);
    --border-hair:    rgba(31, 29, 30, 0.06);
    --border-subtle:  rgba(31, 29, 30, 0.10);
    --shadow-md: 0 4px 12px rgba(0,0,0,.05), 0 12px 24px rgba(0,0,0,.05);
  }
  body { margin: 0; height: 100vh; background: var(--bg-app); font-family: var(--font-sans); -webkit-font-smoothing: antialiased; }
  /* Sticky audio bar at the top — used when this screenplay also has narration */
  .sp-audiobar {
    position: sticky; top: 0; z-index: 10;
    background: rgba(246, 245, 243, 0.96);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--border-hair);
    padding: 12px 32px;
    display: flex; align-items: center; gap: 14px;
  }
  .sp-audiobar-meta {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--green-700);
    flex-shrink: 0;
  }
  .sp-audio { flex: 1; height: 36px; }
  .sp-wrap { max-width: 760px; margin: 0 auto; padding: 32px 40px 80px; }
  .sp-empty { display: grid; place-items: center; height: 100vh; padding: 40px; text-align: center; color: var(--fg-3); font-family: var(--font-mono); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
  .sp-empty .big { font-family: var(--font-display); font-size: 32px; color: var(--green-800); text-transform: none; letter-spacing: -0.02em; margin-bottom: 12px; line-height: 1.1; }
  .sp-paper {
    background: var(--bg-surface);
    border: 1px solid var(--border-hair);
    border-radius: 24px;
    padding: 56px 64px;
    box-shadow: var(--shadow-md);
    font-family: var(--font-sans);
    font-size: 15px;
    line-height: 1.9;
    color: var(--fg-1);
    white-space: pre-wrap;
    letter-spacing: -0.01em;
  }
  .sp-paper .sp-h1 { font-family: var(--font-display); font-size: 36px; line-height: 1; color: var(--green-800); letter-spacing: -0.03em; margin-bottom: 4px; display: block; }
  .sp-paper .sp-h2 { font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--fg-3); display: block; }
  .sp-paper .sp-scene {
    font-family: var(--font-mono); font-weight: 600;
    color: var(--green-800); font-size: 12px;
    text-transform: uppercase; letter-spacing: 0.06em;
    display: block; margin-top: 32px; padding-top: 16px;
    border-top: 1px solid var(--border-hair);
  }
  .sp-paper .sp-subscene {
    font-family: var(--font-mono); font-weight: 500;
    color: var(--fg-3); font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.04em;
    display: block; margin-top: 18px;
    padding-left: 16px;
    border-left: 2px solid var(--success-soft);
  }
  .sp-paper .sp-tone {
    color: var(--fg-3); font-style: italic;
    font-size: 13px; display: block; margin-bottom: 8px;
  }
  .sp-paper .sp-actor {
    font-family: var(--font-mono); font-weight: 600;
    color: var(--green-700); font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.06em;
    display: block; margin-top: 12px;
  }
  .sp-paper .sp-on {
    font-family: var(--font-mono); font-weight: 600;
    color: var(--fg-3); font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.06em;
    display: block; margin-top: 14px;
  }
  .sp-paper .sp-divider {
    font-family: var(--font-mono); color: var(--fg-3);
    display: block; margin-top: 24px; padding-top: 14px;
    border-top: 1px dashed var(--border-subtle);
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em;
  }
  /* Voice cues: outlined pill, NOT inline with the spoken text. */
  .sp-paper .sp-cue {
    display: inline-flex; align-items: center;
    background: transparent;
    color: var(--green-700);
    border: 1px solid var(--green-500);
    padding: 1px 8px;
    border-radius: 999px;
    font-family: var(--font-sans);
    font-size: 11px; font-weight: 500;
    line-height: 1.4;
    letter-spacing: 0;
    margin: 0 2px;
    vertical-align: 1px;
  }
</style>
</head><body class="zero-theme">
${empty ? `<div class="sp-empty">
  <div><div class="big">Screenplay lives here</div>Write your brief on the left, click Generate.</div>
</div>` : `${audioUrl ? `
<div class="sp-audiobar">
  <div class="sp-audiobar-meta">voice preview</div>
  <audio class="sp-audio" controls preload="auto" src="${escapeHTML(audioUrl)}"></audio>
</div>` : ''}
<div class="sp-wrap"><pre class="sp-paper" id="sp">${escapeHTML(text)}</pre></div>
<script>
  const el = document.getElementById('sp');
  let h = el.innerHTML;
  h = h.replace(/^# (.+)$/m, '<span class="sp-h1">$1</span>');
  h = h.replace(/^## (.+)$/gm, '<span class="sp-h2">$1</span>');
  h = h.replace(/^(SCENE \\d+ — .+)$/gm, '<span class="sp-scene">$1</span>');
  // sub-beat header: "  01 · HOOK    0:00–0:08" — appears when several
  // beats are grouped under the same custom section
  h = h.replace(/^(  \\d+ · [A-Z].+)$/gm, '<span class="sp-subscene">$1</span>');
  h = h.replace(/^\\*(.+)\\*$/gm, '<span class="sp-tone">$1</span>');
  h = h.replace(/^(AVERY \\(V\\.O\\.\\))$/gm, '<span class="sp-actor">$1</span>');
  h = h.replace(/^(ON SCREEN)$/gm, '<span class="sp-on">$1</span>');
  h = h.replace(/^(--- .+ ---)$/gm, '<span class="sp-divider">$1</span>');
  // v3 cues → outlined pill with a small dot prefix
  h = h.replace(/\\[(laugh|pause|inhale|exhale|emphasize|warm|smile|sigh|whisper|excited|concerned tone|thoughtful|worried tone|crisp|direct|listing|rushed|deep breadth|deep inhale|slow|think|curious|beat)\\]/gi,
    '<span class="sp-cue">$1<\\/span>');
  el.innerHTML = h;
<\\/script>`}
</body></html>`;
}

$('previewExpandBtn')?.addEventListener('click', () => {
  const s = state.currentSession;
  // For mock visual mode, open the bundled sample HTML directly — keeps
  // its relative audio paths working.
  if (state.previewMode === 'visual' && s?.script_provider === 'mock' && s?.video_url) {
    window.open('./mock-assets/avery-mock-video.html', '_blank');
    return;
  }
  // Otherwise: build the right HTML in memory and open via a fresh Blob URL.
  let html = '';
  if (state.previewMode === 'visual' && s?.script && s?.anchors) {
    html = assembleVideoHTML({
      script: s.script,
      anchors: s.anchors.A,
      sections: s.anchors.sections,
      total: s.anchors.total,
      audioFilename: s.audio_url,
      sessionId: s.id,
    });
  } else if (state.previewMode === 'screenplay') {
    html = renderScreenplayPage(s?.script, { audioUrl: s?.audio_url || '' });
  } else {
    html = renderPreviewHTML(s?.script);
  }
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  window.open(URL.createObjectURL(blob), '_blank');
});

// =====================================================================
// brief tab
// =====================================================================

$('wsTitle').addEventListener('change', async (e) => {
  await persist({ concept: e.target.value.trim() });
  refreshPreview();
});
$('b_concept').addEventListener('input', e => { $('wsTitle').value = e.target.value; });
$('b_duration').addEventListener('input', e => $('b_duration_val').textContent = e.target.value + 's');
$$('.suggestion-chip').forEach(c => c.addEventListener('click', () => {
  $('b_concept').value = c.dataset.suggestion;
  $('wsTitle').value = c.dataset.suggestion;
}));
$$('.ps-pick').forEach(b => b.addEventListener('click', () => pickProvider(b.dataset.provider)));

function pickProvider(p) {
  if (p !== 'mock' && !state.providers[p]) return;
  activeProvider = p;
  $$('.ps-pick').forEach(b => b.classList.toggle('is-active', b.dataset.provider === p));
  const label = $('generateBtnLabel');
  label.textContent = p === 'mock' ? 'Generate sample screenplay' : 'Generate screenplay';
}

function refreshProviderButtons() {
  for (const p of ['anthropic', 'google', 'ollama']) {
    const btn = document.querySelector(`.ps-pick[data-provider="${p}"]`);
    if (!btn) continue;
    const status = $(`psStatus${p[0].toUpperCase() + p.slice(1)}`);
    if (!status) continue;
    if (state.providers[p]) {
      btn.classList.remove('is-disabled'); status.textContent = 'ready'; status.classList.add('ready');
    } else {
      btn.classList.add('is-disabled'); status.textContent = 'no key'; status.classList.remove('ready');
    }
  }
  const first = ['anthropic', 'google', 'ollama'].find(p => state.providers[p]);
  pickProvider(first || 'mock');
}

$('generateBtn').addEventListener('click', async () => {
  const concept = $('b_concept').value.trim() || $('wsTitle').value.trim();
  if (!concept) { toast('Concept name is required', 'error'); $('b_concept').focus(); return; }
  const focus = $('b_focus').value.trim() || null;
  const outlineHtml = $('b_outline').innerHTML.trim() || null;
  const outlineText = rtePlainText(outlineHtml || '');
  const duration_target = +$('b_duration').value;

  try {
    await persist({ concept, focus, outline: outlineHtml, duration_target });
    // Reset downstream state — new generation starts a fresh flow
    await persist({ script_approved: false, audio_url: null, anchors_json: null, video_url: null });
  } catch (err) {
    console.error(err);
    toast(`Saving brief failed: ${err.message}`, 'error');
    return;
  }

  if (activeProvider === 'mock') {
    const op = beginOp(LOADER_TRACKS.scriptGenerate({ concept, focus, provider: 'mock', model: 'template' }), 1200, `Writing your screenplay${concept ? ' on ' + concept : ''}`);
    try {
      await new Promise(r => setTimeout(r, 600));
      const script = generateMockScript({ concept, focus, duration_target });
      await persist({
        script_provider: 'mock', script_model: 'mock-template',
        script_json: JSON.stringify(script), status: 'scripted',
      });
      toast('Mock screenplay generated', 'success');
      refreshTabStates();
      switchTab('script');
    } catch (err) {
      if (isAbort(err)) { toast('Cancelled', 'info'); }
      else { console.error(err); toast(err.message, 'error'); }
    } finally { op.cleanup(); }
    return;
  }

  const apiKey = getKey(activeProvider);
  if (!apiKey) { toast(`No ${activeProvider} key`, 'error'); openSettings(); return; }
  const model = MODEL_CATALOG[activeProvider]?.[0]?.id;
  const op = beginOp(LOADER_TRACKS.scriptGenerate({ concept, focus, provider: activeProvider, model }), undefined, `Writing your screenplay on ${concept}`);
  try {
    const script = await generateScript({
      concept, focus, audience_level: 'intermediate', tone: 'warm-mentor',
      duration_target, tool_url: null,
      provider: activeProvider, model, apiKey,
      // The framework input is THE structure. System prompt RULE 0 says
      // the user's framework wins over the default. Make it impossible
      // to miss in the user message.
      refine_notes: outlineText ? `============================================================
FOUNDER'S SCRIPT FRAMEWORK — THIS IS YOUR STRUCTURE.
Read it. Use the section names AS the scene labels. Map all 10
internal beats onto these sections via custom_scene_labels. Do NOT
fall back to the default HOOK/PROMISE/DEFINITION labels.
============================================================

${outlineText}

============================================================
End of framework. Now generate the JSON, with custom_scene_labels
populated to reflect the framework above.
============================================================` : null,
      previous_script: null,
      signal: op.signal,
    });
    await persist({
      script_provider: activeProvider, script_model: model,
      script_json: JSON.stringify(script), status: 'scripted',
    });
    toast('Screenplay ready', 'success');
    refreshTabStates();
    switchTab('script');
  } catch (err) {
    if (isAbort(err)) { toast('Generation cancelled', 'info'); }
    else { console.error(err); toast(err.message, 'error'); }
  } finally { op.cleanup(); }
});

// =====================================================================
// script tab
// =====================================================================

function renderScriptTab() {
  const s = state.currentSession;
  const ta = $('screenplayText');
  // Framework editor lives on the script tab now — pre-fill it with whatever
  // the founder typed in Brief so they can refine without re-typing. Once
  // they edit it here, that becomes the source of truth (we save back to
  // the same `outline` field on every keystroke debounce).
  const frameworkEl = $('s_framework');
  if (frameworkEl && !frameworkEl.matches(':focus')) {
    frameworkEl.innerHTML = s?.outline || '';
  }
  if (!s?.script) {
    ta.value = '';
    renderFrameworkChips('');
    return;
  }
  // If we have an edited screenplay text, show that. Else generate from JSON.
  const text = s.screenplay_text || toScreenplay(s.script);
  ta.value = text;
  renderFrameworkChips(text);
}

function renderFrameworkChips(text) {
  // Chips and cue legend were removed from the script tab in a later
  // simplification — the function is kept around so renderScriptTab() can
  // still call it without re-checking. If the elements aren't in the DOM,
  // we just no-op.
  const chipsEl = $('frameworkChips');
  if (chipsEl) {
    const detected = new Set(detectBeats(text).map(b => b.key));
    const all = beatChipDefinitions();
    chipsEl.innerHTML = all.map(b => {
      const on = detected.has(b.key);
      return `<span class="fw-chip ${on ? 'is-detected' : 'is-missing'}">
        <span class="fw-chip-num">${b.num}</span> ${b.name}
      </span>`;
    }).join('');
  }
  renderCueLegend(text);
}

const KNOWN_CUES = [
  'laugh','pause','inhale','exhale','emphasize','warm','smile','sigh',
  'whisper','excited','concerned tone','thoughtful','worried tone','crisp',
  'direct','listing','rushed','deep breadth','deep inhale','slow','think',
  'curious','beat',
];

function renderCueLegend(text) {
  const el = $('cueLegend');
  if (!el) return;
  if (!text) { el.innerHTML = ''; return; }
  const counts = {};
  for (const cue of KNOWN_CUES) {
    const re = new RegExp('\\[' + cue.replace(/ /g, '\\s+') + '\\]', 'gi');
    const m = text.match(re);
    if (m) counts[cue] = m.length;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) { el.innerHTML = ''; return; }
  el.innerHTML = entries.map(([cue, n]) => `
    <span class="cue-chip">${escapeHTML(cue)}<span class="cue-chip-count">${n}</span></span>
  `).join('');
}

$('screenplayText').addEventListener('input', e => {
  renderFrameworkChips(e.target.value);
  clearTimeout($('screenplayText')._t);
  $('screenplayText')._t = setTimeout(async () => {
    if (!state.currentSession) return;
    await persist({ screenplay_text: e.target.value });
    if (state.previewMode === 'screenplay') refreshPreview();
  }, 600);
});

$('refineBtn').addEventListener('click', async () => {
  const sideNote = $('refineNotes').value.trim();
  const frameworkHtml = $('s_framework')?.innerHTML.trim() || '';
  const frameworkText = rtePlainText(frameworkHtml);
  const s = state.currentSession;
  if (!s?.script) { toast('Generate a script first', 'error'); return; }

  // Save the latest framework right now — bypass the 600ms debounce so the
  // regenerate request reflects what's on screen.
  if (frameworkHtml !== (s.outline || '')) {
    await persist({ outline: frameworkHtml });
  }

  // Build the directive block exactly the same way the first Generate does
  // (see generateBtn handler ~line 1052), so the AI treats the framework as
  // authoritative. Append the optional one-liner note as a "tweak this time"
  // hint underneath.
  const directive = frameworkText
    ? `============================================================
🚨🚨🚨 FOUNDER'S FRAMEWORK — THIS IS YOUR STRUCTURE 🚨🚨🚨
============================================================

Use the section names below as on-screen scene labels.
Match this pedagogical order, not the default beat order.
Populate \`custom_scene_labels\` to map every internal beat
(hook/promise/…/cta) to one of these section names.

THE FRAMEWORK:

${frameworkText}

If a section says "Concept Explanation has 3 parts: X / Y / Z",
make sure those sub-points show up in the corresponding beats.

============================================================`
    : '';
  const refine_notes = [directive, sideNote && `One-line tweak this regeneration: ${sideNote}`]
    .filter(Boolean).join('\n\n');

  if (s.script_provider === 'mock') {
    // Mock mode CAN'T follow a framework — the script is hardcoded.
    // Be honest about this instead of pretending the change had effect.
    toast('Mock mode ignores framework changes. Switch to Gemini or Claude in Brief tab.', 'error');
    return;
  }
  const apiKey = getKey(s.script_provider);
  if (!apiKey) { toast('Provider key missing', 'error'); return; }
  const op = beginOp(LOADER_TRACKS.scriptRefine({ provider: s.script_provider, model: s.script_model || '', notes: sideNote || 'framework update' }), undefined, 'Rewriting from your framework');
  try {
    // CRITICAL: Do NOT pass previous_script or current_screenplay_text.
    //
    // The system prompt has a REFINE MODE branch that, when given the
    // previous script + screenplay, tells the AI to "preserve the spirit
    // of the founder's words" — i.e. minor edits only. That was breaking
    // framework changes: a brand-new framework would come back as a
    // light reword of the OLD script. Regenerate now means regenerate.
    // Fresh start, framework wins, no carry-over.
    const script = await generateScript({
      concept: s.concept, focus: s.focus,
      audience_level: s.audience_level || 'intermediate',
      tone: s.tone || 'warm-mentor',
      duration_target: s.duration_target, tool_url: s.tool_url,
      provider: s.script_provider, model: s.script_model, apiKey,
      refine_notes,
      signal: op.signal,
    });
    await persist({ script_json: JSON.stringify(script), screenplay_text: null });
    state.currentSession.script = script;
    $('refineNotes').value = '';
    renderScriptTab();
    refreshPreview();
    toast('Regenerated from your framework', 'success');
  } catch (err) {
    if (isAbort(err)) { toast('Cancelled', 'info'); }
    else { toast(err.message, 'error'); }
  } finally { op.cleanup(); }
});

// (Copy button removed — screenplay can be selected + copied directly from the textarea.)

$('approveScriptBtn').addEventListener('click', async () => {
  const s = state.currentSession;
  if (!s?.script) { toast('Generate a script first', 'error'); return; }
  await persist({ script_approved: true });
  toast('Script approved. Voice unlocked.', 'success');
  switchTab('voice');
});

// =====================================================================
// voice tab
// =====================================================================

function renderVoiceTab() {
  const s = state.currentSession;
  $('v_voice_id').value = s?.voice_id || 'kdnRe2koJdOK4Ovxn2DI';
  $('v_instructions').innerHTML = s?.voice_instructions || '';
  $('v_stab').value = s?.voice_stability ?? 0.78;     $('v_stab_val').textContent = (+$('v_stab').value).toFixed(2);
  $('v_style').value = s?.voice_style ?? 0.10;        $('v_style_val').textContent = (+$('v_style').value).toFixed(2);
  $('v_sim').value = s?.voice_similarity ?? 0.82;     $('v_sim_val').textContent = (+$('v_sim').value).toFixed(2);
  $('v_speed').value = s?.voice_speed ?? 1.0;         $('v_speed_val').textContent = (+$('v_speed').value).toFixed(2) + '×';

  // Reset the dirty flag every time the tab is freshly rendered — settings
  // are now in sync with the latest persisted audio.
  state.voiceDirty = false;
  refreshVoicePrimaryBtn();
}

// The voice tab uses a single adaptive button that morphs based on state:
//   no audio yet                          → "Generate narration"
//   audio exists + settings/text changed  → "Regenerate narration"
//   audio exists + nothing changed        → "Continue to Render →"
function refreshVoicePrimaryBtn() {
  const btn = $('voicePrimaryBtn');
  const label = $('voicePrimaryLabel');
  const hint = $('voiceHint');
  if (!btn || !label) return;
  const s = state.currentSession;
  const hasAudio = !!s?.audio_url;
  const dirty = !!state.voiceDirty;

  // Three states:
  let mode;
  if (!hasAudio)         mode = 'generate';
  else if (dirty)        mode = 'regenerate';
  else                   mode = 'continue';
  btn.dataset.mode = mode;

  if (mode === 'generate') {
    label.innerHTML = 'Generate narration';
    btn.classList.remove('btn-secondary'); btn.classList.add('btn-brand');
    if (hint) hint.textContent = 'Generate narration to hear how Avery says it.';
  } else if (mode === 'regenerate') {
    label.innerHTML = '↻ Regenerate narration';
    btn.classList.remove('btn-brand'); btn.classList.add('btn-secondary');
    if (hint) hint.textContent = 'Voice settings changed — regenerate to hear the update.';
  } else {
    label.innerHTML = 'Continue to Render →';
    btn.classList.remove('btn-secondary'); btn.classList.add('btn-brand');
    if (hint) hint.textContent = 'Narration ready. Listen on the right, then continue.';
  }
}

[['v_stab','v_stab_val',false],['v_style','v_style_val',false],['v_sim','v_sim_val',false],['v_speed','v_speed_val',true]]
  .forEach(([s,v,isSpeed]) => $(s).addEventListener('input', e => {
    $(v).textContent = isSpeed ? (+e.target.value).toFixed(2) + '×' : (+e.target.value).toFixed(2);
    markVoiceDirty();
  }));

// Any time the founder edits a voice-relevant input, flip the primary
// button into "regenerate" mode (only matters once they already have audio).
function markVoiceDirty() {
  if (!state.currentSession?.audio_url) return;
  state.voiceDirty = true;
  refreshVoicePrimaryBtn();
}
$('v_voice_id')?.addEventListener('input', markVoiceDirty);
$('v_instructions')?.addEventListener('input', markVoiceDirty);

const VOICE_PRESETS = {
  opener:  { stability: 0.28, style: 0.82, similarity: 0.74 },
  explain: { stability: 0.78, style: 0.10, similarity: 0.82 },
  reveal:  { stability: 0.35, style: 0.75, similarity: 0.74 },
};
$$('.preset-btn').forEach(btn => btn.addEventListener('click', () => {
  const p = VOICE_PRESETS[btn.dataset.preset]; if (!p) return;
  $('v_stab').value = p.stability;  $('v_stab_val').textContent = p.stability.toFixed(2);
  $('v_style').value = p.style;     $('v_style_val').textContent = p.style.toFixed(2);
  $('v_sim').value = p.similarity;  $('v_sim_val').textContent = p.similarity.toFixed(2);
}));

$('voicePrimaryBtn').addEventListener('click', async () => {
  // Single button, three modes. If we already have audio and nothing has
  // changed since, treat the click as "Continue to Render →" and bail.
  const mode = $('voicePrimaryBtn').dataset.mode;
  if (mode === 'continue') {
    if (!state.currentSession?.audio_url) { toast('Generate narration first', 'error'); return; }
    switchTab('render');
    return;
  }
  if (!state.currentSession?.script) { toast('Generate a script first', 'error'); switchTab('brief'); return; }
  const voiceId = $('v_voice_id').value.trim();
  const instructionsHtml = $('v_instructions').innerHTML.trim();
  const instructions = rtePlainText(instructionsHtml);

  // ----- MOCK VOICE PATH ------------------------------------------------
  // No ElevenLabs key OR explicitly using mock provider → use the bundled
  // sample MP3 (ZERO-Block-4-v3) so the founder can test the full flow.
  const useMockVoice = !getKey('elevenlabs');
  if (useMockVoice) {
    const op = beginOp(LOADER_TRACKS.voiceMock({ concept: state.currentSession?.concept }), 1100, "Loading Avery's voice");
    try {
      await new Promise(r => setTimeout(r, 700));
      await applyMockVoice({ voiceId: voiceId || 'mock-avery', instructionsHtml });
      renderVoiceTab();
      refreshTabStates();
      state.previewMode = 'voice';
      refreshPreview();
      toast('Mock narration ready · audio on the right', 'success');
    } catch (err) {
      if (isAbort(err)) { toast('Cancelled', 'info'); }
      else { console.error(err); toast(err.message, 'error'); }
    } finally { op.cleanup(); }
    return;
  }

  // ----- REAL ELEVENLABS PATH ------------------------------------------
  const apiKey = getKey('elevenlabs');
  if (!apiKey) { toast('Add ElevenLabs key in Settings', 'error'); openSettings(); return; }
  if (!hasSupabase()) { toast('Connect Supabase in Settings to host audio', 'error'); openSettings(); return; }
  if (!voiceId) { toast('Voice ID required', 'error'); $('v_voice_id').focus(); return; }

  const settings = {
    voice_id: voiceId,
    stability: +$('v_stab').value, style: +$('v_style').value,
    similarity: +$('v_sim').value, speed: +$('v_speed').value,
  };

  const op = beginOp(LOADER_TRACKS.voiceGenerate({ voiceId, concept: state.currentSession?.concept }), undefined, "Generating Avery's narration");
  try {
    const screenplayText = state.currentSession.screenplay_text
      || toScreenplay(state.currentSession.script);
    const spoken = stripScreenplay(screenplayText);

    const result = await generateNarration({ apiKey, voiceId, text: spoken, ...settings, signal: op.signal });
    const audioUrl = await sbApi.uploadAudio(state.currentSession.id, result.mp3Bytes);
    const probes = buildProbeList(state.currentSession.script);
    const { A, total, missing } = extractAnchors({ alignment: result.alignment, probes, leadinSec: 0 });
    const sections = buildSections(state.currentSession.script, A, total);
    const anchors = { A, total, sections, audioUrl };
    await persist({
      voice_id: settings.voice_id, voice_instructions: instructionsHtml,
      voice_stability: settings.stability, voice_style: settings.style,
      voice_similarity: settings.similarity, voice_speed: settings.speed,
      audio_url: audioUrl, anchors_json: JSON.stringify(anchors), status: 'voiced',
    });
    renderVoiceTab();
    refreshTabStates();
    state.previewMode = 'voice';
    refreshPreview();
    toast(`Narration ready · audio on the right${missing.length ? ` (${missing.length} unmatched anchors)` : ''}`, 'success');
  } catch (err) {
    if (isAbort(err)) { toast('Voice generation cancelled', 'info'); }
    else { toast(err.message, 'error'); }
  } finally { op.cleanup(); }
});

// Mock voice. Uses the bundled sample MP3 so the founder can test the
// full Voice → Render flow without spending ElevenLabs credits.
async function applyMockVoice({ voiceId, instructionsHtml }) {
  const mockMp3Url = './mock-assets/avery-block3-v5-leadin.mp3';
  const audio = new Audio(mockMp3Url);
  // Wait for metadata to compute duration
  const duration = await new Promise((resolve, reject) => {
    audio.addEventListener('loadedmetadata', () => resolve(audio.duration), { once: true });
    audio.addEventListener('error', () => reject(new Error('Could not load mock MP3 (mock-assets/avery-mock.mp3 missing?)')), { once: true });
    setTimeout(() => reject(new Error('Mock MP3 timed out loading')), 8000);
  });

  // Build a synthetic anchor map by spreading the scenes evenly across
  // the audio duration. Real ElevenLabs path uses character-level timing;
  // for mock we just give each scene an equal slice (weighted by each
  // scene's narration length so longer sections get more time).
  const script = state.currentSession.script;
  const scenes = Array.isArray(script?.scenes) ? script.scenes : [];

  // Compute per-scene proportional duration based on word count of
  // narration (with v3 cues stripped out). Falls back to equal slices
  // if narration is missing.
  const wordCounts = scenes.map(s => {
    const txt = (s?.narration || '').replace(/\[[^\]]+\]/g, '');
    return Math.max(3, txt.split(/\s+/).filter(Boolean).length);
  });
  const totalWords = wordCounts.reduce((a, b) => a + b, 0) || scenes.length;
  const A = {};
  const sections = [];
  let acc = 0;
  scenes.forEach((scene, i) => {
    const id = sceneAnchorId(i, scene);
    const sliceDur = (wordCounts[i] / totalWords) * duration;
    const start = +acc.toFixed(3);
    const end = +(acc + sliceDur).toFixed(3);
    A[id + '_open'] = start;
    sections.push({ id, label: scene.label, kind: scene.kind, start, end, sceneIndex: i });

    // Inner-item anchors (cards, steps, comparison items, recap cards).
    const c = scene.content || {};
    const inner = innerAnchorList(scene.kind, c);
    inner.forEach((name, idx) => {
      // Spread inner reveals evenly through the scene's slice
      const t = +(start + sliceDur * (idx + 1) / (inner.length + 1)).toFixed(3);
      A[id + '_' + name] = t;
    });
    if (scene.kind === 'number-pop' && c.number) {
      A[id + '_num'] = +(start + sliceDur * 0.4).toFixed(3);
    }
    acc += sliceDur;
  });

  function innerAnchorList(kind, content) {
    if (kind === 'cards')      return (content.items || []).map((_, i) => `card_${i + 1}`);
    if (kind === 'steps')      return (content.steps || []).map((_, i) => `step_${i + 1}`);
    if (kind === 'comparison') return (content.items || []).map((_, i) => `cmp_${i + 1}`);
    if (kind === 'recap')      return (content.cards || []).map((_, i) => `card_${i + 1}`);
    return [];
  }

  // The audio URL embedded in the rendered video. For mock, we point
  // directly at the bundled file so the assembled HTML plays it back.
  // When the assembled HTML is loaded standalone (e.g. opened in a new
  // tab), it'll resolve relative to the same origin.
  const audioUrl = new URL(mockMp3Url, location.href).href;

  await persist({
    voice_id: voiceId,
    voice_instructions: instructionsHtml,
    voice_stability: +$('v_stab').value,
    voice_style: +$('v_style').value,
    voice_similarity: +$('v_sim').value,
    voice_speed: +$('v_speed').value,
    audio_url: audioUrl,
    anchors_json: JSON.stringify({ A, total: +duration.toFixed(3), sections, audioUrl }),
    status: 'voiced',
  });
}

// Strip screenplay formatting → just the words an actor speaks.
// Strip screenplay formatting → just the words an actor speaks.
// CRITICAL: ElevenLabs reads anything in the text we send. Every
// non-spoken line must be filtered out, otherwise the audio reads
// metadata aloud ("ON SCREEN", "correct → Feedback", "[NO] A server
// crashes…", etc.) which sounds awful.
function stripScreenplay(text) {
  if (!text) return '';
  const out = [];
  let inOnScreenBlock = false;
  for (const rawLine of text.split('\n')) {
    const t = rawLine.trim();
    if (!t) { inOnScreenBlock = false; continue; }
    // Hard stop: everything below the first --- divider is metadata
    // (interaction checkpoints, swipe stack). Nothing below is spoken.
    if (/^---/.test(t)) break;
    // Markdown title / subtitle headers from toScreenplay
    if (t.startsWith('#')) continue;
    // Scene + sub-beat headers
    if (/^SCENE\s+\d+\s*[—-]/i.test(t)) continue;
    if (/^\d+\s*·\s*[A-Z]/.test(t)) continue;
    // *italic stage directions on their own line*
    if (/^\*[^*]*\*$/.test(t)) continue;
    // Actor / on-screen labels
    if (/^AVERY\s*\(V\.O\.\)/i.test(t)) continue;
    if (/^ON\s+SCREEN/i.test(t)) { inOnScreenBlock = true; continue; }
    // Lines inside an ON SCREEN block (until next blank line) are visual
    // notes — silent.
    if (inOnScreenBlock) {
      // Most ON SCREEN lines are bracketed [chapter card · ...]; some are
      // free-form. A safe heuristic: if the previous non-blank line was
      // an ON SCREEN header and this line is bracketed or starts with a
      // bullet, drop it.
      if (/^\[.*\]$/.test(t) || /^[•·]/.test(t) || t.startsWith('[')) continue;
      // If we hit a real spoken line, the block has ended
      inOnScreenBlock = false;
    }
    // Standalone bracketed visual notes
    if (/^\[.*\]$/.test(t)) continue;
    // Interaction lines: "(1) After anatomy: ..."
    if (/^\(\d+\)/.test(t)) continue;
    // Option answer lines: "correct → Feedback", "correct -> Foo"
    if (/^correct\s*[→\-=]/i.test(t)) continue;
    if (/^wrong\s*[→\-=]/i.test(t)) continue;
    // Swipe stack lines that survive past the divider check (defensive):
    if (/^\[(YES|NO)\]/i.test(t)) continue;
    out.push(t);
  }
  return out.join(' ');
}

// =====================================================================
// render tab
// =====================================================================

function renderRenderTab() {
  const s = state.currentSession;
  $('rm_concept').textContent = s.concept || '—';
  $('rm_duration').textContent = s.anchors?.total ? Math.round(s.anchors.total) + 's' : (s.duration_target ? s.duration_target + 's (planned)' : '—');
  $('rm_voice').textContent = s.voice_id || '—';
  $('rm_audio').textContent = s.audio_url ? '✓ uploaded' : 'not yet';

  $('downloadHtmlBtn').hidden = !s.video_url;
  $('downloadAudioBtn').hidden = !s.audio_url;
  if (s.video_url) $('downloadHtmlBtn').onclick = () => downloadFromUrl(s.video_url, `ZERO-Concept-${s.id}.html`);
  if (s.audio_url) $('downloadAudioBtn').onclick = () => downloadFromUrl(s.audio_url, `avery-${s.id}.mp3`);

  const label = $('assembleBtnLabel');
  label.textContent = s.audio_url ? 'Assemble video' : 'Need audio first (go to Voice)';

  $('refineBlock').hidden = !s.video_url;
}

$('assembleBtn').addEventListener('click', async () => {
  const s = state.currentSession;
  if (!s.script) { toast('Generate a script first', 'error'); switchTab('brief'); return; }
  if (!s.audio_url || !s.anchors) { toast('Generate voice first', 'error'); switchTab('voice'); return; }
  if (!hasSupabase()) { toast('Connect Supabase', 'error'); openSettings(); return; }

  const op = beginOp(LOADER_TRACKS.videoAssemble({ concept: s.concept }), undefined, `Assembling the video for ${s.concept || 'your concept'}`);
  try {
    const html = assembleVideoHTML({
      script: s.script, anchors: s.anchors.A,
      sections: s.anchors.sections, total: s.anchors.total,
      audioFilename: s.audio_url, sessionId: s.id,
    });
    const videoUrl = await sbApi.uploadHTML(s.id, html);
    await persist({ video_url: videoUrl, status: 'rendered' });
    renderRenderTab();
    state.previewMode = 'visual';
    $$('.preview-toggle').forEach(b => b.classList.toggle('is-active', b.dataset.mode === 'visual'));
    refreshPreview();
    refreshTabStates();
    toast('Video assembled — playing in the right panel', 'success');
  } catch (err) {
    if (isAbort(err)) { toast('Render cancelled', 'info'); }
    else { toast(err.message, 'error'); }
  } finally { op.cleanup(); }
});

$('refineVideoBtn').addEventListener('click', async () => {
  const notes = $('videoRefineNotes').value.trim();
  if (!notes) { toast('Tell us what to change', 'error'); return; }
  // Refining the video = re-roll the script with notes. Voice + render need to re-run after.
  const s = state.currentSession;
  if (s.script_provider === 'mock') {
    toast('Mock mode does not refine. Add Claude or Gemini key.', 'error');
    return;
  }
  const apiKey = getKey(s.script_provider);
  if (!apiKey) { toast('Provider key missing', 'error'); return; }
  showLoader('Regenerating script with notes…');
  try {
    const script = await generateScript({
      concept: s.concept, focus: s.focus,
      audience_level: s.audience_level, tone: s.tone,
      duration_target: s.duration_target, tool_url: s.tool_url,
      provider: s.script_provider, model: s.script_model, apiKey,
      previous_script: s.script, refine_notes: notes,
    });
    await persist({ script_json: JSON.stringify(script), screenplay_text: null, status: 'scripted', audio_url: null, anchors_json: null, video_url: null });
    $('videoRefineNotes').value = '';
    state.previewMode = 'screenplay';
    $$('.preview-toggle').forEach(b => b.classList.toggle('is-active', b.dataset.mode === 'screenplay'));
    refreshPreview();
    switchTab('script');
    toast('Script regenerated. Re-do voice + render.', 'success');
  } catch (err) { toast(err.message, 'error'); }
  finally { hideLoader(); }
});

// (approveVoiceBtn was folded into voicePrimaryBtn — see "single adaptive
// button" handler above. The button no longer exists in the DOM.)

$('wsDeleteBtn').addEventListener('click', () => {
  if (state.currentSession) confirmDelete(state.currentSession);
});
$('wsSettingsBtn').addEventListener('click', openSettings);

// =====================================================================
// shared
// =====================================================================

async function persist(patch) {
  if (!state.currentSession) return;
  const updated = await sessionsStore.updateSession(state.currentSession.id, patch);
  state.currentSession = sessionsStore.hydrate(updated);
  $('wsStatus').textContent = state.currentSession.status || 'draft';
}

async function downloadFromUrl(url, filename) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (err) { toast('Download failed: ' + err.message, 'error'); }
}

// =====================================================================
// settings
// =====================================================================

$('settingsBtn').addEventListener('click', openSettings);
$('closeSettings').addEventListener('click', closeSettings);
$('closeSettings2').addEventListener('click', closeSettings);
$('saveSettingsBtn').addEventListener('click', saveSettings);
$('testSupabaseBtn').addEventListener('click', testSupabase);

function openSettings() {
  ['anthropic', 'google', 'ollama', 'elevenlabs', 'openai'].forEach(p => {
    const el = $('key_' + p); const stEl = $('key_' + p + '_state');
    if (!el || !stEl) return;
    const v = getKey(p);
    stEl.textContent = v ? `set (${maskKey(v)})` : 'not set';
    el.value = '';
    el.placeholder = v ? '··· (saved). Type to replace.' : (el.getAttribute('placeholder') || '');
  });
  const cfg = getSupabase();
  $('sb_url_state').textContent = cfg.url ? 'set' : 'not set';
  $('sb_key_state').textContent = cfg.anonKey ? `set (${maskKey(cfg.anonKey)})` : 'not set';
  $('sb_url').value = cfg.url;
  $('sb_key').value = '';
  $('sb_key').placeholder = cfg.anonKey ? '··· (saved). Type to replace.' : 'eyJ... or sb_publishable_...';
  $('supabaseStatus').textContent = '';
  $('settingsDrawer').hidden = false;
}
function closeSettings() { $('settingsDrawer').hidden = true; }

async function testSupabase() {
  const url = $('sb_url').value.trim();
  const anonKey = $('sb_key').value.trim() || getSupabase().anonKey;
  if (!url || !anonKey) { $('supabaseStatus').textContent = 'Both URL and anon key required'; return; }
  const prev = getSupabase();
  setSupabase({ url, anonKey });
  try {
    const r = await sbApi.testConnection();
    if (r.ok) {
      $('supabaseStatus').textContent = '✓ Connection works. Save to apply.';
      $('supabaseStatus').style.color = 'var(--green-700)';
    } else {
      $('supabaseStatus').textContent = '✕ ' + r.error;
      $('supabaseStatus').style.color = 'var(--danger-solid)';
      setSupabase(prev);
    }
  } catch (err) {
    $('supabaseStatus').textContent = '✕ ' + err.message;
    $('supabaseStatus').style.color = 'var(--danger-solid)';
    setSupabase(prev);
  }
}

async function saveSettings() {
  ['anthropic', 'google', 'ollama', 'elevenlabs', 'openai'].forEach(p => {
    const el = $('key_' + p); if (!el) return;
    const v = el.value.trim();
    if (v) setKey(p, v);
  });
  const url = $('sb_url').value.trim();
  const sbKey = $('sb_key').value.trim();
  if (url || sbKey) setSupabase({ url: url || getSupabase().url, anonKey: sbKey || getSupabase().anonKey });
  state.providers = providersAvailable();
  refreshTopbarPills();
  if (state.route.name === 'workspace') refreshProviderButtons();
  closeSettings();
  toast('Saved', 'success');
  if (state.route.name === 'home') renderHome();
}

// =====================================================================
// splitter — drag the left/right divider to resize the brief panel
// =====================================================================

(function setupSplitter() {
  const split = document.getElementById('wsSplit');
  const handle = document.getElementById('wsSplitter');
  if (!split || !handle) return;

  // Restore saved width
  const saved = parseInt(localStorage.getItem('zero_vg_left_w') || '', 10);
  if (saved && saved >= 320) split.style.setProperty('--ws-left-width', saved + 'px');

  let dragging = false;
  let startX = 0;
  let startW = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    handle.classList.add('is-active');
    document.body.classList.add('is-resizing');
    startX = e.clientX;
    const computed = getComputedStyle(split).getPropertyValue('--ws-left-width').trim();
    startW = parseInt(computed, 10) || split.firstElementChild.getBoundingClientRect().width;
    e.preventDefault();
  });

  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const vw = window.innerWidth;
    const minW = 320;
    const maxW = Math.round(vw * 0.40);   // hard cap at 40% per the request
    const next = Math.max(minW, Math.min(maxW, startW + (e.clientX - startX)));
    split.style.setProperty('--ws-left-width', next + 'px');
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('is-active');
    document.body.classList.remove('is-resizing');
    const computed = getComputedStyle(split).getPropertyValue('--ws-left-width').trim();
    const px = parseInt(computed, 10);
    if (px) localStorage.setItem('zero_vg_left_w', String(px));
  });

  // Double-click resets to default
  handle.addEventListener('dblclick', () => {
    split.style.removeProperty('--ws-left-width');
    localStorage.removeItem('zero_vg_left_w');
  });
})();

// =====================================================================
// init
// =====================================================================

(async function init() {
  refreshTopbarPills();
  await handleRoute();
})();
