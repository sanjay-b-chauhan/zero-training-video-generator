// Browser-side ElevenLabs pipeline. Calls /with-timestamps to get
// character-level alignment, returns the raw bytes + alignment so
// the caller can upload to Supabase Storage and reference the URL.

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

export async function listVoices(apiKey) {
  const res = await fetch(`${ELEVENLABS_BASE}/voices`, {
    headers: { 'xi-api-key': apiKey },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs voices: ${res.status} ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.voices || []).map(v => ({
    voice_id: v.voice_id,
    name: v.name,
    category: v.category,
    description: v.description || v.labels?.description || '',
    accent: v.labels?.accent || '',
    age: v.labels?.age || '',
    gender: v.labels?.gender || '',
    use_case: v.labels?.use_case || '',
    preview_url: v.preview_url || null,
  }));
}

/**
 * Generate audio + alignment for a narration string.
 *
 * @returns {Promise<{
 *   mp3Bytes: Uint8Array,
 *   alignment: { characters, character_start_times_seconds, character_end_times_seconds },
 *   durationSec: number
 * }>}
 */
export async function generateNarration(opts) {
  const {
    apiKey, voiceId, text,
    stability = 0.78, style = 0.10, similarity = 0.82, speed = 1.0,
    // v3 is the model that interprets bracketed cues like [laugh], [pause],
    // [emphasize] as real voice direction. v2 reads them as literal text.
    modelId = 'eleven_v3',
    signal,
  } = opts;

  const url = `${ELEVENLABS_BASE}/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`;
  const body = {
    text,
    model_id: modelId,
    voice_settings: {
      stability,
      similarity_boost: similarity,
      style,
      use_speaker_boost: true,
      speed,
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs TTS: ${res.status} ${err.slice(0, 300)}`);
  }
  const data = await res.json();

  // Decode base64 MP3 → Uint8Array
  const mp3Bytes = base64ToUint8(data.audio_base64);

  const alignment = data.alignment || data.normalized_alignment;
  if (!alignment || !alignment.characters) {
    throw new Error('ElevenLabs response did not include alignment data');
  }
  const slim = {
    characters: alignment.characters,
    character_start_times_seconds: alignment.character_start_times_seconds,
    character_end_times_seconds: alignment.character_end_times_seconds,
  };

  const lastEnd = slim.character_end_times_seconds[slim.character_end_times_seconds.length - 1] || 0;

  return { mp3Bytes, alignment: slim, durationSec: +lastEnd.toFixed(3) };
}

function base64ToUint8(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
