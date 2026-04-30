// Mock script template — outputs the new framework-driven scenes[] shape.
//
// The mock can't honor a custom framework (it's a fixed template), so it
// just demonstrates a sensible default arc using a mix of visual kinds.
// When the user wants to actually test framework-driven generation, they
// must use a real provider (Claude / Gemini / Kimi via Ollama).
//
// The mock is here so:
//   1. The UI flow can be tested end-to-end without API keys.
//   2. The voice + render pipeline has something to render.
//
// What it teaches: Root Cause Analysis. Variety of kinds: title, bullets,
// keywords, cards, comparison, analogy, steps, number-pop, recap, cta.

export const MOCK_SCRIPT_TEMPLATE = {
  concept: 'Root Cause Analysis',
  audience: 'Software engineering',
  tagline: 'Find the source, not the symptom.',
  tool_url: 'https://zero.app',
  estimated_duration_seconds: 130,

  scenes: [
    {
      label: 'Why this matters',
      kind: 'title',
      duration_seconds: 11,
      narration: "[curious] Why do most teams keep solving the same problem twice? [pause] I shipped a fix for the same crash three quarters in a row. Different team, different commit, same crash. [thoughtful] The fourth time, I finally asked the right question.",
      content: {
        kicker: 'CHAPTER 01',
        headline: 'Stop solving the same problem twice.',
        highlight_phrase: 'the same problem twice',
      },
    },
    {
      label: 'What you\'ll learn',
      kind: 'bullets',
      duration_seconds: 13,
      narration: "By the end of this, you'll spot the real cause in three questions. Skip the band-aid trap. Use the five whys without sounding like a robot. And lock the fix so it stays fixed.",
      content: {
        headline: 'By the end you can:',
        bullets: [
          'Spot the real cause in three questions',
          'Skip the band-aid trap',
          'Use the five whys without sounding like a robot',
          'Lock the fix so it stays fixed',
        ],
      },
    },
    {
      label: 'The three layers',
      kind: 'keywords',
      duration_seconds: 16,
      narration: "Root cause analysis is finding the source of a problem, not the symptom. [pause] Source is where it starts. Symptom is what you saw. Loop is why it keeps coming back.",
      content: {
        headline: 'Root cause analysis: source, not symptom.',
        keywords: [
          { term: 'Source',  unpack: 'Where the problem starts' },
          { term: 'Symptom', unpack: 'What the user noticed' },
          { term: 'Loop',    unpack: 'Why it keeps coming back' },
        ],
      },
    },
    {
      label: 'Anatomy of a problem',
      kind: 'cards',
      duration_seconds: 22,
      narration: "Three layers, in order. Symptom. Trigger. Cause. And the system that lets the cause stick around. The symptom is the crash. The trigger is the user action that lit the fuse. The cause is the broken parser. The system is the missing test that should have caught it.",
      content: {
        headline: 'Three layers, in order.',
        items: [
          { name: 'Symptom', blurb: 'What the user notices',      icon_hint: 'circle' },
          { name: 'Trigger', blurb: 'What sets it off this time', icon_hint: 'square' },
          { name: 'Cause',   blurb: 'The actual source',          icon_hint: 'triangle' },
          { name: 'System',  blurb: 'Why the cause persists',     icon_hint: 'hex' },
        ],
      },
    },
    {
      label: 'Don\'t confuse with',
      kind: 'comparison',
      duration_seconds: 16,
      narration: "Quick. Don't confuse this with debugging or a postmortem. [pause] Debugging fixes one occurrence. A postmortem writes it up. Only root cause analysis removes the source.",
      content: {
        headline: 'Three things people confuse this with.',
        target: 'Root cause',
        items: [
          { name: 'Debugging',  diff: 'Fixes one occurrence' },
          { name: 'Postmortem', diff: 'Documents an incident after the fact' },
          { name: 'Root cause', diff: 'Removes the source so it can\'t recur' },
        ],
      },
    },
    {
      label: 'Pulling the weed',
      kind: 'analogy',
      duration_seconds: 9,
      narration: "Think of it like pulling a weed. Snap the leaves and it grows back. Pull the root and it's gone.",
      content: {
        headline: "It's like pulling a weed by the root.",
        image_hint: 'plant with deep roots, soil cross-section',
      },
    },
    {
      label: 'How to apply it',
      kind: 'steps',
      duration_seconds: 18,
      narration: "Five steps. Observe. Capture. Ask five whys. Trace. Lock. [pause] Heads up. When you ask AI to trace the chain, it will hallucinate causes that look plausible. [emphasize] Always verify the trace against the actual logs or code. Never assume the AI is right.",
      content: {
        headline: 'Five steps. AI helps with three of them.',
        steps: [
          { verb: 'Observe', detail: 'See the symptom plainly' },
          { verb: 'Capture', detail: 'Write it down before memory fades' },
          { verb: 'Ask',     detail: 'Five whys, no shortcuts' },
          { verb: 'Trace',   detail: 'Follow the chain — verify against logs' },
          { verb: 'Lock',    detail: 'Fix the source, add a test' },
        ],
        loops_back: false,
      },
    },
    {
      label: 'Toyota did this',
      kind: 'number-pop',
      duration_seconds: 13,
      narration: "Real example. Toyota. [pause] Taiichi Ohno walked the line and asked five whys for every breakdown. [emphasize] Downtime fell forty percent in a quarter. Same ritual now runs incident reviews at Stripe and Netflix.",
      content: {
        company: 'Toyota',
        number: '40%',
        headline: 'Toyota cut machine downtime forty percent.',
        story: 'Taiichi Ohno walked the factory floor and asked five whys for every breakdown. Operators picked up the habit. Downtime fell forty percent in a quarter. The same ritual now runs incident reviews at Stripe and Netflix.',
      },
    },
    {
      label: 'Three takeaways',
      kind: 'recap',
      duration_seconds: 9,
      narration: "So. Symptom is not source. Five whys, no shortcuts. Fix the system, not the moment.",
      content: {
        cards: [
          'Symptom is not source',
          'Five whys, no shortcuts',
          'Fix the system, not the moment',
        ],
      },
    },
    {
      label: 'Your turn',
      kind: 'cta',
      duration_seconds: 4,
      narration: "Your turn. Pick a bug you fixed this week and ask five whys.",
      content: {
        headline: 'Your turn.',
        button_label: 'Try it on a real bug',
        url: 'https://zero.app',
      },
    },
  ],

  interactions: [
    {
      id: 'i1',
      anchor_scene_label: 'Anatomy of a problem',
      question: 'A null pointer crash from a corrupt config. Which layer?',
      options: [
        { label: 'Symptom', key: 'symptom', correct: true  },
        { label: 'Trigger', key: 'trigger', correct: false },
        { label: 'Cause',   key: 'cause',   correct: false },
      ],
      ok_line:  'Yes. The crash is what the user sees — that\'s the symptom.',
      bad_line: 'Close. The crash is what the user sees, so that\'s the symptom.',
    },
  ],

  swipe: [
    { scenario: 'Restarting the server fixes the crash for an hour.',      answer: 'no',  explain: 'Band-aid. Cause is still there.' },
    { scenario: 'Found the off-by-one in the parser, removed it.',         answer: 'yes', explain: 'Source removed. Chain broken.' },
    { scenario: 'Added more logging to the failing service.',              answer: 'no',  explain: 'Diagnostic, not a fix.' },
    { scenario: 'Replaced the flaky disk causing the I/O errors.',         answer: 'yes', explain: 'Hardware was the source. Removed.' },
  ],
};

export function generateMockScript({ concept, focus, tone, duration_target, tool_url } = {}) {
  const script = JSON.parse(JSON.stringify(MOCK_SCRIPT_TEMPLATE));
  if (concept) script.concept = concept;
  if (focus)   script.audience = focus;
  if (duration_target) script.estimated_duration_seconds = duration_target;
  if (tool_url) script.tool_url = tool_url;
  return script;
}

export const DEMO_SESSIONS = [];
