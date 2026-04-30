// Session store. Two-tier:
//   - Supabase (cloud) if configured — everything syncs across devices
//   - localStorage (offline) otherwise — works fully without an account
//
// Both backends present the same API to the dashboard. The choice is made
// at call time based on hasSupabase().

import { hasSupabase } from './settings.js';
import * as sb from './supabase.js';

const LS_KEY = 'zero_vg_sessions_v1';

// Default row shape. New sessions inherit these.
function blank(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: cryptoRandomId(),
    parent_id: null,
    created_at: now,
    updated_at: now,
    concept: '',
    focus: null,
    audience_level: null,
    tone: null,
    duration_target: 130,
    tool_url: null,
    script_provider: null,
    script_model: null,
    voice_id: null,
    voice_stability: 0.78,
    voice_style: 0.10,
    voice_similarity: 0.82,
    voice_speed: 1.0,
    script_json: null,
    anchors_json: null,
    audio_url: null,
    video_url: null,
    status: 'draft',
    error: null,
    notes: null,
    favorite: false,
    ...overrides,
  };
}

// -------- localStorage backend --------

function lsLoadAll() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
  catch { return []; }
}
function lsSaveAll(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

// -------- public API (auto-routes) --------

export async function listSessions() {
  if (hasSupabase()) {
    try { return await sb.selectSessions(); }
    catch (e) { console.warn('Supabase list failed, falling back to local', e); }
  }
  return lsLoadAll();
}

export async function getSession(id) {
  if (hasSupabase()) {
    try { return await sb.selectSession(id); }
    catch (e) { console.warn('Supabase get failed, falling back to local', e); }
  }
  const all = lsLoadAll();
  return all.find(s => s.id === id) || null;
}

export async function createSession(overrides = {}) {
  const row = blank(overrides);
  if (hasSupabase()) {
    try { return await sb.insertSession(row); }
    catch (e) { console.warn('Supabase create failed, falling back to local', e); }
  }
  const all = lsLoadAll();
  all.unshift(row);
  lsSaveAll(all);
  return row;
}

export async function updateSession(id, patch) {
  const next = { ...patch, updated_at: new Date().toISOString() };
  if (hasSupabase()) {
    try {
      return await sb.updateSession(id, next);
    } catch (e) {
      const msg = String(e?.message || e);
      // PostgREST returns PGRST204 / 400 with "could not find the X column"
      // when a column is missing. Strip those and retry. The user is told
      // separately (via the setup banner) to run the migration.
      const m = msg.match(/column ['"]?([a-z_]+)['"]?/i)
              || msg.match(/Could not find the ['"]?([a-z_]+)['"]? column/i);
      if (m && m[1] && m[1] in next) {
        const stripped = { ...next };
        delete stripped[m[1]];
        try {
          console.warn(`Supabase: column "${m[1]}" missing; retrying update without it. Run the migration to fix.`);
          return await sb.updateSession(id, stripped);
        } catch (e2) {
          console.warn('Supabase update still failed; falling back to local.', e2);
        }
      } else {
        console.warn('Supabase update failed; falling back to local.', e);
      }
    }
  }
  // Local fallback: ensure row exists locally even if it only lives in cloud
  const all = lsLoadAll();
  const idx = all.findIndex(s => s.id === id);
  if (idx < 0) {
    // Pull the cloud copy if we have one, then patch it
    let row = null;
    if (hasSupabase()) {
      try { row = await sb.selectSession(id); } catch {}
    }
    if (!row) row = { id };
    row = { ...row, ...next };
    all.unshift(row);
    lsSaveAll(all);
    return row;
  }
  all[idx] = { ...all[idx], ...next };
  lsSaveAll(all);
  return all[idx];
}

export async function deleteSession(id) {
  if (hasSupabase()) {
    try { await sb.deleteSession(id); return; }
    catch (e) { console.warn('Supabase delete failed, falling back to local', e); }
  }
  const all = lsLoadAll().filter(s => s.id !== id);
  lsSaveAll(all);
}

// -------- helpers --------

export function cryptoRandomId() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}

// Convenience: parse JSON columns into objects on the way out, and run
// the script through the legacy → scenes[] adapter so any code consuming
// .script can assume the new shape.
import { normalizeScript } from './scriptShape.js';

export function hydrate(row) {
  if (!row) return row;
  const rawScript = row.script_json ? safeParse(row.script_json) : null;
  return {
    ...row,
    script: rawScript ? normalizeScript(rawScript) : null,
    anchors: row.anchors_json ? safeParse(row.anchors_json) : null,
  };
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }
