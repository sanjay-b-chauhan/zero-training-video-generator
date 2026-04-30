// Preview renderer. Takes a script JSON and renders an HTML document that
// shows what each beat looks like in the final video — but as a vertically
// scrollable preview, no audio sync needed. Used in the workspace's right
// panel (the iframe) so the founder can see their script come alive as
// they edit it.
//
// Once we have real audio, the same script can flow into videoAssembler.js
// to produce the audio-locked final HTML. This renderer is a faster
// feedback loop during iteration.

const esc = (s = '') => String(s)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function highlightHeadline(headline, phrase) {
  if (!headline) return '';
  const safeH = esc(headline);
  if (!phrase) return safeH;
  const idx = safeH.toLowerCase().indexOf(esc(phrase).toLowerCase());
  if (idx < 0) return safeH;
  const safeP = esc(phrase);
  return safeH.slice(0, idx) + '<span class="hl">' + safeH.slice(idx, idx + safeP.length) + '</span>' + safeH.slice(idx + safeP.length);
}

export function renderPreviewHTML(script) {
  if (!script) return EMPTY_PREVIEW;
  const beats = [
    renderHook(script),
    renderPromise(script),
    renderDefinition(script),
    renderAnatomy(script),
    renderCousins(script),
    renderAnalogy(script),
    renderMethod(script),
    renderExample(script),
    renderRecap(script),
    renderCTA(script),
    renderSwipePeek(script),
  ].join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Preview · ${esc(script.concept || 'Untitled')}</title>
<link rel="stylesheet" href="../zds/colors_and_type.css">
<style>${PREVIEW_CSS}</style>
</head>
<body class="zero-theme">
  <div class="preview-shell">
    <div class="pv-topbar">
      <div class="pv-brand">
        <div class="pv-mark">z</div>
        <div class="pv-tag">${esc(script.tagline || 'Concept training')}</div>
      </div>
      <div class="pv-meta">${esc(script.concept || '')} · ${esc(script.focus || '')}</div>
    </div>
    <div class="pv-mock-banner">
      <span class="pv-dot"></span>
      preview · this is what each beat looks like in the final video
    </div>
    ${beats}
    <div class="pv-foot type-mono-label">end of preview · ${beats.length} sections</div>
  </div>
</body>
</html>`;
}

const EMPTY_PREVIEW = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><link rel="stylesheet" href="../zds/colors_and_type.css">
<style>
  body { margin: 0; height: 100vh; background: var(--bg-cream); font-family: var(--font-sans); display: grid; place-items: center; }
  .empty {
    text-align: center; max-width: 380px; padding: 40px;
    color: var(--fg-3); font-family: var(--font-mono); font-size: 12px;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .empty .big {
    font-family: var(--font-display); font-size: 32px;
    color: var(--green-800); text-transform: none; letter-spacing: -0.02em;
    margin-bottom: 12px; line-height: 1.1;
  }
</style>
</head><body class="zero-theme">
  <div class="empty">
    <div class="big">Preview lives here</div>
    Type a concept on the left and click Generate. Each of the 10 beats will render below as you edit.
  </div>
</body></html>`;

function renderHook(s) {
  const h = s.hook || {};
  return `
    <section class="pv-section pv-section-hook">
      <div class="pv-pill type-mono-label">01 · hook</div>
      <div class="pv-kicker">${esc(h.kicker || 'Chapter 01')}</div>
      <h1 class="pv-display">${highlightHeadline(h.headline, h.highlight_phrase)}</h1>
    </section>`;
}

function renderPromise(s) {
  const p = s.promise || {};
  const items = (p.bullets || []).map((b, i) => `
    <li class="pv-bullet">
      <span class="pv-num">0${i + 1}</span>
      <span>${esc(b)}</span>
    </li>`).join('');
  return `
    <section class="pv-section pv-section-promise">
      <div class="pv-pill type-mono-label">02 · promise</div>
      <h2 class="pv-mid">By the end you will:</h2>
      <ul class="pv-list">${items}</ul>
    </section>`;
}

function renderDefinition(s) {
  const d = s.definition || {};
  const chips = (d.keywords || []).map((k, i) => `
    <div class="pv-chip" style="--i:${i}">
      <div class="pv-chip-term">${esc(k.term)}</div>
      <div class="pv-chip-unpack">${esc(k.unpack)}</div>
    </div>`).join('');
  return `
    <section class="pv-section pv-section-defn">
      <div class="pv-pill type-mono-label">03 · definition</div>
      <h2 class="pv-mid">${esc(d.headline)}</h2>
      <div class="pv-chips">${chips}</div>
    </section>`;
}

function renderAnatomy(s) {
  const a = s.anatomy || {};
  const cards = (a.items || []).map((it, i) => `
    <div class="pv-card pv-anatomy-card">
      <div class="pv-card-num">0${i + 1}</div>
      <div class="pv-card-name">${esc(it.name)}</div>
      <div class="pv-card-blurb">${esc(it.blurb)}</div>
    </div>`).join('');
  return `
    <section class="pv-section pv-section-anatomy">
      <div class="pv-pill type-mono-label">04 · anatomy</div>
      <h2 class="pv-mid">${esc(a.intro_line || 'The four parts:')}</h2>
      <div class="pv-grid pv-grid-4">${cards}</div>
    </section>`;
}

function renderCousins(s) {
  const c = s.cousins || {};
  const target = (c.target || '').trim().toLowerCase();
  const cards = (c.items || []).map(it => {
    const isTarget = it.name.trim().toLowerCase() === target;
    return `
      <div class="pv-card pv-cousin-card${isTarget ? ' is-target' : ''}">
        <div class="pv-card-name">${esc(it.name)}</div>
        <div class="pv-card-blurb">${esc(it.diff)}</div>
      </div>`;
  }).join('');
  return `
    <section class="pv-section pv-section-cousins">
      <div class="pv-pill type-mono-label">05 · cousins</div>
      <h2 class="pv-mid">${esc(c.intro_line || 'Don’t confuse with:')}</h2>
      <div class="pv-grid pv-grid-3">${cards}</div>
    </section>`;
}

function renderAnalogy(s) {
  const a = s.analogy || {};
  return `
    <section class="pv-section pv-section-analogy">
      <div class="pv-pill type-mono-label">06 · analogy</div>
      <div class="pv-kicker">It is like</div>
      <h2 class="pv-display">${esc(a.headline)}</h2>
      <div class="pv-art">
        <svg viewBox="0 0 320 180" aria-hidden="true">
          <defs><linearGradient id="ag" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="rgba(73,186,97,0.25)"/><stop offset="100%" stop-color="rgba(73,186,97,0.02)"/></linearGradient></defs>
          <path d="M20 150 Q 80 50 160 75 T 300 50" fill="none" stroke="rgb(73,186,97)" stroke-width="2.4" stroke-linecap="round"/>
          <path d="M20 150 Q 80 50 160 75 T 300 50 L 300 160 L 20 160 Z" fill="url(#ag)"/>
        </svg>
      </div>
    </section>`;
}

function renderMethod(s) {
  const m = s.method || {};
  const steps = (m.steps || []).map((step, i, arr) => `
    <div class="pv-step">
      <div class="pv-step-num">${i + 1}</div>
      <div class="pv-step-verb">${esc(step.verb)}</div>
      <div class="pv-step-detail">${esc(step.detail)}</div>
    </div>
    ${i < arr.length - 1 ? '<div class="pv-step-arrow">→</div>' : ''}
  `).join('');
  return `
    <section class="pv-section pv-section-method">
      <div class="pv-pill type-mono-label">07 · method</div>
      <h2 class="pv-mid">${esc(m.intro_line || 'The steps:')}</h2>
      <div class="pv-method-flow">${steps}</div>
    </section>`;
}

function renderExample(s) {
  const e = s.example || {};
  return `
    <section class="pv-section pv-section-example">
      <div class="pv-pill type-mono-label">08 · case</div>
      <div class="pv-kicker">${esc(e.company || '')}</div>
      <div class="pv-big-num">${esc(e.number || '')}</div>
      <h2 class="pv-mid">${esc(e.headline)}</h2>
      <p class="pv-story">${esc(e.story)}</p>
    </section>`;
}

function renderRecap(s) {
  const r = s.recap || {};
  const cards = (r.cards || []).map((c, i) => `
    <div class="pv-card">
      <div class="pv-card-num">0${i + 1}</div>
      <div class="pv-card-recap">${esc(c)}</div>
    </div>`).join('');
  return `
    <section class="pv-section pv-section-recap">
      <div class="pv-pill type-mono-label">09 · recap</div>
      <div class="pv-grid pv-grid-3">${cards}</div>
    </section>`;
}

function renderCTA(s) {
  const c = s.cta || {};
  return `
    <section class="pv-section pv-section-cta">
      <div class="pv-pill type-mono-label">10 · cta</div>
      <h2 class="pv-display">${esc(c.headline)}</h2>
      <a class="pv-btn" href="${esc(s.tool_url || '#')}" target="_blank" rel="noopener">${esc(c.button_label || 'Continue')} →</a>
    </section>`;
}

function renderSwipePeek(s) {
  const sw = s.swipe || [];
  if (!sw.length) return '';
  return `
    <section class="pv-section pv-section-swipe">
      <div class="pv-pill type-mono-label">pou · swipe</div>
      <h2 class="pv-mid">Pick the ${sw.length} that count.</h2>
      <div class="pv-swipe-deck">
        ${sw.map((s, i) => `
          <div class="pv-swipe-card" style="--i:${i}">
            <div class="pv-swipe-q">0${i + 1} of ${sw.length}</div>
            <div class="pv-swipe-scenario">${esc(s.scenario)}</div>
            <div class="pv-swipe-answer pv-swipe-${esc(s.answer)}">${esc((s.answer || '').toUpperCase())}</div>
            <div class="pv-swipe-explain">${esc(s.explain)}</div>
          </div>
        `).join('')}
      </div>
    </section>`;
}

const PREVIEW_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: var(--bg-app); }
  body { font-family: var(--font-sans); color: var(--fg-1); padding-bottom: 80px; }
  .preview-shell { max-width: 980px; margin: 0 auto; padding: 24px 32px 60px; }
  .hl { background: var(--green-200); color: var(--green-900); padding: 0 0.18em; border-radius: 8px; }

  .pv-topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 0; margin-bottom: 18px;
    border-bottom: 1px solid var(--border-hair);
  }
  .pv-brand { display: flex; align-items: center; gap: 10px; }
  .pv-mark { width: 28px; height: 28px; border-radius: 50%; background: var(--green-800); color: var(--ink-50); display: grid; place-items: center; font-family: var(--font-display); font-size: 14px; }
  .pv-tag { font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; color: var(--fg-3); letter-spacing: 0.04em; }
  .pv-meta { font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; color: var(--fg-3); letter-spacing: 0.04em; }

  .pv-mock-banner {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 6px 14px;
    background: var(--success-tint); color: var(--green-700);
    border: 1px solid var(--success-soft);
    border-radius: var(--radius-pill);
    font-family: var(--font-mono); font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.04em;
    margin: 16px 0 24px;
  }
  .pv-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green-500); animation: pv-pulse 1.6s ease-in-out infinite; }
  @keyframes pv-pulse { 0%, 100% { opacity: 0.4 } 50% { opacity: 1 } }

  .pv-section {
    background: var(--bg-surface);
    border: 1px solid var(--border-hair);
    border-radius: var(--radius-2xl);
    padding: 36px 40px;
    margin-bottom: 16px;
    display: flex; flex-direction: column; gap: 16px;
  }
  .pv-pill { color: var(--green-700); font-size: 10px; }
  .pv-kicker { font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--fg-3); }
  .pv-display {
    font-family: var(--font-display); font-weight: 400;
    font-size: clamp(36px, 4.4vw, 56px); line-height: 1.05;
    letter-spacing: -0.03em; color: var(--green-800);
    text-wrap: pretty; margin: 0;
  }
  .pv-mid {
    font-family: var(--font-display); font-weight: 400;
    font-size: clamp(24px, 2.6vw, 32px); line-height: 1.1;
    letter-spacing: -0.025em; color: var(--green-800); margin: 0;
  }

  .pv-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
  .pv-bullet { display: flex; gap: 14px; align-items: baseline; padding: 14px 18px; background: var(--bg-cream); border-radius: var(--radius-base); }
  .pv-num { font-family: var(--font-mono); color: var(--green-700); font-size: 12px; }

  .pv-chips { display: flex; gap: 12px; flex-wrap: wrap; }
  .pv-chip { background: var(--bg-cream); border-radius: var(--radius-xl); padding: 16px 20px; min-width: 160px; flex: 1; }
  .pv-chip-term { font-weight: 600; font-size: 16px; color: var(--green-800); }
  .pv-chip-unpack { font-size: 13px; color: var(--fg-2); margin-top: 4px; }

  .pv-grid { display: grid; gap: 12px; }
  .pv-grid-4 { grid-template-columns: repeat(4, 1fr); }
  .pv-grid-3 { grid-template-columns: repeat(3, 1fr); }
  .pv-card {
    background: var(--bg-cream);
    border: 1px solid var(--border-hair);
    border-radius: var(--radius-lg);
    padding: 16px 18px;
    display: flex; flex-direction: column; gap: 6px;
    min-height: 120px;
  }
  .pv-anatomy-card .pv-card-num,
  .pv-card-num { font-family: var(--font-mono); color: var(--green-700); font-size: 11px; }
  .pv-card-name {
    font-family: var(--font-display); color: var(--green-800);
    font-size: 18px; line-height: 1.1;
  }
  .pv-card-blurb { font-size: 13px; color: var(--fg-2); line-height: 1.45; }
  .pv-card-recap { font-family: var(--font-display); color: var(--green-800); font-size: 17px; line-height: 1.2; }
  .pv-cousin-card.is-target {
    background: var(--success-tint);
    border-color: var(--green-500);
    box-shadow: 0 0 0 3px var(--success-soft);
  }

  .pv-art { display: flex; justify-content: center; }
  .pv-art svg { width: min(100%, 460px); }

  .pv-method-flow {
    display: flex; gap: 6px; flex-wrap: wrap; align-items: center;
  }
  .pv-step {
    background: var(--bg-cream);
    border: 1px solid var(--border-hair);
    border-radius: var(--radius-base);
    padding: 12px 14px; flex: 1; min-width: 130px;
    display: flex; flex-direction: column; gap: 4px;
  }
  .pv-step-num {
    width: 22px; height: 22px; border-radius: 50%;
    background: var(--green-500); color: white;
    display: grid; place-items: center;
    font-family: var(--font-mono); font-size: 11px;
  }
  .pv-step-verb { font-weight: 600; font-size: 14px; color: var(--fg-1); }
  .pv-step-detail { font-size: 11px; color: var(--fg-2); line-height: 1.4; }
  .pv-step-arrow { color: var(--fg-3); font-size: 14px; }

  .pv-big-num {
    font-family: var(--font-display);
    font-size: clamp(48px, 7vw, 88px); line-height: 1;
    color: var(--green-700); letter-spacing: -0.04em;
  }
  .pv-story { color: var(--fg-2); line-height: 1.55; max-width: 60ch; }

  .pv-section-cta { background: linear-gradient(135deg, var(--success-tint) 0%, var(--bg-surface) 100%); }
  .pv-btn {
    align-self: flex-start;
    display: inline-flex; gap: 8px; align-items: center;
    background: var(--green-500); color: white;
    padding: 12px 22px; border-radius: var(--radius-pill);
    text-decoration: none; font-weight: 500;
    box-shadow: var(--shadow-sm);
  }

  .pv-swipe-deck { display: flex; gap: 10px; flex-wrap: wrap; }
  .pv-swipe-card {
    background: var(--bg-cream);
    border-radius: var(--radius-xl);
    padding: 16px;
    flex: 1; min-width: 180px;
    display: flex; flex-direction: column; gap: 6px;
  }
  .pv-swipe-q { font-family: var(--font-mono); font-size: 10px; color: var(--fg-3); text-transform: uppercase; letter-spacing: 0.04em; }
  .pv-swipe-scenario { font-size: 13px; color: var(--fg-1); line-height: 1.4; flex: 1; }
  .pv-swipe-answer {
    align-self: flex-start;
    padding: 3px 10px; border-radius: var(--radius-pill);
    font-family: var(--font-mono); font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .pv-swipe-yes { background: var(--success-soft); color: var(--green-800); }
  .pv-swipe-no  { background: var(--danger-soft);  color: var(--danger-ink); }
  .pv-swipe-explain { font-size: 11px; color: var(--fg-3); line-height: 1.4; font-style: italic; }

  .pv-foot { text-align: center; padding: 24px 0; color: var(--fg-3); }

  @media (max-width: 720px) {
    .preview-shell { padding: 16px 20px; }
    .pv-section { padding: 24px 22px; }
    .pv-grid-4, .pv-grid-3 { grid-template-columns: 1fr 1fr; }
  }
`;
