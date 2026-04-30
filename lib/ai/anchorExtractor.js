// Anchor extractor — finds the EXACT second each narration beat begins
// and each internal reveal anchor fires, by walking the alignment data
// returned from ElevenLabs.

const TEXT_NORM = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

function buildText(alignment) {
  return alignment.characters.join('');
}

function findProbe(text, alignment, probe, cursor) {
  const exactIdx = text.indexOf(probe, cursor);
  if (exactIdx >= 0) return { startCharIndex: exactIdx };

  const normText = TEXT_NORM(text.slice(cursor));
  const normProbe = TEXT_NORM(probe);
  const localIdx = normText.indexOf(normProbe);
  if (localIdx < 0) return null;

  // Map normalized index back to raw text index
  let i = cursor;
  let n = 0;
  while (i < text.length && n < localIdx) {
    const ch = text[i];
    const isWs = /\s/.test(ch);
    if (isWs && n > 0 && /\s/.test(text[i - 1] ?? '')) { i++; continue; }
    n++; i++;
  }
  return { startCharIndex: i };
}

export function extractAnchors({ alignment, probes, leadinSec = 0 }) {
  const text = buildText(alignment);
  const A = {};
  let cursor = 0;
  const missing = [];

  for (const { name, probe } of probes) {
    const hit = findProbe(text, alignment, probe, cursor);
    if (!hit) { missing.push({ name, probe }); continue; }
    const t = alignment.character_start_times_seconds[hit.startCharIndex] ?? 0;
    A[name] = +(t + leadinSec).toFixed(3);
    cursor = hit.startCharIndex + probe.length;
  }

  const lastEnd = alignment.character_start_times_seconds[alignment.character_start_times_seconds.length - 1] || 0;
  const total = +(lastEnd + leadinSec).toFixed(3);
  return { A, total, missing };
}

// Build sections from extracted anchors. The new shape walks the
// scenes[] array and uses each scene's _id-style anchor name (built by
// buildProbeList) to produce a section list with [start, end] offsets
// the video assembler can pin GSAP sub-timelines to.
export function buildSections(script, A, total) {
  const scenes = Array.isArray(script?.scenes) ? script.scenes : [];
  const out = [];
  for (let i = 0; i < scenes.length; i++) {
    const id = sceneAnchorId(i, scenes[i]);
    const start = A[`${id}_open`];
    if (start == null) continue;
    out.push({ id, label: scenes[i].label || `Scene ${i + 1}`, kind: scenes[i].kind, start, end: 0, sceneIndex: i });
  }
  for (let i = 0; i < out.length; i++) {
    out[i].end = i + 1 < out.length ? out[i + 1].start : total;
  }
  return out;
}

// Build the probe list the audio aligner walks. For each scene we probe
// the first chunk of its narration (before the first v3 cue) so the
// extractor can find where the scene starts in the audio. We additionally
// probe inner items where applicable so the renderer can stagger reveals
// to match what Avery is saying.
export function buildProbeList(script) {
  const probes = [];
  const scenes = Array.isArray(script?.scenes) ? script.scenes : [];

  scenes.forEach((scene, idx) => {
    const id = sceneAnchorId(idx, scene);
    if (scene.narration) {
      // Strip leading v3 cues so the probe matches actual spoken text.
      const stripped = scene.narration.trim().replace(/^(\[[^\]]+\]\s*)+/, '').trim();
      const head = stripped.slice(0, 24);
      const wb = head.lastIndexOf(' ');
      const probe = (wb > 6 ? head.slice(0, wb) : head).trim();
      if (probe) probes.push({ name: `${id}_open`, probe });
    }
    // Per-kind inner probes so reveals can sync to phrasing.
    const c = scene.content || {};
    switch (scene.kind) {
      case 'cards':
        (c.items || []).forEach((it, i) => {
          if (it?.name) probes.push({ name: `${id}_card_${i + 1}`, probe: it.name });
        });
        break;
      case 'comparison':
        (c.items || []).forEach((it, i) => {
          if (it?.name) probes.push({ name: `${id}_cmp_${i + 1}`, probe: it.name });
        });
        break;
      case 'steps':
        (c.steps || []).forEach((s, i) => {
          if (s?.verb) probes.push({ name: `${id}_step_${i + 1}`, probe: s.verb });
        });
        break;
      case 'recap':
        (c.cards || []).forEach((card, i) => {
          const words = String(card || '').split(/\s+/).slice(0, 3).join(' ');
          if (words) probes.push({ name: `${id}_card_${i + 1}`, probe: words });
        });
        break;
      case 'number-pop':
        if (c.company) probes.push({ name: `${id}_co`, probe: c.company });
        if (c.number)  probes.push({ name: `${id}_num`, probe: c.number });
        break;
    }
  });
  return probes;
}

// Stable per-scene anchor id. Index-based because scene labels can repeat
// or contain non-ascii. Stays valid even across regenerations as long as
// scene ordering doesn't change.
export function sceneAnchorId(idx, scene) {
  const slug = (scene?.label || `s${idx + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);
  return `s${String(idx + 1).padStart(2, '0')}_${slug || 'scene'}`;
}
