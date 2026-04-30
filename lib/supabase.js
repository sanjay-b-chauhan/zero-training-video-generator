// Thin wrapper around Supabase REST + Storage.
//
// We don't pull in @supabase/supabase-js to keep the bundle tiny — the
// dashboard only needs:
//   - INSERT / UPDATE / SELECT / DELETE on the `sessions` table
//   - upload + public-url for one bucket: `videos`
//
// All calls go through fetch with the anon key in the Authorization header.
// Row Level Security in the DB handles authorization (we ship a policy
// that allows anon read+write since this is a personal tool — see SETUP.sql).

import { getSupabase } from './settings.js';

function buildHeaders() {
  const cfg = getSupabase();
  if (!cfg.url || !cfg.anonKey) throw new Error('Supabase not configured');
  return {
    'apikey': cfg.anonKey,
    'authorization': `Bearer ${cfg.anonKey}`,
    'content-type': 'application/json',
    'prefer': 'return=representation',
  };
}

function url(path) {
  const cfg = getSupabase();
  return cfg.url.replace(/\/$/, '') + path;
}

// --- table CRUD -------------------------------------------------------

export async function selectSessions() {
  const res = await fetch(url('/rest/v1/sessions?select=*&order=created_at.desc&limit=200'), {
    headers: buildHeaders(),
  });
  if (!res.ok) throw new Error(await readErr(res, 'select sessions'));
  return await res.json();
}

export async function selectSession(id) {
  const res = await fetch(url(`/rest/v1/sessions?id=eq.${encodeURIComponent(id)}&select=*&limit=1`), {
    headers: buildHeaders(),
  });
  if (!res.ok) throw new Error(await readErr(res, 'select session'));
  const rows = await res.json();
  return rows[0] || null;
}

export async function insertSession(row) {
  const res = await fetch(url('/rest/v1/sessions'), {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(await readErr(res, 'insert session'));
  const rows = await res.json();
  return rows[0];
}

export async function updateSession(id, patch) {
  const res = await fetch(url(`/rest/v1/sessions?id=eq.${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: buildHeaders(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await readErr(res, 'update session'));
  const rows = await res.json();
  return rows[0];
}

export async function deleteSession(id) {
  const res = await fetch(url(`/rest/v1/sessions?id=eq.${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: buildHeaders(),
  });
  if (!res.ok) throw new Error(await readErr(res, 'delete session'));
}

// --- storage --------------------------------------------------------

const BUCKET = 'videos';

export async function uploadAudio(sessionId, mp3Bytes) {
  const cfg = getSupabase();
  const path = `${sessionId}/avery-${sessionId}.mp3`;
  // Wrap raw bytes in a typed Blob so fetch + Supabase Storage agree on
  // Content-Type. (Setting just the request header is not always enough —
  // string/bytes bodies sometimes get re-tagged as application/octet-stream.)
  const blob = new Blob([mp3Bytes], { type: 'audio/mpeg' });
  const res = await fetch(url(`/storage/v1/object/${BUCKET}/${path}`), {
    method: 'POST',
    headers: {
      'apikey': cfg.anonKey,
      'authorization': `Bearer ${cfg.anonKey}`,
      'cache-control': '3600',
      'x-upsert': 'true',
    },
    body: blob,
  });
  if (!res.ok) throw new Error(await readErr(res, 'upload audio'));
  return publicUrl(path);
}

export async function uploadHTML(sessionId, html) {
  const cfg = getSupabase();
  const path = `${sessionId}/ZERO-Concept-${sessionId}.html`;
  // Same Blob trick — without it, Supabase often stores HTML as text/plain
  // and the standalone URL renders raw source instead of the rendered page.
  const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
  const res = await fetch(url(`/storage/v1/object/${BUCKET}/${path}`), {
    method: 'POST',
    headers: {
      'apikey': cfg.anonKey,
      'authorization': `Bearer ${cfg.anonKey}`,
      'cache-control': '60',
      'x-upsert': 'true',
    },
    body: blob,
  });
  if (!res.ok) throw new Error(await readErr(res, 'upload html'));
  return publicUrl(path);
}

export function publicUrl(path) {
  return url(`/storage/v1/object/public/${BUCKET}/${path}`);
}

// --- health check (used by the Settings drawer's "Test connection") -

export async function testConnection() {
  // SELECT requesting all the columns the app needs — proves both the
  // table exists AND the schema is up-to-date with the expected fields.
  // If a column is missing, PostgREST returns PGRST204 with the column
  // name, which the dashboard uses to prompt the migration.
  const expected = [
    'id','concept','focus','outline','script_json','screenplay_text',
    'script_approved','voice_instructions','audio_url','video_url','status',
  ].join(',');
  const res = await fetch(url(`/rest/v1/sessions?select=${expected}&limit=1`), {
    headers: buildHeaders(),
  });
  if (!res.ok) {
    const txt = await res.text();
    return {
      ok: false,
      error: `${res.status} ${txt.slice(0, 200)}`,
    };
  }
  return { ok: true };
}

async function readErr(res, op) {
  let body = '';
  try { body = await res.text(); } catch {}
  return `Supabase ${op}: ${res.status} ${body.slice(0, 200)}`;
}
