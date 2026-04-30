// Screenplay format helpers — driven by the new scenes[] shape.
//
// We render the script as a film/TV screenplay so the founder can read
// the narration the way an actor would. Each scene becomes one block:
//
//   SCENE 01 — MENTOR INTRODUCTION                     0:00 — 0:11
//   *open, curious. Pull the listener in.*
//
//   AVERY (V.O.)
//     Hey hey [laugh], how's it goin'…
//
//   ON SCREEN
//     [chapter card · "CHAPTER 01" · headline]
//
// The structure (number/order/labels of scenes) comes entirely from the
// script's `scenes[]` array. There is no fixed beat order anymore.
// `kind` decides the ON SCREEN visual annotation.

import { normalizeScript } from './scriptShape.js';

// Per-kind directorial hint shown in italics under the SCENE header.
const KIND_HINT = {
  'title':      'open, curious. Pull the listener in.',
  'bullets':    'confident. Stake what they will know.',
  'cards':      'measured. Each card gets one beat of focus.',
  'keywords':   'plain, deliberate. Land the keyword each time.',
  'steps':      'rhythmic. Each verb gets a clean beat.',
  'comparison': 'quick. Set up two contrasts then land the third.',
  'analogy':    'warm. Lean into the everyday image.',
  'number-pop': 'reverent on the company name. Land the number.',
  'quote':      'still. Let the words breathe.',
  'recap':      'crisp. Three beats, no extras.',
  'cta':        'direct. Hand off the action.',
};

/**
 * Build screenplay text from a structured script JSON.
 * Accepts both new (scenes[]) and legacy (10-beat) shapes — legacy is
 * adapted via normalizeScript first.
 */
export function toScreenplay(rawScript) {
  if (!rawScript) return '';
  const script = normalizeScript(rawScript);
  const scenes = script.scenes || [];

  const lines = [];
  lines.push(`# ${script.concept || 'Untitled Concept'}`);
  if (script.audience) lines.push(`## ${script.audience}`);
  if (script.estimated_duration_seconds) lines.push(`## ~${script.estimated_duration_seconds}s narration`);
  lines.push('');

  let runningSec = 0;

  scenes.forEach((scene, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    const beatSec = scene.duration_seconds || estimateBeatSec(scene.narration);
    const t1 = formatClock(runningSec);
    const t2 = formatClock(runningSec + beatSec);

    const upper = String(scene.label || `SCENE ${num}`).toUpperCase();
    lines.push(`SCENE ${num} — ${upper}                              ${t1}–${t2}`);
    const hint = KIND_HINT[scene.kind] || '';
    if (hint) lines.push(`*${hint}*`);
    lines.push('');

    if (scene.narration) {
      lines.push('AVERY (V.O.)');
      lines.push('  ' + softWrap(scene.narration, 70).replaceAll('\n', '\n  '));
      lines.push('');
    }

    const visualNote = visualNoteFor(scene);
    if (visualNote) {
      lines.push('ON SCREEN');
      lines.push('  ' + visualNote);
      lines.push('');
    }
    runningSec += beatSec;
  });

  if (script.interactions?.length) {
    lines.push('--- INTERACTION CHECKPOINTS ---');
    script.interactions.forEach((q, i) => {
      lines.push(`(${i + 1}) After ${q.anchor_scene_label || q.anchor_section || ''}: "${q.question}"`);
      const correct = (q.options || []).find(o => o.correct);
      if (correct) lines.push(`     correct → ${correct.label}`);
    });
    lines.push('');
  }
  if (script.swipe?.length) {
    lines.push('--- SWIPE STACK (proof of understanding) ---');
    script.swipe.forEach((c, i) => {
      lines.push(`(${i + 1}) [${(c.answer || '').toUpperCase()}] ${c.scenario}`);
    });
  }
  return lines.join('\n');
}

// Visual annotation per scene kind — same data the video renderer uses
// to draw, summarized as a one-liner for the screenplay.
function visualNoteFor(scene) {
  const c = scene.content || {};
  switch (scene.kind) {
    case 'title':
      return `[chapter card · "${c.kicker || 'Chapter'}" · ${esc(c.headline || '')}]`;
    case 'bullets':
      return `[${(c.bullets || []).length} bullets reveal one by one]`;
    case 'cards':
      return `[${(c.items || []).length} cards: ${(c.items || []).map(i => i.name).filter(Boolean).join(' · ')}]`;
    case 'keywords':
      return `[keyword chips: ${(c.keywords || []).map(k => k.term).filter(Boolean).join(' · ')}]`;
    case 'steps':
      return `[${(c.steps || []).length} circles connected by arrows: ${(c.steps || []).map(s => s.verb).filter(Boolean).join(' → ')}${c.loops_back ? ' ↻' : ''}]`;
    case 'comparison': {
      const target = c.target || '';
      return `[${(c.items || []).length} cards${target ? `, "${target}" gets the hero reveal` : ''}]`;
    }
    case 'analogy':
      return `[hand-drawn motion sketch · ${c.image_hint || c.headline || ''}]`;
    case 'number-pop':
      return `[big number "${c.number || '—'}" pops${c.company ? ` from ${c.company} story` : ''}]`;
    case 'quote':
      return `[pull quote · ${c.attribution ? `attributed to ${c.attribution}` : 'no attribution'}]`;
    case 'recap':
      return `[${(c.cards || []).length} takeaway cards stagger in]`;
    case 'cta':
      return `[CTA button reveal · "${c.button_label || 'Continue'}"]`;
    default:
      return '';
  }
}

function estimateBeatSec(narration) {
  if (!narration) return 5;
  const words = narration.replace(/\[[^\]]+\]/g, '').split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.round(words / 2.6));
}

function formatClock(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function esc(s) { return String(s ?? '').replace(/[\[\]]/g, ''); }

function softWrap(text, max) {
  const words = text.split(/\s+/);
  const out = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > max) {
      out.push(line.trim());
      line = w;
    } else {
      line += ' ' + w;
    }
  }
  if (line.trim()) out.push(line.trim());
  return out.join('\n');
}

/**
 * Detect which scene kinds the script covers. Used for any UI that wants
 * to show "this script has: title, cards, steps…" chips.
 */
export function detectBeats(scriptOrText) {
  if (!scriptOrText) return [];
  if (typeof scriptOrText === 'string') return [];
  const script = normalizeScript(scriptOrText);
  const seen = new Set();
  for (const s of script.scenes || []) {
    if (s.kind) seen.add(s.kind);
  }
  return [...seen].map(kind => ({ key: kind, label: kind.toUpperCase() }));
}

export function beatChipDefinitions() {
  return [
    { key: 'title',      num: '01', name: 'TITLE' },
    { key: 'bullets',    num: '02', name: 'BULLETS' },
    { key: 'cards',      num: '03', name: 'CARDS' },
    { key: 'keywords',   num: '04', name: 'KEYWORDS' },
    { key: 'steps',      num: '05', name: 'STEPS' },
    { key: 'comparison', num: '06', name: 'COMPARISON' },
    { key: 'analogy',    num: '07', name: 'ANALOGY' },
    { key: 'number-pop', num: '08', name: 'NUMBER' },
    { key: 'quote',      num: '09', name: 'QUOTE' },
    { key: 'recap',      num: '10', name: 'RECAP' },
    { key: 'cta',        num: '11', name: 'CTA' },
  ];
}
