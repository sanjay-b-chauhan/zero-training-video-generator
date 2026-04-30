// Browser-local settings store. Holds AI keys + Supabase config.
// Everything in localStorage — never sent to any server unless the user
// triggers a generation that calls the AI provider directly.

const NS = 'zero_vg_';
const K = {
  anthropic: NS + 'key_anthropic',
  openai:    NS + 'key_openai',
  google:    NS + 'key_google',
  ollama:    NS + 'key_ollama',     // Ollama Cloud / Turbo
  elevenlabs: NS + 'key_elevenlabs',
  sb_url:    NS + 'sb_url',
  sb_key:    NS + 'sb_key',
};

// Defaults baked at deploy time. The Supabase URL + publishable key are
// safe to ship in client code by design (they're protected by RLS, not
// secrecy). AI provider keys are NEVER defaulted here — those always
// come from the user.
const DEFAULTS = {
  sb_url: 'https://qjvozmuckovvebifrfvk.supabase.co',
  sb_key: 'sb_publishable_MOt084MOzzboFsf0hVFh9A_RJS1ayy7',
};

export function getKey(provider) {
  return localStorage.getItem(K[provider]) || '';
}
export function setKey(provider, value) {
  if (value) localStorage.setItem(K[provider], value);
  else localStorage.removeItem(K[provider]);
}
export function hasKey(provider) {
  return !!getKey(provider);
}

export function getSupabase() {
  return {
    url: localStorage.getItem(K.sb_url) || DEFAULTS.sb_url || '',
    anonKey: localStorage.getItem(K.sb_key) || DEFAULTS.sb_key || '',
  };
}
export function setSupabase({ url, anonKey }) {
  if (url) localStorage.setItem(K.sb_url, url); else localStorage.removeItem(K.sb_url);
  if (anonKey) localStorage.setItem(K.sb_key, anonKey); else localStorage.removeItem(K.sb_key);
}
export function hasSupabase() {
  const cfg = getSupabase();
  return !!(cfg.url && cfg.anonKey);
}

export function maskKey(value) {
  if (!value) return '';
  if (value.length <= 8) return '••••';
  return value.slice(0, 4) + '••••' + value.slice(-4);
}

export function providersAvailable() {
  return {
    anthropic: hasKey('anthropic'),
    openai:    hasKey('openai'),
    google:    hasKey('google'),
    ollama:    hasKey('ollama'),
    elevenlabs: hasKey('elevenlabs'),
  };
}
