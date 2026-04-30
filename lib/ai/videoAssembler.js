// HTML video assembler — framework-driven scenes[] model.
//
// Given a normalized script (with scenes[]), the anchor map, and the
// path to the audio MP3, produces a single self-contained HTML file:
//
//   - Audio is the hard clock; master timeline runs off audio.currentTime
//   - Each scene is rendered via a per-kind template (visual vocabulary)
//   - Animations fire on per-scene anchors extracted from the audio
//   - Optional quiz checkpoints + swipe stack at the end
//   - Cream + forest + mint palette, Faculty Glyphic + Inter Tight
//
// Output: complete HTML string, ready to be written to disk.

import { normalizeScript } from '../scriptShape.js';
import { sceneAnchorId } from './anchorExtractor.js';

const esc = (s = '') => String(s ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

export function assembleVideoHTML({ script: rawScript, anchors, sections, total, audioFilename, sessionId }) {
  const script = normalizeScript(rawScript);
  const A = anchors || {};
  const TITLE = `Zero · ${script.concept}`;
  const scenes = script.scenes || [];

  // Compose all scenes via the per-kind dispatcher
  const scenesDOM = scenes.map((scene, idx) => {
    const sid = sceneAnchorId(idx, scene);
    const renderer = SCENE_RENDERERS[scene.kind] || SCENE_RENDERERS.title;
    const inner = renderer(scene, idx);
    return `
      <section class="scene sk-${esc(scene.kind)}" data-scene="${esc(sid)}" data-kind="${esc(scene.kind)}" data-idx="${idx}">
        ${inner}
      </section>`;
  }).join('');

  const interactionsDOM = `
    <div class="qx-overlay" id="qxOverlay">
      <div class="qx-card">
        <div class="qx-eyebrow">Quick check</div>
        <div class="qx-question" id="qxQuestion"></div>
        <div class="qx-options" id="qxOptions"></div>
        <div class="qx-feedback" id="qxFeedback"></div>
      </div>
    </div>`;

  const swipeDOM = (script.swipe?.length) ? `
    <div class="swipe-overlay" id="swipeOverlay">
      <div class="swipe-frame">
        <div class="sw-eyebrow">Proof of understanding · ${script.swipe.length} cards</div>
        <h3 class="sw-prompt">Is this <span class="hl">${esc(script.concept)}</span>?</h3>
        <div class="sw-stack" id="swStack">
          ${script.swipe.map((s, i) => `
            <div class="sw-card" data-stack="${i}" data-answer="${esc(s.answer)}" data-i="${i + 1}">
              <div class="sw-num">0${i + 1} / ${script.swipe.length}</div>
              <div class="sw-scenario">${esc(s.scenario)}</div>
              <div class="sw-explain">${esc(s.explain)}</div>
            </div>
          `).join('')}
        </div>
        <div class="sw-actions">
          <button class="sw-btn no" id="swNo">No</button>
          <button class="sw-btn yes" id="swYes">Yes</button>
        </div>
        <div class="sw-score" id="swScore"></div>
      </div>
    </div>` : '';

  const swipeCount = script.swipe?.length || 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(TITLE)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Faculty+Glyphic&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<style>
${BASE_CSS}
</style>
</head>
<body>

<div class="frame">

  <header class="topbar">
    <div class="wordmark">zero</div>
    <div class="topbar-tags">
      <span class="topbar-tag">Concept Training</span>
      <span class="topbar-tag">${esc(script.tagline || script.concept)}</span>
      <span class="topbar-tag">${esc(script.audience || 'Foundations')}</span>
    </div>
  </header>

  <main class="stage" id="stage">
    <div class="avery-card" id="averyCard">
      <div class="avery-avatar">A</div>
      <div class="avery-info">
        <div class="avery-name">Avery</div>
        <div class="avery-role"><span>Mentor</span><span class="avery-dots"><span></span><span></span><span></span></span></div>
      </div>
    </div>

    ${scenesDOM}

    ${interactionsDOM}
    ${swipeDOM}

    <div class="play-gate" id="playGate">
      <button class="play-gate-btn" id="playGateBtn">
        <span class="pg-icon">▶</span>
        <span class="pg-label">Play</span>
      </button>
      <div class="pg-meta">${esc(script.concept)} · ${Math.round(total)}s · ${scenes.length} scenes${swipeCount ? ` · ${swipeCount}-card check` : ''}</div>
    </div>
    <div class="section-pips" id="sectionPips"></div>
  </main>

  <footer class="controls">
    <button class="play-btn" id="playBtn" aria-label="Play"><span class="play-icon"></span></button>
    <div class="scrub-wrap">
      <span class="timecode" id="tcCur">0:00</span>
      <div class="scrub" id="scrub">
        <div class="scrub-fill" id="scrubFill"></div>
        <div class="scrub-thumb" id="scrubThumb"></div>
      </div>
      <span class="timecode" id="tcDur">0:00</span>
    </div>
    <div class="kb-help"><kbd>Space</kbd> play · <kbd>←</kbd> <kbd>→</kbd> 5s · <kbd>J</kbd> <kbd>L</kbd> 10s · <kbd>0–9</kbd> jump · <kbd>M</kbd> mute</div>
    <div class="speed-pill" id="speedPill">1×</div>
    <div class="scene-pill" id="scenePill">${esc(scenes[0]?.label || 'Scene 1')}</div>
  </footer>

</div>

<audio id="avery" preload="auto" src="${esc(audioFilename)}"></audio>

<script>
const SCRIPT = ${JSON.stringify(script)};
const ANCHORS = ${JSON.stringify(A)};
const SECTIONS = ${JSON.stringify(sections || [])};
const TOTAL = ${total};
const SESSION_ID = ${JSON.stringify(sessionId)};
${RUNTIME_JS}
</script>

</body>
</html>`;
}

// =====================================================================
// PER-KIND SCENE RENDERERS
// =====================================================================
//
// Each renderer receives the raw scene object and returns the inner HTML
// for that scene's <section> wrapper. The wrapper itself (with classes
// sk-{kind} + data-scene + data-kind + data-idx) is added by the caller.
//
// Inner element classes match the existing CSS so styling stays
// consistent without rewrites: pl-item / def-chip / ana-card / cou-card
// / ms-step / rc-card / ex-number etc. New kinds (quote) get their own
// classes added to the CSS extension below.
// =====================================================================

const SCENE_RENDERERS = {
  title(scene) {
    const c = scene.content || {};
    return `
      <div class="scene-inner narrative">
        <div class="kicker">${esc(c.kicker || ('Chapter ' + (scene._idx || '01')))}</div>
        <h1 class="display-hero" data-anim-headline>${highlightInHeadline(c.headline, c.highlight_phrase)}</h1>
      </div>`;
  },

  bullets(scene) {
    const c = scene.content || {};
    const bullets = c.bullets || [];
    return `
      <div class="scene-inner two-col">
        <div>
          ${c.headline ? `<div class="eyebrow">${esc(scene.label || '')}</div><h2 class="display-mid">${esc(c.headline)}</h2>` : `<h2 class="display-mid">${esc(scene.label || '')}</h2>`}
        </div>
        <ul class="promise-list">
          ${bullets.map((b, i) => `<li class="pl-item" data-i="${i + 1}"><span class="pl-num">0${i + 1}</span><span class="pl-text">${esc(b)}</span></li>`).join('')}
        </ul>
      </div>`;
  },

  keywords(scene) {
    const c = scene.content || {};
    return `
      <div class="scene-inner narrative">
        <div class="eyebrow">${esc(scene.label || 'Definition')}</div>
        ${c.headline ? `<h2 class="display-mid def-head">${esc(c.headline)}</h2>` : ''}
        <div class="def-chips">
          ${(c.keywords || []).map((k, i) => `
            <div class="def-chip" data-i="${i + 1}">
              <div class="dc-term">${esc(k.term)}</div>
              <div class="dc-unpack">${esc(k.unpack)}</div>
            </div>
          `).join('')}
        </div>
      </div>`;
  },

  cards(scene) {
    const c = scene.content || {};
    const items = c.items || [];
    const colsClass = items.length <= 2 ? 'cols-2' : items.length === 3 ? 'cols-3' : 'cols-4';
    return `
      <div class="scene-inner">
        <div class="eyebrow">${esc(scene.label || '')}</div>
        ${c.headline ? `<h2 class="display-mid">${esc(c.headline)}</h2>` : ''}
        <div class="ana-grid ${colsClass}">
          ${items.map((it, i) => `
            <div class="ana-card" data-card-i="${i + 1}" data-i="${i + 1}">
              <div class="ac-icon">${anatomyIconSVG(it.icon_hint, i)}</div>
              <div class="ac-name">${esc(it.name || '')}</div>
              <div class="ac-blurb">${esc(it.blurb || '')}</div>
            </div>
          `).join('')}
        </div>
      </div>`;
  },

  comparison(scene) {
    const c = scene.content || {};
    const target = (c.target || '').trim().toLowerCase();
    const items = c.items || [];
    const colsClass = items.length <= 2 ? 'cols-2' : items.length === 3 ? 'cols-3' : 'cols-4';
    return `
      <div class="scene-inner">
        <div class="eyebrow">${esc(scene.label || '')}</div>
        ${c.headline ? `<h2 class="display-mid">${esc(c.headline)}</h2>` : ''}
        <div class="cou-grid ${colsClass}">
          ${items.map((it, i) => {
            const isTarget = target && (it.name || '').trim().toLowerCase() === target;
            return `
              <div class="cou-card${isTarget ? ' is-target' : ''}" data-cmp-i="${i + 1}" data-i="${i + 1}">
                <div class="cc-name">${esc(it.name || '')}</div>
                <div class="cc-diff">${esc(it.diff || '')}</div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  },

  analogy(scene) {
    const c = scene.content || {};
    return `
      <div class="scene-inner narrative">
        <div class="eyebrow">${esc(scene.label || "It's like")}</div>
        <h2 class="display-mid">${esc(c.headline || '')}</h2>
        <div class="analogy-art">${analogyArt(c.image_hint)}</div>
      </div>`;
  },

  steps(scene) {
    const c = scene.content || {};
    const steps = c.steps || [];
    return `
      <div class="scene-inner">
        <div class="eyebrow">${esc(scene.label || 'Method')}</div>
        ${c.headline ? `<h2 class="display-mid">${esc(c.headline)}</h2>` : ''}
        <div class="method-flow">
          ${steps.map((s, i) => `
            <div class="ms-step" data-step-i="${i + 1}" data-i="${i + 1}">
              <div class="ms-circle">${i + 1}</div>
              <div class="ms-verb">${esc(s.verb || '')}</div>
              <div class="ms-detail">${esc(s.detail || '')}</div>
            </div>
            ${i < steps.length - 1 ? '<div class="ms-arrow">→</div>' : ''}
          `).join('')}
        </div>
        ${c.loops_back ? '<div class="ms-loop">↻ Loops back to step 1</div>' : ''}
      </div>`;
  },

  'number-pop'(scene) {
    const c = scene.content || {};
    return `
      <div class="scene-inner narrative">
        <div class="eyebrow">${esc(scene.label || 'Real case')}</div>
        ${c.company ? `<div class="ex-company">${esc(c.company)}</div>` : ''}
        <div class="ex-number" data-anim-number>${esc(c.number || '')}</div>
        ${c.headline ? `<h2 class="display-mid ex-head">${esc(c.headline)}</h2>` : ''}
        ${c.story ? `<p class="ex-story">${esc(c.story)}</p>` : ''}
      </div>`;
  },

  quote(scene) {
    const c = scene.content || {};
    return `
      <div class="scene-inner narrative">
        <div class="quote-mark">&ldquo;</div>
        <blockquote class="quote-body display-mid">${esc(c.quote || '')}</blockquote>
        ${c.attribution ? `<div class="quote-attr">— ${esc(c.attribution)}</div>` : ''}
      </div>`;
  },

  recap(scene) {
    const c = scene.content || {};
    return `
      <div class="scene-inner">
        <div class="eyebrow">${esc(scene.label || 'Recap')}</div>
        <div class="recap-cards">
          ${(c.cards || []).map((card, i) => `
            <div class="rc-card" data-card-i="${i + 1}" data-i="${i + 1}">
              <div class="rc-num">0${i + 1}</div>
              <div class="rc-text">${esc(card)}</div>
            </div>
          `).join('')}
        </div>
      </div>`;
  },

  cta(scene) {
    const c = scene.content || {};
    const url = c.url || '#';
    return `
      <div class="scene-inner narrative">
        <div class="eyebrow">${esc(scene.label || 'Your turn')}</div>
        <h2 class="display-hero">${esc(c.headline || '')}</h2>
        <a class="cta-btn" data-anim-cta href="${esc(url)}" target="_blank" rel="noopener">${esc(c.button_label || 'Continue')} <span class="arrow">→</span></a>
      </div>`;
  },
};

// --- helpers -----------------------------------------------------------

function highlightInHeadline(headline, phrase) {
  if (!headline) return '';
  const safeHeadline = esc(headline);
  if (!phrase) return safeHeadline;
  const safePhrase = esc(phrase);
  const idx = safeHeadline.toLowerCase().indexOf(safePhrase.toLowerCase());
  if (idx < 0) return safeHeadline;
  return safeHeadline.slice(0, idx) +
         '<span class="hl">' + safeHeadline.slice(idx, idx + safePhrase.length) + '</span>' +
         safeHeadline.slice(idx + safePhrase.length);
}

function anatomyIconSVG(_hint, i) {
  const shapes = [
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    '<svg viewBox="0 0 24 24"><path d="M12 3 L21 21 L3 21 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    '<svg viewBox="0 0 24 24"><path d="M12 3 L19 9 L19 17 L12 21 L5 17 L5 9 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    '<svg viewBox="0 0 24 24"><path d="M4 12 L20 12 M12 4 L12 20" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="4 3"/></svg>',
  ];
  return shapes[i % shapes.length];
}

function analogyArt(_hint) {
  return `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="ag" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="rgba(73,186,97,0.25)"/>
        <stop offset="100%" stop-color="rgba(73,186,97,0.02)"/>
      </linearGradient>
    </defs>
    <path d="M20 170 Q 80 60 160 90 T 300 60" fill="none" stroke="rgb(73,186,97)" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M20 170 Q 80 60 160 90 T 300 60 L 300 180 L 20 180 Z" fill="url(#ag)"/>
    <circle cx="80" cy="120" r="5" fill="rgb(73,186,97)"/>
    <circle cx="160" cy="92" r="5" fill="rgb(73,186,97)"/>
    <circle cx="240" cy="78" r="5" fill="rgb(73,186,97)"/>
  </svg>`;
}

// --- giant CSS string ------------------------------------------------
const BASE_CSS = `
  :root {
    --fg-1: rgb(31, 29, 30);
    --fg-2: rgba(31, 29, 30, 0.70);
    --fg-3: rgba(31, 29, 30, 0.50);
    --fg-4: rgba(31, 29, 30, 0.30);
    --fg-inverse: rgb(255, 255, 255);

    --ink-0:    rgb(255, 255, 255);
    --ink-50:   rgb(249, 248, 246);
    --ink-100:  rgb(246, 245, 243);
    --ink-150:  rgb(242, 240, 237);
    --ink-200:  rgb(232, 230, 226);
    --ink-300:  rgb(217, 217, 217);
    --ink-700:  rgb(56, 58, 64);
    --ink-900:  rgb(31, 29, 30);
    --ink-1000: rgb(18, 18, 18);

    --bg-app:     var(--ink-100);
    --bg-surface: var(--ink-0);
    --bg-cream:   var(--ink-150);
    --bg-sunken:  rgba(31, 29, 30, 0.03);
    --bg-hover:   rgba(31, 29, 30, 0.05);

    --border-hair:   rgba(31, 29, 30, 0.06);
    --border-subtle: rgba(31, 29, 30, 0.10);
    --border-strong: rgba(31, 29, 30, 0.20);

    --green-900: rgb(12,  45,  30);
    --green-800: rgb(24,  67,  47);
    --green-700: rgb(42, 110,  72);
    --green-500: rgb(73, 186,  97);
    --green-300: rgb(172, 245, 110);
    --green-200: rgb(164, 244, 178);
    --green-100: rgb(210, 250, 220);
    --green-50:  rgb(232, 249, 237);

    --success-tint: rgb(240, 249, 242);
    --success-soft: rgb(219, 241, 223);
    --warning-soft: rgb(255, 241, 216);
    --warning-ink:  rgb(102, 62,  0);
    --info-soft:    rgb(215, 230, 255);
    --info-ink:     rgb(13, 50, 128);
    --danger-tint:  rgb(255, 240, 239);
    --danger-soft:  rgb(255, 219, 215);
    --danger-solid: rgb(254, 73, 56);

    --shadow-xs: 0 1px 2px rgba(0,0,0,.04), 0 0 1px rgba(0,0,0,.03);
    --shadow-sm: 0 2px 4px rgba(0,0,0,.04), 0 4px 8px rgba(0,0,0,.04);
    --shadow-md: 0 4px 12px rgba(0,0,0,.05), 0 12px 24px rgba(0,0,0,.05);
    --shadow-lg: 0 6px 20px rgba(0,0,0,.06), 0 24px 48px rgba(0,0,0,.06);
    --shadow-inset-ring: inset 0 0 0 4px rgba(31,29,30,.04);

    --ease-out:    cubic-bezier(0.22, 1, 0.36, 1);
    --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

    --font-display: 'Faculty Glyphic', Georgia, serif;
    --font-sans:    'Inter Tight', system-ui, -apple-system, sans-serif;
    --font-mono:    'JetBrains Mono', monospace;

    --radius-pill: 999px;
    --radius-2xl: 32px;
    --radius-xl: 24px;
    --radius-lg: 20px;
    --radius-base: 16px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; overflow: hidden; }
  body {
    background: var(--bg-app);
    color: var(--fg-1);
    font-family: var(--font-sans);
    font-size: 18px;
    line-height: 1.4;
    letter-spacing: -0.02em;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  .frame { position: fixed; inset: 0; display: grid; grid-template-rows: auto 1fr auto; }

  /* topbar */
  .topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 32px;
    border-bottom: 1px solid var(--border-hair);
    background: rgba(246,245,243,0.9);
    backdrop-filter: blur(10px);
    z-index: 10;
  }
  .wordmark {
    font-family: var(--font-display); font-size: 22px;
    color: var(--green-800);
  }
  .topbar-tags { display: flex; gap: 8px; }
  .topbar-tag {
    font-family: var(--font-mono); font-size: 11px;
    text-transform: uppercase; color: var(--fg-3);
    padding: 5px 12px; border-radius: var(--radius-pill);
    background: var(--bg-sunken); border: 1px solid var(--border-hair);
  }

  /* stage */
  .stage { position: relative; overflow: hidden; }
  .scene {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    padding: 96px 80px 80px;
    opacity: 0; pointer-events: none;
    transition: opacity 0.5s var(--ease-out);
  }
  .scene.active { opacity: 1; pointer-events: auto; }
  .scene-inner { width: 100%; max-width: 1200px; }
  .scene-inner.narrative {
    display: flex; flex-direction: column; align-items: center; gap: 32px; text-align: center;
  }
  .scene-inner.two-col {
    display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center;
  }

  /* type system */
  .display-hero {
    font-family: var(--font-display); font-weight: 400;
    font-size: clamp(48px, 6vw, 88px);
    line-height: 1.0; letter-spacing: -0.035em;
    color: var(--green-800); text-wrap: pretty; max-width: 18ch;
  }
  .display-mid {
    font-family: var(--font-display); font-weight: 400;
    font-size: clamp(36px, 4vw, 56px);
    line-height: 1.05; letter-spacing: -0.03em;
    color: var(--green-800); text-wrap: pretty;
  }
  .kicker, .eyebrow {
    font-family: var(--font-mono); font-size: 12px; font-weight: 500;
    letter-spacing: -0.01em; text-transform: uppercase;
    color: var(--fg-3);
  }
  .hl { background: var(--green-200); color: var(--green-900); padding: 0 0.18em; border-radius: 8px; }

  /* avery card */
  .avery-card {
    position: absolute; top: 24px; right: 32px; z-index: 9;
    display: flex; align-items: center; gap: 12px;
    padding: 8px 18px 8px 8px;
    background: var(--bg-surface);
    border: 1px solid var(--border-hair);
    border-radius: var(--radius-pill);
    box-shadow: var(--shadow-sm), var(--shadow-inset-ring);
  }
  .avery-avatar {
    width: 44px; height: 44px; border-radius: 50%;
    background: var(--green-800); color: var(--ink-50);
    display: grid; place-items: center;
    font-family: var(--font-display); font-size: 22px;
    position: relative;
  }
  .avery-avatar::after {
    content: ''; position: absolute; bottom: 0; right: 0;
    width: 11px; height: 11px; border-radius: 50%;
    background: var(--green-500); border: 2px solid var(--bg-surface);
  }
  .avery-info { display: flex; flex-direction: column; gap: 4px; line-height: 1; }
  .avery-name { font-weight: 500; font-size: 15px; }
  .avery-role {
    font-family: var(--font-mono); font-size: 10px;
    text-transform: uppercase; color: var(--fg-3);
    display: flex; align-items: center; gap: 8px;
  }
  .avery-dots { display: inline-flex; gap: 3px; }
  .avery-dots span { width: 4px; height: 4px; border-radius: 50%; background: var(--fg-4); }
  .avery-card.speaking .avery-dots span { animation: dot 1.2s infinite var(--ease-out); }
  .avery-card.speaking .avery-dots span:nth-child(2) { animation-delay: 0.2s; }
  .avery-card.speaking .avery-dots span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes dot { 0%,80%,100% { opacity: 0.3; } 40% { opacity: 1; background: var(--green-500); } }

  /* play gate */
  .play-gate {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 16px;
    background: rgba(246,245,243,0.6);
    backdrop-filter: blur(8px);
    z-index: 20;
    transition: opacity 0.4s;
  }
  .play-gate.hidden { opacity: 0; pointer-events: none; }
  .play-gate-btn {
    display: inline-flex; align-items: center; gap: 14px;
    padding: 22px 40px;
    background: var(--green-500); color: white; border: 0;
    border-radius: var(--radius-pill);
    font: 500 18px var(--font-sans); cursor: pointer;
    box-shadow: var(--shadow-md);
    transition: all 0.3s var(--ease-out);
  }
  .play-gate-btn:hover { background: var(--green-700); transform: translateY(-2px); box-shadow: var(--shadow-lg); }
  .pg-icon { font-size: 14px; }
  .pg-meta { font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; color: var(--fg-3); }

  /* section pips */
  .section-pips {
    position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%);
    display: flex; gap: 6px; z-index: 5;
  }
  .pip { width: 24px; height: 3px; background: var(--ink-300); border-radius: 2px; transition: background 0.3s; }
  .pip.on { background: var(--green-500); }
  .pip.past { background: var(--green-300); }

  /* bullets */
  .promise-list { list-style: none; display: flex; flex-direction: column; gap: 16px; }
  .pl-item {
    display: flex; align-items: baseline; gap: 14px;
    background: var(--bg-surface);
    border: 1px solid var(--border-hair);
    border-radius: var(--radius-base);
    padding: 16px 22px;
    opacity: 0; transform: translateY(8px);
    transition: opacity 0.35s var(--ease-out), transform 0.35s var(--ease-out);
  }
  .pl-item.in { opacity: 1; transform: translateY(0); }
  .pl-num {
    font-family: var(--font-mono); font-size: 12px; color: var(--green-700);
    font-feature-settings: "tnum" 1;
  }
  .pl-text { font-size: 19px; color: var(--fg-1); }

  /* keywords */
  .def-head { max-width: 22ch; text-align: center; }
  .def-chips { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; }
  .def-chip {
    background: var(--bg-surface);
    border: 1px solid var(--border-hair);
    border-radius: var(--radius-xl);
    padding: 18px 22px; min-width: 200px;
    box-shadow: var(--shadow-xs);
    opacity: 0; transform: scale(0.94);
    transition: all 0.4s var(--ease-spring);
  }
  .def-chip.in { opacity: 1; transform: scale(1); }
  .dc-term { font-weight: 600; font-size: 18px; color: var(--green-800); margin-bottom: 4px; }
  .dc-unpack { font-size: 14px; color: var(--fg-2); }

  /* cards (formerly anatomy) */
  .ana-grid {
    display: grid; gap: 16px;
    margin-top: 32px;
  }
  .ana-grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
  .ana-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
  .ana-grid.cols-4 { grid-template-columns: repeat(4, 1fr); }
  .ana-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-hair);
    border-radius: var(--radius-xl);
    padding: 24px; min-height: 200px;
    display: flex; flex-direction: column; gap: 12px;
    transition: all 0.4s var(--ease-out);
    cursor: default;
  }
  .ana-card.hot {
    background: var(--success-tint);
    border-color: var(--success-soft);
    box-shadow: 0 0 0 4px var(--success-soft), var(--shadow-md);
    transform: translateY(-4px);
  }
  .ana-card.in { animation: cardIn 0.5s var(--ease-out) backwards; }
  @keyframes cardIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  .ac-icon { width: 32px; height: 32px; color: var(--green-700); }
  .ac-icon svg { width: 100%; height: 100%; }
  .ac-name { font-weight: 600; font-size: 22px; color: var(--fg-1); font-family: var(--font-display); }
  .ac-blurb { font-size: 14px; color: var(--fg-2); line-height: 1.5; }

  /* comparison (formerly cousins) */
  .cou-grid { display: grid; gap: 16px; margin-top: 32px; }
  .cou-grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
  .cou-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
  .cou-grid.cols-4 { grid-template-columns: repeat(4, 1fr); }
  .cou-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-hair);
    border-radius: var(--radius-xl);
    padding: 24px; min-height: 180px;
    display: flex; flex-direction: column; gap: 8px; cursor: default;
    transition: all 0.4s var(--ease-out);
  }
  .cou-card.hot { box-shadow: 0 0 0 3px var(--ink-200), var(--shadow-md); }
  .cou-card.is-target.hero {
    background: linear-gradient(180deg, var(--success-tint), var(--bg-surface));
    border-color: var(--green-500);
    box-shadow: 0 0 0 4px var(--success-soft), var(--shadow-md);
    transform: translateY(-6px) scale(1.03);
  }
  .cc-name { font-family: var(--font-display); font-size: 24px; color: var(--green-800); }
  .cc-diff { font-size: 14px; color: var(--fg-2); }

  /* analogy */
  .analogy-art { width: min(420px, 60vw); aspect-ratio: 16/10; }
  .analogy-art svg { width: 100%; height: 100%; }

  /* steps (formerly method) */
  .method-flow {
    display: flex; align-items: center; gap: 8px;
    flex-wrap: wrap; justify-content: center; margin-top: 32px;
  }
  .ms-step {
    background: var(--bg-surface);
    border: 1px solid var(--border-hair);
    border-radius: var(--radius-base);
    padding: 14px 16px; min-width: 140px;
    display: flex; flex-direction: column; gap: 6px;
    text-align: left;
    transition: all 0.35s var(--ease-out);
  }
  .ms-step.hot { background: var(--success-tint); border-color: var(--success-soft); transform: translateY(-3px); }
  .ms-circle {
    width: 28px; height: 28px; border-radius: 50%;
    background: var(--green-500); color: white;
    display: grid; place-items: center;
    font-family: var(--font-mono); font-size: 13px;
  }
  .ms-verb { font-weight: 600; font-size: 16px; color: var(--fg-1); }
  .ms-detail { font-size: 13px; color: var(--fg-2); line-height: 1.4; }
  .ms-arrow { color: var(--fg-3); font-size: 18px; }
  .ms-loop {
    margin-top: 16px; text-align: center;
    font-family: var(--font-mono); font-size: 12px; color: var(--green-700);
  }

  /* number-pop (formerly example) */
  .ex-company { font-family: var(--font-mono); font-size: 13px; text-transform: uppercase; color: var(--fg-3); }
  .ex-number {
    font-family: var(--font-display); font-weight: 400;
    font-size: clamp(64px, 9vw, 132px);
    color: var(--green-700);
    line-height: 1; letter-spacing: -0.04em;
    opacity: 0; transform: scale(0.92);
    transition: all 0.6s var(--ease-spring);
  }
  .ex-number.pop { opacity: 1; transform: scale(1); }
  .ex-head { max-width: 24ch; }
  .ex-story { color: var(--fg-2); max-width: 64ch; line-height: 1.55; }

  /* quote */
  .quote-mark {
    font-family: var(--font-display); color: var(--green-300);
    font-size: clamp(72px, 10vw, 140px); line-height: 0.6;
    opacity: 0.7;
  }
  .quote-body {
    max-width: 28ch; text-align: center;
    color: var(--green-800);
  }
  .quote-attr {
    font-family: var(--font-mono); font-size: 12px;
    text-transform: uppercase; color: var(--fg-3);
    letter-spacing: 0.04em;
  }

  /* recap */
  .recap-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 32px; }
  .rc-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-hair);
    border-radius: var(--radius-xl);
    padding: 22px;
    display: flex; flex-direction: column; gap: 10px;
    opacity: 0; transform: translateY(10px);
    transition: all 0.4s var(--ease-out);
  }
  .rc-card.in { opacity: 1; transform: translateY(0); }
  .rc-num { font-family: var(--font-mono); font-size: 12px; color: var(--green-700); }
  .rc-text { font-family: var(--font-display); font-size: 22px; color: var(--green-800); line-height: 1.2; }

  /* cta */
  .cta-btn {
    display: inline-flex; align-items: center; gap: 14px;
    padding: 18px 32px;
    background: var(--green-500); color: white;
    border-radius: var(--radius-pill); text-decoration: none;
    font-weight: 500; font-size: 17px;
    box-shadow: var(--shadow-md);
    opacity: 0; transform: scale(0.95);
    transition: all 0.5s var(--ease-spring);
  }
  .cta-btn.show { opacity: 1; transform: scale(1); }
  .cta-btn:hover { background: var(--green-700); transform: scale(1.02); }
  .cta-btn .arrow {
    width: 26px; height: 26px; border-radius: 50%;
    background: rgba(255,255,255,0.18);
    display: grid; place-items: center; font-size: 13px;
  }

  /* interaction overlay */
  .qx-overlay {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    background: rgba(246,245,243,0.55);
    backdrop-filter: blur(6px);
    z-index: 15;
    opacity: 0; pointer-events: none;
    transition: opacity 0.35s var(--ease-out);
  }
  .qx-overlay.show { opacity: 1; pointer-events: auto; }
  .qx-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-hair);
    border-radius: var(--radius-2xl);
    padding: 36px 40px;
    box-shadow: var(--shadow-lg);
    max-width: 560px; width: 90%;
    display: flex; flex-direction: column; gap: 18px;
  }
  .qx-eyebrow { font-family: var(--font-mono); font-size: 12px; text-transform: uppercase; color: var(--green-700); }
  .qx-question { font-family: var(--font-display); font-size: 26px; color: var(--green-800); line-height: 1.2; }
  .qx-options { display: flex; flex-direction: column; gap: 10px; }
  .qx-opt {
    background: var(--bg-app); border: 1px solid var(--border-hair);
    border-radius: var(--radius-base); padding: 14px 18px;
    font-size: 16px; cursor: pointer; text-align: left;
    transition: all 0.2s var(--ease-out);
  }
  .qx-opt:hover { border-color: var(--border-strong); transform: translateY(-1px); }
  .qx-opt.right { background: var(--success-tint); border-color: var(--green-500); }
  .qx-opt.wrong { background: var(--danger-tint); border-color: var(--danger-solid); }
  .qx-opt.locked { cursor: default; opacity: 0.7; }
  .qx-feedback { font-size: 14px; color: var(--fg-2); min-height: 22px; }
  .qx-feedback.right { color: var(--green-700); }
  .qx-feedback.wrong { color: var(--danger-solid); }

  /* swipe overlay */
  .swipe-overlay {
    position: absolute; inset: 0;
    background: var(--bg-app);
    display: flex; align-items: center; justify-content: center;
    z-index: 14; opacity: 0; pointer-events: none;
    transition: opacity 0.5s var(--ease-out);
  }
  .swipe-overlay.show { opacity: 1; pointer-events: auto; }
  .swipe-frame {
    display: flex; flex-direction: column; align-items: center; gap: 24px;
    width: min(560px, 92vw);
  }
  .sw-eyebrow { font-family: var(--font-mono); font-size: 12px; text-transform: uppercase; color: var(--fg-3); }
  .sw-prompt { font-family: var(--font-display); font-size: 32px; color: var(--green-800); text-align: center; }
  .sw-stack { position: relative; width: 100%; height: 320px; }
  .sw-card {
    position: absolute; inset: 0;
    background: var(--bg-surface);
    border: 1px solid var(--border-hair);
    border-radius: var(--radius-2xl);
    padding: 32px;
    box-shadow: var(--shadow-md);
    display: flex; flex-direction: column; gap: 16px; justify-content: space-between;
    transition: all 0.4s var(--ease-out);
  }
  .sw-card[data-stack="0"] { transform: translateY(0) scale(1); opacity: 1; }
  .sw-card[data-stack="1"] { transform: translateY(18px) scale(0.94); opacity: 0.55; filter: saturate(0.6); }
  .sw-card[data-stack="2"] { transform: translateY(36px) scale(0.88); opacity: 0.3;  filter: saturate(0.4); }
  .sw-card[data-stack="3"] { transform: translateY(54px) scale(0.82); opacity: 0.15; filter: saturate(0.2); }
  .sw-card.gone { opacity: 0; transform: translateX(120%) rotate(8deg); }
  .sw-card.gone-left { opacity: 0; transform: translateX(-120%) rotate(-8deg); }
  .sw-card.right { background: var(--success-tint); border-color: var(--green-500); }
  .sw-card.wrong-pick { background: var(--danger-tint); border-color: var(--danger-solid); }
  .sw-num { font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; color: var(--fg-3); }
  .sw-scenario { font-family: var(--font-display); font-size: 24px; color: var(--green-800); line-height: 1.2; }
  .sw-explain { font-size: 14px; color: var(--fg-2); opacity: 0; transition: opacity 0.3s; }
  .sw-card.revealed .sw-explain { opacity: 1; }
  .sw-actions { display: flex; gap: 14px; }
  .sw-btn {
    padding: 14px 32px; border-radius: var(--radius-pill);
    border: 1px solid var(--border-strong); background: var(--bg-surface);
    font-weight: 500; font-size: 16px; cursor: pointer;
    transition: all 0.2s var(--ease-out);
  }
  .sw-btn.yes { background: var(--green-500); color: white; border-color: var(--green-500); }
  .sw-btn.yes:hover { background: var(--green-700); }
  .sw-btn.no:hover { border-color: var(--ink-700); }
  .sw-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .sw-score {
    font-family: var(--font-display); font-size: 28px; color: var(--green-700);
    opacity: 0; transition: opacity 0.4s;
  }
  .sw-score.show { opacity: 1; }

  /* controls */
  .controls {
    display: flex; align-items: center; gap: 16px;
    padding: 14px 32px;
    border-top: 1px solid var(--border-hair);
    background: rgba(246,245,243,0.92);
    backdrop-filter: blur(10px);
  }
  .play-btn {
    width: 40px; height: 40px; border-radius: 50%;
    background: var(--ink-900); color: white; border: 0;
    display: grid; place-items: center; cursor: pointer;
    box-shadow: var(--shadow-sm);
  }
  .play-btn:hover { background: var(--ink-700); }
  .play-icon {
    width: 0; height: 0; border-style: solid;
    border-width: 6px 0 6px 10px;
    border-color: transparent transparent transparent currentColor;
    margin-left: 3px;
  }
  .play-btn.playing .play-icon {
    width: 10px; height: 12px; border: 0; margin: 0;
    background: linear-gradient(to right, currentColor 0 35%, transparent 35% 65%, currentColor 65% 100%);
  }
  .scrub-wrap { flex: 1; display: flex; align-items: center; gap: 12px; }
  .timecode { font-family: var(--font-mono); font-size: 12px; color: var(--fg-3); min-width: 42px; }
  .scrub { flex: 1; height: 4px; background: var(--ink-200); border-radius: 999px; position: relative; cursor: pointer; }
  .scrub-fill { position: absolute; left: 0; top: 0; height: 100%; width: 0; background: var(--green-500); border-radius: 999px; }
  .scrub-thumb { position: absolute; top: 50%; transform: translate(-50%, -50%); width: 12px; height: 12px; left: 0; border-radius: 50%; background: var(--green-500); box-shadow: var(--shadow-sm); }
  .speed-pill, .scene-pill {
    padding: 7px 12px; border-radius: var(--radius-pill);
    font-family: var(--font-mono); font-size: 11px;
    text-transform: uppercase; cursor: pointer;
  }
  .speed-pill { background: var(--bg-surface); border: 1px solid var(--border-hair); color: var(--fg-2); }
  .scene-pill { background: var(--success-tint); color: var(--green-800); border: 1px solid var(--success-soft); }

  /* Per-word spans used by the GSAP headline reveal */
  .word-in { display: inline-block; will-change: transform, opacity, filter; }

  /* Keyboard-shortcut hint pill */
  .kb-hint {
    position: fixed; left: 50%; bottom: 80px;
    transform: translateX(-50%) translateY(8px);
    background: var(--ink-900); color: white;
    padding: 8px 18px; border-radius: var(--radius-pill);
    font-family: var(--font-mono); font-size: 12px;
    letter-spacing: 0.04em; text-transform: uppercase;
    opacity: 0; pointer-events: none; z-index: 50;
    transition: opacity 220ms var(--ease-out), transform 220ms var(--ease-out);
  }
  .kb-hint.show { opacity: 1; transform: translateX(-50%) translateY(0); }

  .kb-help {
    font-family: var(--font-mono); font-size: 9px;
    color: var(--fg-4); letter-spacing: 0.04em;
    text-transform: uppercase;
    margin-left: auto; margin-right: 8px;
  }
  .kb-help kbd {
    background: var(--bg-sunken); border: 1px solid var(--border-hair);
    padding: 1px 5px; border-radius: 4px;
    font-family: inherit; font-size: 9px; color: var(--fg-3);
    margin: 0 1px;
  }

  @media (max-width: 880px) {
    .scene { padding: 80px 24px 60px; }
    .ana-grid.cols-3, .ana-grid.cols-4, .cou-grid.cols-3, .cou-grid.cols-4, .recap-cards { grid-template-columns: 1fr 1fr; }
    .scene-inner.two-col { grid-template-columns: 1fr; gap: 24px; }
    .topbar-tags .topbar-tag:nth-child(n+2) { display: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { transition-duration: 1ms !important; animation-duration: 1ms !important; }
  }
`;

// =====================================================================
// RUNTIME JS — inlined into the rendered HTML.
//
// Walks SECTIONS (one per scene) to:
//   - activate the right scene on time
//   - dispatch per-kind enter animations on scene start
//   - apply per-anchor inner reveals (cards, steps, comparison items)
//   - sync to audio.currentTime as the master clock
//
// Plus: keyboard shortcuts, scrub bar, speed pill, interaction overlays,
// swipe stack at end. Same UX as the prior version, just driven by
// SECTIONS[] now instead of hardcoded beat names.
// =====================================================================

const RUNTIME_JS = `
(() => {
  const $ = id => document.getElementById(id);
  const audio = $('avery');
  const stage = $('stage');
  const playGate = $('playGate');
  const playGateBtn = $('playGateBtn');
  const playBtn = $('playBtn');
  const averyCard = $('averyCard');
  const scrub = $('scrub');
  const scrubFill = $('scrubFill');
  const scrubThumb = $('scrubThumb');
  const tcCur = $('tcCur');
  const tcDur = $('tcDur');
  const speedPill = $('speedPill');
  const scenePill = $('scenePill');
  const sectionPips = $('sectionPips');

  const fmt = t => { const m = Math.floor(t / 60); const s = Math.floor(t % 60); return m + ':' + String(s).padStart(2, '0'); };
  tcDur.textContent = fmt(TOTAL);

  // ---------- pips -----------
  SECTIONS.forEach((s) => {
    const el = document.createElement('div');
    el.className = 'pip'; el.dataset.id = s.id;
    sectionPips.appendChild(el);
  });

  // ---------- scene activation -----------
  let currentScene = null;
  function activateScene(id) {
    if (id === currentScene) return;
    document.querySelectorAll('.scene').forEach(s => s.classList.toggle('active', s.dataset.scene === id));
    currentScene = id;
    const def = SECTIONS.find(s => s.id === id);
    if (def) scenePill.textContent = def.label;
    const idx = SECTIONS.findIndex(s => s.id === id);
    document.querySelectorAll('.pip').forEach((p, i) => {
      p.classList.toggle('on', i === idx);
      p.classList.toggle('past', i < idx);
    });
  }

  // ---------- master timeline -----------
  const master = gsap.timeline({ paused: true });
  buildTimeline(master);
  master.duration(TOTAL);

  // Per-kind enter animation. Runs ONCE per scene at the scene's start
  // anchor — staggers cards/bullets in, pops the number, etc.
  function enterAnimation(sectionDef) {
    const sceneEl = document.querySelector('[data-scene="' + sectionDef.id + '"]');
    if (!sceneEl) return;
    const kind = sectionDef.kind;

    if (kind === 'title') {
      const headline = sceneEl.querySelector('[data-anim-headline]');
      if (headline && !headline.dataset.split) {
        const html = headline.innerHTML;
        const words = html.split(/(\\s+)/).map(t => /\\s+/.test(t) ? t : '<span class="word-in">' + t + '</span>');
        headline.innerHTML = words.join('');
        headline.dataset.split = '1';
      }
      if (headline) {
        gsap.from(headline.querySelectorAll('.word-in'), {
          opacity: 0, y: 18, filter: 'blur(8px)',
          duration: 0.7, stagger: 0.05, ease: 'power3.out',
        });
      }
    } else if (kind === 'bullets') {
      const items = sceneEl.querySelectorAll('.pl-item');
      items.forEach(el => el.classList.add('in'));
      gsap.from(items, { opacity: 0, x: -16, duration: 0.55, stagger: 0.15, ease: 'power2.out' });
    } else if (kind === 'keywords') {
      const chips = sceneEl.querySelectorAll('.def-chip');
      chips.forEach(c => c.classList.add('in'));
      gsap.from(chips, { scale: 0.85, opacity: 0, y: 10, duration: 0.6, stagger: 0.18, ease: 'back.out(1.4)' });
    } else if (kind === 'cards') {
      const cards = sceneEl.querySelectorAll('.ana-card');
      cards.forEach(c => c.classList.add('in'));
      gsap.from(cards, { opacity: 0, y: 24, scale: 0.95, duration: 0.55, stagger: 0.08, ease: 'power3.out' });
    } else if (kind === 'comparison') {
      const cards = sceneEl.querySelectorAll('.cou-card');
      gsap.from(cards, { opacity: 0, y: 18, duration: 0.5, stagger: 0.12, ease: 'power2.out' });
    } else if (kind === 'analogy') {
      const art = sceneEl.querySelector('.analogy-art');
      if (art) gsap.from(art, { opacity: 0, scale: 0.92, duration: 0.7, ease: 'power2.out' });
    } else if (kind === 'steps') {
      const steps = sceneEl.querySelectorAll('.ms-step');
      const arrows = sceneEl.querySelectorAll('.ms-arrow');
      gsap.from(steps,  { opacity: 0, y: 14, duration: 0.45, stagger: 0.1, ease: 'power2.out' });
      gsap.from(arrows, { opacity: 0, scale: 0, duration: 0.3, stagger: 0.1, delay: 0.05, ease: 'back.out(2)' });
    } else if (kind === 'number-pop') {
      const num = sceneEl.querySelector('[data-anim-number]');
      if (num) {
        num.classList.add('pop');
        gsap.fromTo(num,
          { scale: 0.6, y: 30, opacity: 0 },
          { scale: 1, y: 0, opacity: 1, duration: 0.7, ease: 'back.out(1.6)' });
      }
    } else if (kind === 'quote') {
      const body = sceneEl.querySelector('.quote-body');
      const mark = sceneEl.querySelector('.quote-mark');
      if (mark) gsap.from(mark, { opacity: 0, scale: 0.7, duration: 0.6, ease: 'power2.out' });
      if (body) gsap.from(body, { opacity: 0, y: 14, duration: 0.7, delay: 0.15, ease: 'power3.out' });
    } else if (kind === 'recap') {
      const cards = sceneEl.querySelectorAll('.rc-card');
      cards.forEach(c => c.classList.add('in'));
      gsap.from(cards, { opacity: 0, y: 18, duration: 0.5, stagger: 0.12, ease: 'power3.out' });
    } else if (kind === 'cta') {
      const btn = sceneEl.querySelector('[data-anim-cta]');
      if (btn) {
        btn.classList.add('show');
        gsap.fromTo(btn, { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.55, ease: 'back.out(1.4)' });
      }
    }
  }

  // Apply per-anchor inner reveals — when a card/step/cmp item is named
  // in the audio, light it up briefly. Anchors are named like
  // \`\${sceneId}_card_N\`, \`\${sceneId}_step_N\`, \`\${sceneId}_cmp_N\`.
  function innerReveals(sectionDef) {
    const sceneEl = document.querySelector('[data-scene="' + sectionDef.id + '"]');
    if (!sceneEl) return;

    const wireUp = (selector, prefix) => {
      sceneEl.querySelectorAll(selector).forEach((el, i) => {
        const t = ANCHORS[sectionDef.id + '_' + prefix + '_' + (i + 1)];
        if (t == null) return;
        master.add(() => {
          el.classList.add('hot');
          gsap.fromTo(el, { scale: 1 }, { scale: 1.03, duration: 0.3, yoyo: true, repeat: 1, ease: 'power2.inOut' });
        }, t);
        master.add(() => el.classList.remove('hot'), t + 1.5);
      });
    };
    if (sectionDef.kind === 'cards')      wireUp('.ana-card', 'card');
    if (sectionDef.kind === 'steps')      wireUp('.ms-step',  'step');
    if (sectionDef.kind === 'comparison') {
      sceneEl.querySelectorAll('.cou-card').forEach((el, i) => {
        const t = ANCHORS[sectionDef.id + '_cmp_' + (i + 1)];
        if (t == null) return;
        master.add(() => el.classList.add('hot'), t);
        if (el.classList.contains('is-target')) {
          master.add(() => el.classList.add('hero'), t + 0.4);
        } else {
          master.add(() => el.classList.remove('hot'), t + 1.5);
        }
      });
    }
    if (sectionDef.kind === 'recap')      wireUp('.rc-card', 'card');
  }

  function buildTimeline(tl) {
    SECTIONS.forEach((sec) => {
      // Schedule scene activation slightly before its start so the fade
      // begins on time.
      tl.add(() => activateScene(sec.id), Math.max(0, sec.start - 0.3));
      // Run kind-specific enter animation right at the scene's start.
      tl.add(() => enterAnimation(sec), sec.start + 0.05);
      // Inner reveals are added directly to the master so we don't double-add.
      innerReveals(sec);
    });
  }

  // ---------- ticker -----------
  let isPlaying = false;
  function updateTicker() {
    const t = audio.currentTime;
    if (!audio.paused) master.seek(t);

    const cur = SECTIONS.find(s => t >= s.start - 0.05 && t < s.end);
    if (cur) activateScene(cur.id);

    const pct = TOTAL ? Math.min(100, (t / TOTAL) * 100) : 0;
    scrubFill.style.width = pct + '%';
    scrubThumb.style.left = pct + '%';
    tcCur.textContent = fmt(t);

    checkInteractions(t);
  }
  gsap.ticker.add(updateTicker);

  // ---------- play / pause -----------
  function play() {
    audio.play().then(() => {
      isPlaying = true;
      averyCard.classList.add('speaking');
      playBtn.classList.add('playing');
      playGate.classList.add('hidden');
    }).catch(err => { console.warn('Play blocked:', err); });
  }
  function pause() {
    audio.pause();
    isPlaying = false;
    averyCard.classList.remove('speaking');
    playBtn.classList.remove('playing');
  }
  playGateBtn.addEventListener('click', play);
  playBtn.addEventListener('click', () => isPlaying ? pause() : play());

  // ---------- scrub -----------
  scrub.addEventListener('click', e => {
    const r = scrub.getBoundingClientRect();
    const ratio = (e.clientX - r.left) / r.width;
    audio.currentTime = Math.max(0, Math.min(TOTAL, ratio * TOTAL));
    interactionsState.forEach(i => { if (i.fired && audio.currentTime < i.at - 0.1) i.fired = false; });
    closeOverlay();
  });

  // ---------- speed -----------
  const SPEEDS = [1, 1.25, 1.5, 2, 0.75];
  let speedIdx = 0;
  function cycleSpeed() {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    audio.playbackRate = SPEEDS[speedIdx];
    speedPill.textContent = SPEEDS[speedIdx] + '×';
  }
  speedPill.addEventListener('click', cycleSpeed);

  // ---------- YouTube-style keyboard shortcuts -----------
  function seek(deltaSec) {
    audio.currentTime = Math.max(0, Math.min(TOTAL, audio.currentTime + deltaSec));
    interactionsState.forEach(i => { if (i.fired && audio.currentTime < i.at - 0.1) i.fired = false; });
    closeOverlay();
    showHint(deltaSec > 0 ? '+' + deltaSec + 's' : deltaSec + 's');
  }
  function showHint(text) {
    let h = document.getElementById('kbHint');
    if (!h) {
      h = document.createElement('div');
      h.id = 'kbHint';
      h.className = 'kb-hint';
      document.body.appendChild(h);
    }
    h.textContent = text;
    h.classList.remove('show'); void h.offsetWidth; h.classList.add('show');
    clearTimeout(showHint._t);
    showHint._t = setTimeout(() => h.classList.remove('show'), 700);
  }
  window.addEventListener('keydown', (e) => {
    const tag = (e.target?.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.code) {
      case 'Space':       e.preventDefault(); isPlaying ? pause() : play(); showHint(isPlaying ? '▶' : '⏸'); break;
      case 'KeyK':        e.preventDefault(); isPlaying ? pause() : play(); showHint(isPlaying ? '▶' : '⏸'); break;
      case 'ArrowRight':  e.preventDefault(); seek(+5); break;
      case 'ArrowLeft':   e.preventDefault(); seek(-5); break;
      case 'KeyL':        e.preventDefault(); seek(+10); break;
      case 'KeyJ':        e.preventDefault(); seek(-10); break;
      case 'KeyM':        e.preventDefault(); audio.muted = !audio.muted; showHint(audio.muted ? 'muted' : 'unmuted'); break;
      case 'Comma':       if (e.shiftKey) { e.preventDefault();
                            speedIdx = (speedIdx - 1 + SPEEDS.length) % SPEEDS.length;
                            audio.playbackRate = SPEEDS[speedIdx];
                            speedPill.textContent = SPEEDS[speedIdx] + '×';
                            showHint(SPEEDS[speedIdx] + '×'); } break;
      case 'Period':      if (e.shiftKey) { e.preventDefault(); cycleSpeed(); showHint(SPEEDS[speedIdx] + '×'); } break;
      default:
        if (e.code.startsWith('Digit')) {
          const n = parseInt(e.code.slice(5), 10);
          if (!isNaN(n)) {
            e.preventDefault();
            audio.currentTime = (TOTAL * n) / 10;
            showHint(n * 10 + '%');
          }
        }
    }
  });

  // ---------- interactions -----------
  // Fire each interaction 1.5s before its anchor scene ends. We resolve
  // \`anchor_scene_label\` to a section's end time.
  const interactionsState = (SCRIPT.interactions || []).map(q => ({
    ...q,
    at: (() => {
      const label = (q.anchor_scene_label || '').trim().toLowerCase();
      const def = SECTIONS.find(s => (s.label || '').trim().toLowerCase() === label);
      return def ? def.end - 1.5 : null;
    })(),
    fired: false,
    answered: false,
  }));
  const overlay = $('qxOverlay');
  const qxQ = $('qxQuestion');
  const qxOpts = $('qxOptions');
  const qxFb = $('qxFeedback');

  function checkInteractions(t) {
    for (const q of interactionsState) {
      if (q.at == null || q.fired || q.answered) continue;
      if (t >= q.at) {
        q.fired = true;
        showInteraction(q);
        return;
      }
    }
  }
  function showInteraction(q) {
    pause();
    qxQ.textContent = q.question;
    qxOpts.innerHTML = '';
    qxFb.textContent = '';
    qxFb.className = 'qx-feedback';
    (q.options || []).forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'qx-opt';
      btn.textContent = opt.label;
      btn.addEventListener('click', () => answerInteraction(q, opt, btn));
      qxOpts.appendChild(btn);
    });
    overlay.classList.add('show');
  }
  function answerInteraction(q, opt, btn) {
    if (q.answered) return;
    if (opt.correct) {
      q.answered = true;
      btn.classList.add('right');
      qxFb.textContent = q.ok_line;
      qxFb.classList.add('show', 'right');
      document.querySelectorAll('.qx-opt').forEach(b => b.classList.add('locked'));
      setTimeout(() => { closeOverlay(); play(); }, 1500);
    } else {
      btn.classList.add('wrong');
      qxFb.textContent = q.bad_line;
      qxFb.classList.add('show', 'wrong');
    }
  }
  function closeOverlay() { overlay.classList.remove('show'); }

  // ---------- swipe stack (only if swipe cards exist) -----------
  const swipeOverlay = $('swipeOverlay');
  if (swipeOverlay) {
    const swStack = $('swStack');
    const swYes = $('swYes');
    const swNo = $('swNo');
    const swScore = $('swScore');
    let swIdx = 0;
    let swCorrect = 0;

    audio.addEventListener('ended', () => {
      pause();
      swipeOverlay.classList.add('show');
    });

    function decide(answer) {
      const cards = swStack.querySelectorAll('.sw-card:not(.gone):not(.gone-left)');
      if (!cards.length) return;
      const top = cards[0];
      const truth = top.dataset.answer;
      const right = answer === truth;
      if (right) { swCorrect++; top.classList.add('right'); }
      else top.classList.add('wrong-pick');
      top.classList.add('revealed');
      setTimeout(() => {
        top.classList.add(answer === 'yes' ? 'gone' : 'gone-left');
        const remaining = swStack.querySelectorAll('.sw-card:not(.gone):not(.gone-left)');
        remaining.forEach((c, i) => c.dataset.stack = i);
        swIdx++;
        if (swIdx >= (SCRIPT.swipe || []).length) finishSwipe();
      }, 800);
    }
    swYes.addEventListener('click', () => decide('yes'));
    swNo.addEventListener('click', () => decide('no'));

    function finishSwipe() {
      swYes.disabled = true; swNo.disabled = true;
      const total = (SCRIPT.swipe || []).length;
      const passed = swCorrect >= Math.ceil(total * 0.75);
      swScore.textContent = swCorrect + '/' + total + ' · ' + (passed ? 'Locked in. You' + String.fromCharCode(8217) + 've got it.' : 'Worth a rewatch.');
      swScore.classList.add('show');
    }
  }

  // ---------- start -----------
  if (SECTIONS.length) activateScene(SECTIONS[0].id);
})();
`;
