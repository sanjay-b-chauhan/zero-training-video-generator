// Browser-side script generator. Same 10-beat schema as the local Node
// version, but all three providers are called directly from the browser
// using fetch + the appropriate auth header. Keys come from localStorage.

import { SCRIPT_SYSTEM_PROMPT } from './systemPrompt.js';

function buildUserMessage({
  concept, focus, audience_level, tone, duration_target, tool_url,
  refine_notes, previous_script, current_screenplay_text,
}) {
  const parts = [
    `CONCEPT: ${concept}`,
    focus ? `FOCUS / AUDIENCE: ${focus}` : null,
    audience_level ? `AUDIENCE LEVEL: ${audience_level}` : null,
    tone ? `TONE: ${tone}` : null,
    duration_target ? `TARGET DURATION: ~${duration_target} seconds of narration` : null,
    tool_url ? `CTA URL: ${tool_url}` : null,
  ].filter(Boolean);

  const isRefine = !!(current_screenplay_text || previous_script);

  // 1. ALWAYS include refine_notes / framework directive if present —
  //    even on a first generation. This is how the user's "Script
  //    Framework" input gets to the AI: app.js wraps it in a directive
  //    block and passes it through refine_notes regardless of mode.
  if (refine_notes) {
    parts.push('', refine_notes);
  }

  // 2. Refine mode adds the previous script + edited screenplay so the
  //    AI can do a faithful revision instead of a re-roll.
  if (isRefine) {
    parts.push('', '--- REFINE MODE ---');
    if (current_screenplay_text) {
      parts.push(
        '',
        'The founder has been editing this screenplay directly. Treat their edits as authoritative — preserve the spirit of their words (specific examples, names, jokes), but rewrite anything that drifts from the WGLL voice: robotic phrasing, missing v3 cues, numbers as numerals, em-dashes, generic openings, "let\'s dive in", etc.',
        '',
        '```',
        current_screenplay_text,
        '```',
      );
    }
    if (previous_script) {
      parts.push(
        '',
        'Reference structure of the previous version (for the schema, not the words):',
        '```json',
        JSON.stringify(previous_script, null, 2),
        '```',
      );
    }
    parts.push(
      '',
      'Return the FULL revised JSON object — same schema, all 10 beats. Narration must be WGLL-quality. No diff, no partial.',
    );
  } else {
    parts.push('', 'Produce the JSON now. Output ONLY the JSON object. If a framework was provided above, populate custom_scene_labels in the JSON to reflect it.');
  }
  return parts.join('\n');
}

// Robust JSON extraction. Models — Gemini especially — occasionally trail
// extra prose after the JSON ("Note: I've populated...") or wrap the JSON
// in a fence we missed. We:
//   1. Strip code fences if present.
//   2. Try a straight JSON.parse.
//   3. If that fails, walk braces tracking strings + escapes to find the
//      FIRST complete { ... } block from the first '{'. Slice that.
//   4. Parse the slice; if even that fails, surface a useful error.
//
// The lastIndexOf('}') trick we used before was greedy and broke when the
// model emitted JSON-then-prose-then-stray-brace.
function safeParseJSON(text) {
  const cleaned = text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const start = cleaned.indexOf('{');
    if (start < 0) throw new Error(`Model returned no JSON object: ${e.message}`);
    let depth = 0;
    let inStr = false;
    let escape = false;
    for (let i = start; i < cleaned.length; i++) {
      const c = cleaned[i];
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          const slice = cleaned.slice(start, i + 1);
          try { return JSON.parse(slice); }
          catch (e2) {
            throw new Error(`Model returned malformed JSON: ${e2.message}`);
          }
        }
      }
    }
    throw new Error(`Model did not close its JSON object (truncated?): ${e.message}`);
  }
}

// --- providers --------------------------------------------------------

async function callAnthropic({ apiKey, model, userMessage, signal }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-5-20250929',
      max_tokens: 8000,
      system: SCRIPT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
    signal,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API: ${res.status} ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  return safeParseJSON(text);
}

async function callOpenAI({ apiKey, model, userMessage, signal }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SCRIPT_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    }),
    signal,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API: ${res.status} ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';
  return safeParseJSON(text);
}

async function callGoogle({ apiKey, model, userMessage, signal }) {
  const m = model || 'gemini-flash-latest';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SCRIPT_SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
    }),
    signal,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google API: ${res.status} ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text).join('') || '';
  return safeParseJSON(text);
}

// Ollama Cloud / Ollama Turbo — Ollama's hosted runtime, OpenAI-compatible
// endpoint. Hosts Kimi K2, GPT-OSS, Qwen, DeepSeek. Bearer auth.
//
// CORS NOTE: ollama.com does NOT send the headers a browser needs for
// direct fetch — the request fails before it even leaves your browser
// ("Failed to fetch"). To unblock that, the local dev server (server.js)
// runs a same-origin proxy at /api/proxy/ollama/* that forwards to the
// real ollama.com. When we detect we're on localhost AND a proxy path
// is reachable, we go through the proxy. When deployed to GitHub Pages
// or any static host without a proxy, the direct call is attempted —
// the user will get a clearer error in that case.
async function callOllama({ apiKey, model, userMessage, signal }) {
  const base = pickOllamaBase();
  const isProxied = base.includes('/api/proxy/ollama');

  // If we're not running through the local proxy (i.e. the dashboard is
  // deployed on GitHub Pages or another static host), tell the user
  // upfront — direct browser fetch to ollama.com fails with CORS, and
  // the error surfaces as an opaque "Failed to fetch."
  if (!isProxied) {
    throw new Error(
      'Kimi via Ollama Cloud needs the local Node proxy and won\'t work on GitHub Pages. ' +
      'Run the dashboard locally (./run.command on Mac, run.bat on Windows) for Kimi. ' +
      'On the hosted version, switch to Claude or Gemini.'
    );
  }

  let res;
  try {
    res = await fetch(base + '/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'kimi-k2:1t-cloud',
        response_format: { type: 'json_object' },
        temperature: 0.7,
        messages: [
          { role: 'system', content: SCRIPT_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
      }),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error(
      `Couldn't reach the Ollama proxy at ${base}. ` +
      'Make sure the local server is running (./run.command or run.bat).'
    );
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama Cloud API: ${res.status} ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';
  return safeParseJSON(text);
}

// Decide whether to route through the local proxy or hit ollama.com
// directly. We prefer the proxy when we're on localhost (the dev server
// at localhost:8000 / 127.0.0.1 / file:// dev modes), and fall back to
// the public URL otherwise. The proxy lives at /api/proxy/ollama on the
// same origin as the dashboard.
function pickOllamaBase() {
  try {
    const host = (typeof location !== 'undefined' && location.hostname) || '';
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local');
    if (isLocal && location.protocol.startsWith('http')) {
      return `${location.origin}/api/proxy/ollama`;
    }
  } catch {}
  return 'https://ollama.com';
}

// --- public ----------------------------------------------------------

export async function generateScript(opts) {
  const userMessage = buildUserMessage(opts);
  const args = { apiKey: opts.apiKey, model: opts.model, userMessage, signal: opts.signal };
  switch (opts.provider) {
    case 'anthropic': return await callAnthropic(args);
    case 'openai':    return await callOpenAI(args);
    case 'google':    return await callGoogle(args);
    case 'ollama':    return await callOllama(args);
    default: throw new Error(`Unknown provider: ${opts.provider}`);
  }
}

export function flattenNarration(script, { breakBetweenBeats = '<break time="0.6s" />' } = {}) {
  // New-shape: iterate scenes[]. Old-shape: legacy adapter handles it
  // upstream (callers should normalize first), but we keep a fallback
  // here so flattenNarration is forgiving.
  if (Array.isArray(script?.scenes)) {
    return script.scenes
      .map(s => (s?.narration || '').trim())
      .filter(Boolean)
      .join(` ${breakBetweenBeats} `);
  }
  const legacy = ['hook', 'promise', 'definition', 'anatomy', 'cousins', 'analogy', 'method', 'example', 'recap', 'cta'];
  return legacy
    .map(k => script?.[k]?.narration?.trim() || '')
    .filter(Boolean)
    .join(` ${breakBetweenBeats} `);
}

// Catalogs surfaced by the dashboard:

export const MODEL_CATALOG = {
  anthropic: [
    { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
    { id: 'claude-opus-4-5-20250929',   label: 'Claude Opus 4.5' },
    { id: 'claude-haiku-4-5-20251001',  label: 'Claude Haiku 4.5' },
  ],
  openai: [
    { id: 'gpt-4o',                     label: 'GPT-4o' },
    { id: 'gpt-4o-mini',                label: 'GPT-4o mini' },
    { id: 'gpt-4.1',                    label: 'GPT-4.1' },
  ],
  google: [
    { id: 'gemini-flash-latest',        label: 'Gemini Flash (latest)' },
    { id: 'gemini-2.5-pro',             label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash',           label: 'Gemini 2.5 Flash' },
  ],
  ollama: [
    { id: 'kimi-k2:1t-cloud',           label: 'Kimi K2 (cloud · 1T)' },
    { id: 'gpt-oss:120b-cloud',         label: 'GPT-OSS 120B' },
    { id: 'qwen3-coder:480b-cloud',     label: 'Qwen3 Coder 480B' },
    { id: 'deepseek-v3.1:671b-cloud',   label: 'DeepSeek V3.1 671B' },
  ],
};
