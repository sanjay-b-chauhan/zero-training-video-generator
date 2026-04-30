// Script shape utilities — handles the old (10-beat) and new (scenes[])
// formats with one normalize() entry point.
//
// The new format is the source of truth. The old format is mapped on
// read so legacy sessions in Supabase continue to render after the
// refactor without forcing a regen.
//
// We also expose a list of valid `kind`s so other modules can validate
// what the AI returned.

export const VISUAL_KINDS = [
  'title', 'bullets', 'cards', 'keywords', 'steps',
  'comparison', 'analogy', 'number-pop', 'quote', 'recap', 'cta',
];

// Quick predicate: is this a "new shape" script (has a scenes array)?
export function isScenesShape(script) {
  return !!script && Array.isArray(script.scenes);
}

// The 10 legacy beat keys, in the order they used to appear.
const LEGACY_BEATS = [
  'hook', 'promise', 'definition', 'anatomy', 'cousins',
  'analogy', 'method', 'example', 'recap', 'cta',
];

// Map each legacy beat key to the visual kind that best matches what the
// renderer used to draw for it.
const LEGACY_BEAT_KIND = {
  hook:       'title',
  promise:    'bullets',
  definition: 'keywords',
  anatomy:    'cards',
  cousins:    'comparison',
  analogy:    'analogy',
  method:     'steps',
  example:    'number-pop',
  recap:      'recap',
  cta:        'cta',
};

// Default labels (uppercase) for legacy beats. Honored only if the
// legacy script didn't have a `custom_scene_labels` map.
const LEGACY_BEAT_DEFAULT_LABEL = {
  hook: 'HOOK',          promise: 'PROMISE',
  definition: 'DEFINITION', anatomy: 'ANATOMY',
  cousins: 'COUSINS',    analogy: 'ANALOGY',
  method: 'METHOD',      example: 'EXAMPLE',
  recap: 'RECAP',        cta: 'CTA',
};

// Normalize any script to the new shape. Pure function — caller can mutate
// or pass to the renderer freely.
export function normalizeScript(script) {
  if (!script) return script;
  if (isScenesShape(script)) {
    // Already new shape. Just sanitize: ensure each scene has required
    // fields and a known kind.
    return {
      ...script,
      scenes: (script.scenes || [])
        .filter(s => s && typeof s === 'object')
        .map(s => ({
          label: String(s.label || '').trim() || 'Scene',
          kind: VISUAL_KINDS.includes(s.kind) ? s.kind : 'title',
          duration_seconds: Number(s.duration_seconds) || 10,
          narration: String(s.narration || '').trim(),
          content: s.content && typeof s.content === 'object' ? s.content : {},
        })),
    };
  }

  // Legacy 10-beat shape → adapt to scenes[]
  const customLabels = script.custom_scene_labels || {};
  const scenes = [];
  for (const key of LEGACY_BEATS) {
    const beat = script[key];
    if (!beat || typeof beat !== 'object') continue;
    const kind = LEGACY_BEAT_KIND[key] || 'title';
    const label = customLabels[key] || LEGACY_BEAT_DEFAULT_LABEL[key];
    const narration = beat.narration || '';
    const content = legacyBeatToContent(key, beat);
    scenes.push({
      label,
      kind,
      duration_seconds: estimateDurationFromNarration(narration),
      narration,
      content,
    });
  }
  return {
    concept:  script.concept || '',
    audience: script.audience || script.focus || '',
    tagline:  script.tagline || '',
    tool_url: script.tool_url || 'https://zero.app',
    estimated_duration_seconds: script.estimated_duration_seconds || scenes.reduce((a, s) => a + s.duration_seconds, 0),
    scenes,
    interactions: (script.interactions || []).map(it => ({
      id: it.id,
      anchor_scene_label: customLabels[it.anchor_section] || LEGACY_BEAT_DEFAULT_LABEL[it.anchor_section] || it.anchor_section,
      question: it.question,
      options: it.options || [],
      ok_line: it.ok_line, bad_line: it.bad_line,
    })),
    swipe: script.swipe || [],
  };
}

function legacyBeatToContent(key, beat) {
  switch (key) {
    case 'hook':
      return {
        kicker: beat.kicker || '',
        headline: beat.headline || '',
        highlight_phrase: beat.highlight_phrase || '',
      };
    case 'promise':
      return { headline: '', bullets: beat.bullets || [] };
    case 'definition':
      return { headline: beat.headline || '', keywords: beat.keywords || [] };
    case 'anatomy':
      return { headline: beat.intro_line || '', items: beat.items || [] };
    case 'cousins':
      return { headline: beat.intro_line || '', target: beat.target || '', items: beat.items || [] };
    case 'analogy':
      return { headline: beat.headline || '', image_hint: beat.image_hint || '' };
    case 'method':
      return {
        headline: beat.intro_line || '',
        steps: beat.steps || [],
        loops_back: !!beat.loops_back,
      };
    case 'example':
      return {
        company: beat.company || '',
        number: beat.number || '',
        headline: beat.headline || '',
        story: beat.story || '',
      };
    case 'recap':
      return { cards: beat.cards || [] };
    case 'cta':
      return {
        headline: beat.headline || '',
        button_label: beat.button_label || 'Continue',
        url: '',
      };
    default:
      return {};
  }
}

function estimateDurationFromNarration(narration) {
  if (!narration) return 5;
  const words = narration.replace(/\[[^\]]+\]/g, '').split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.round(words / 2.6));    // ~155 wpm
}
