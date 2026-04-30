// Contextual loader sequencer + preview-panel loader UI.
//
// The loader takes over the RIGHT preview iframe (not a full-screen
// overlay). It looks like a document being written — the checklist of
// steps fills in one by one, the current step pulses, the past steps get
// a green check, future steps stay dim. A subtle scanning line sweeps
// down to suggest motion.
//
// Why iframe-based: the right preview already exists, the layout already
// works, and using an iframe sandboxes the loader CSS so it can't leak
// into the dashboard. We control it via postMessage (same-origin) so
// updating "current step" doesn't reload the iframe.

export function startLoaderSequence(messages, intervalMs = 3500) {
  if (!Array.isArray(messages) || !messages.length) return () => {};
  let i = 0;
  let stopped = false;

  const iframe = document.getElementById('wsPreview');

  const apply = () => {
    if (stopped) return;
    if (iframe?.contentWindow) {
      try {
        iframe.contentWindow.postMessage({ type: 'loader-tick', i, messages }, '*');
      } catch {}
    }
    // Also keep the legacy fullscreen loader fields in sync, but only as
    // a fallback if the iframe loader isn't installed.
    const m = messages[i];
    const msgEl = document.getElementById('loaderMsg');
    const subEl = document.getElementById('loaderSub');
    if (msgEl) msgEl.textContent = m.msg || 'Working…';
    if (subEl) subEl.textContent = m.sub || '';
    i = Math.min(i + 1, messages.length - 1);
  };

  apply();
  const id = setInterval(apply, intervalMs);
  return () => { stopped = true; clearInterval(id); };
}

// Renders the loader HTML that goes into the right preview iframe. This
// page listens for postMessage updates (loader-tick) and crossfades the
// contextual line. Cancel button posts back to the parent.
//
// Visual language: a single, calm circular spinner — the same loader
// for every operation (script, voice, video). One contextual line of
// copy below it. One Cancel button. Nothing else.
export function renderLoaderPreviewHTML(opTitle = 'Working…') {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@6..144,100..1000&display=swap" rel="stylesheet">
<style>
  :root {
    --bg-app: rgb(246,245,243);
    --fg-1: rgb(31,29,30);
    --fg-3: rgba(31,29,30,0.55);
    --green-500: rgb(73,186,97);
    --border-hair: rgba(31,29,30,0.08);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    background: var(--bg-app);
    font-family: 'Google Sans Flex', system-ui, sans-serif;
    color: var(--fg-1);
    -webkit-font-smoothing: antialiased;
    display: grid; place-items: center;
    padding: 32px;
    overflow: hidden;
  }

  .lp-wrap {
    width: min(360px, 100%);
    text-align: center;
    display: flex; flex-direction: column; align-items: center;
    gap: 24px;
  }

  /* Circular spinner. A faint full ring + a bright arc that rotates.
     Anti-aliased via SVG so it stays crisp at every size. */
  .lp-spinner {
    width: 56px; height: 56px;
    animation: lp-rotate 1.1s linear infinite;
  }
  .lp-spinner .track { stroke: var(--border-hair); }
  .lp-spinner .head  { stroke: var(--green-500); stroke-linecap: round; }
  @keyframes lp-rotate { to { transform: rotate(360deg); } }

  .lp-msg {
    font-size: 15px; line-height: 1.5;
    color: var(--fg-1);
    min-height: 22px;
    transition: opacity 220ms ease;
    max-width: 320px;
  }
  .lp-msg.is-fading { opacity: 0.15; }

  .lp-cancel {
    background: transparent;
    border: 1px solid var(--border-hair);
    color: var(--fg-3);
    padding: 8px 18px;
    border-radius: 999px;
    font: 500 12px 'Google Sans Flex', system-ui, sans-serif;
    cursor: pointer;
    transition: all 180ms ease;
  }
  .lp-cancel:hover {
    background: rgba(31, 29, 30, 0.04);
    color: var(--fg-1);
    border-color: rgba(31, 29, 30, 0.22);
  }
  .lp-cancel:disabled {
    opacity: 0.5; cursor: default;
  }

  @media (prefers-reduced-motion: reduce) {
    .lp-spinner { animation-duration: 3s; }
  }
</style>
</head><body>
  <div class="lp-wrap">
    <svg class="lp-spinner" viewBox="0 0 50 50" aria-hidden="true">
      <circle class="track" cx="25" cy="25" r="20" fill="none" stroke-width="3"/>
      <circle class="head"  cx="25" cy="25" r="20" fill="none" stroke-width="3"
              stroke-dasharray="36 90" />
    </svg>
    <div class="lp-msg" id="lp-msg">Starting…</div>
    <button class="lp-cancel" id="lp-cancel">Cancel</button>
  </div>

<script>
(function () {
  const msgEl  = document.getElementById('lp-msg');
  const cancel = document.getElementById('lp-cancel');

  cancel.addEventListener('click', () => {
    window.parent.postMessage({ type: 'loader-cancel' }, '*');
    cancel.disabled = true;
    cancel.textContent = 'Cancelling…';
  });

  // Crossfade the contextual line whenever it changes. We fade out, swap
  // text, fade in — quick and quiet.
  function setText(text) {
    if (msgEl.textContent === text) return;
    msgEl.classList.add('is-fading');
    setTimeout(() => {
      msgEl.textContent = text;
      msgEl.classList.remove('is-fading');
    }, 200);
  }

  window.addEventListener('message', (e) => {
    const data = e.data || {};
    if (data.type !== 'loader-tick') return;
    const messages = Array.isArray(data.messages) ? data.messages : [];
    const i = Math.min(data.i ?? 0, messages.length - 1);
    const cur = messages[i] || { msg: '' };
    setText(cur.msg || '');
  });
})();
<\/script>
</body></html>`;
}

function escapeHTML(s) {
  return String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
}

// Pre-baked sequences for the major flows. Co-located here so the
// "what AI tells you while it works" copy is centralised.

// Each track is a function that takes a context object and returns a
// sequence. Pass concept/focus so the messages feel personal.

export const LOADER_TRACKS = {
  scriptGenerate: ({ concept, focus, provider, model }) => [
    { msg: `Reading the brief on ${concept || 'your concept'}…`,           sub: `${provider} · ${model}` },
    { msg: `Listening for the audience: ${focus || 'a curious learner'}…`, sub: 'tone calibration' },
    { msg: 'Drafting the opening hook…',                                   sub: 'matched to your framework' },
    { msg: `Staking what they will know by the end…`,                      sub: 'four bullets' },
    { msg: `Defining ${concept || 'the concept'} in plain English…`,       sub: 'three keywords' },
    { msg: `Naming the four parts of ${concept || 'it'}…`,                 sub: 'anatomy · in order' },
    { msg: 'Listing the cousins people get this confused with…',           sub: 'three siblings' },
    { msg: 'Finding the right everyday analogy…',                          sub: 'physical · with motion' },
    { msg: 'Walking the method — 5 steps, no shortcuts…',                  sub: 'AI hallucination warnings' },
    { msg: 'Picking a real company that did this well…',                   sub: 'one named example' },
    { msg: 'Setting up the swipe checkpoints…',                            sub: '4 yes/no scenarios' },
    { msg: 'Placing the v3 voice cues at the right moments…',              sub: '[laugh] [pause] [emphasize]' },
    { msg: 'Reading the screenplay back, line by line…',                   sub: 'almost there' },
  ],
  scriptRefine: ({ provider, model, notes }) => [
    { msg: notes ? `Reading your note: "${notes.slice(0, 56)}"…` : 'Reading your edits…', sub: `${provider} · ${model}` },
    { msg: 'Diffing against the current screenplay…',                       sub: 'minimal blast radius' },
    { msg: 'Rewriting only the beats that need changing…',                  sub: 'preserving anchors' },
    { msg: 'Re-tightening the voice cues…',                                 sub: 'no decoration' },
    { msg: 'Reading it back to make sure it lands…',                        sub: 'almost there' },
  ],
  voiceGenerate: ({ voiceId, concept }) => [
    { msg: `Sending your screenplay to ElevenLabs…`,                       sub: voiceId ? voiceId.slice(0, 16) + '…' : 'voice id' },
    { msg: 'Synthesizing audio with eleven_v3…',                           sub: 'cues become real direction' },
    { msg: `Avery is reading the hook on ${concept || 'your concept'}…`,   sub: 'with [laugh] and [pause]' },
    { msg: 'Reading character-level timestamps…',                          sub: 'every word, every ms' },
    { msg: 'Decoding the MP3…',                                            sub: 'audio bytes' },
    { msg: 'Uploading audio to Supabase…',                                 sub: 'public bucket · audio/mpeg' },
    { msg: 'Walking probe phrases through the alignment…',                 sub: 'finding scene anchors' },
    { msg: 'Locking the section map to the audio…',                        sub: '10 beats · zero drift' },
    { msg: 'Saving the session…',                                          sub: 'almost there' },
  ],
  voiceMock: ({ concept }) => [
    { msg: 'Loading the sample MP3…',                                      sub: 'ZERO-Block-3 · five whys' },
    { msg: 'Reading the audio duration…',                                  sub: 'browser audio API' },
    { msg: `Mapping the 10 beats of ${concept || 'your concept'} onto it…`, sub: 'evenly spread' },
    { msg: 'Saving the session…',                                          sub: 'almost there' },
  ],
  videoAssemble: ({ concept }) => [
    { msg: 'Loading the audio track…',                                     sub: 'absolute URL · CORS-safe' },
    { msg: 'Wiring the master GSAP timeline to audio.currentTime…',        sub: 'audio is the clock' },
    { msg: `Designing the chapter card for ${concept || 'your concept'}…`, sub: 'Faculty Glyphic · forest' },
    { msg: 'Pinning sub-timelines to each anchor…',                        sub: 'frame-accurate seek' },
    { msg: 'Animating the anatomy reveals…',                               sub: '4 cards · staggered' },
    { msg: 'Composing the example number drop…',                           sub: 'spring scale · pop' },
    { msg: 'Stacking the swipe deck…',                                     sub: '4 cards · peek stack' },
    { msg: 'Wiring the controls bar…',                                     sub: 'play · scrub · 1× speed' },
    { msg: 'Uploading to your library…',                                   sub: 'almost there' },
  ],
};
