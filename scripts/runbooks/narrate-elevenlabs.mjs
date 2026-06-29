#!/usr/bin/env node
// narrate-elevenlabs — generate studio voice-over for the onboarding tutorial with
// ElevenLabs. The API key is resolved through the governed 1Password broker (never a
// literal, never pasted): op://AiGovOps/elevenlabs-api-key/credential — or, for a
// throwaway run, the ELEVENLABS_API_KEY env var.
//
//   node scripts/runbooks/narrate-elevenlabs.mjs voices         # list your voices to pick one
//   ELEVEN_VOICE_ID=xxxx node scripts/runbooks/narrate-elevenlabs.mjs        # generate all scenes
//   ELEVEN_VOICE_ID=xxxx node scripts/runbooks/narrate-elevenlabs.mjs --scene 21 --force
//   node scripts/runbooks/narrate-elevenlabs.mjs --dry          # show plan, no API calls
//
// Reads docs/audio/onboarding/script.json (the narration manifest, generated from the
// onboarding scenes) and writes docs/audio/onboarding/scene-NN.mp3 — which the player
// plays automatically, falling back to the browser voice for any file that isn't there.
//
// Voice brief for this project: female, East-Asian, soft/high, neutral (no strong accent),
// globally appropriate — matching the Beacon mark. Model eleven_multilingual_v2 keeps the
// delivery accent-neutral. Pick the matching voice_id with the `voices` command.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const API = 'https://api.elevenlabs.io/v1';
const OUT = 'docs/audio/onboarding';
const MANIFEST = `${OUT}/script.json`;
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const argVal = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

function key() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  // Item is titled "elevenlabs" in the AiGovOps vault; fall back to the older name.
  for (const ref of ['op://AiGovOps/elevenlabs/credential', 'op://AiGovOps/elevenlabs-api-key/credential']) {
    try {
      const v = execFileSync('op', ['read', ref], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (v) return v;
    } catch { /* try next */ }
  }
  {
    console.error('No ElevenLabs key. Store it once:\n' +
      "  op item create --vault AiGovOps --category 'API Credential' --title elevenlabs-api-key 'credential[password]=<your-key>'\n" +
      'or export ELEVENLABS_API_KEY for a throwaway run. (Never paste the key as a shell arg in a shared transcript.)');
    process.exit(2);
  }
}

async function listVoices() {
  const r = await fetch(`${API}/voices`, { headers: { 'xi-api-key': key() } });
  if (!r.ok) { console.error('voices failed:', r.status, await r.text()); process.exit(1); }
  const { voices } = await r.json();
  console.log(`${voices.length} voices on this account:\n`);
  for (const v of voices) {
    const l = v.labels || {};
    const tag = [l.gender, l.accent, l.age, l.descriptive || l.description, l.use_case].filter(Boolean).join(' · ');
    console.log(`  ${v.voice_id}  ${(v.name || '').padEnd(18)}  ${tag}`);
  }
  console.log('\nPick the female / asian / soft one, then:');
  console.log('  ELEVEN_VOICE_ID=<id> node scripts/runbooks/narrate-elevenlabs.mjs');
}

async function tts(voiceId, text, model, settings) {
  const r = await fetch(`${API}/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key(), 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: model, voice_settings: settings }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return Buffer.from(await r.arrayBuffer());
}

async function generate() {
  const voiceId = process.env.ELEVEN_VOICE_ID;
  if (!voiceId && !has('--dry')) {
    console.error('Set ELEVEN_VOICE_ID (run `voices` to find it).'); process.exit(2);
  }
  const model = process.env.ELEVEN_MODEL || 'eleven_multilingual_v2';
  // soft, calm, neutral delivery
  const settings = { stability: 0.55, similarity_boost: 0.8, style: 0.0, use_speaker_boost: true };
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  const only = argVal('--scene') ? Number(argVal('--scene')) : null;
  const force = has('--force');
  let chars = 0, made = 0, skipped = 0;
  for (const s of manifest) {
    if (only && s.n !== only) continue;
    const path = `${OUT}/${s.file}`;
    if (existsSync(path) && !force) { skipped++; continue; }
    chars += s.vo.length;
    if (has('--dry')) { console.log(`would synth ${s.file} (${s.vo.length} chars) — ${s.title}`); continue; }
    process.stdout.write(`synth ${s.file} (${s.vo.length}c) ${s.title} … `);
    try {
      const buf = await tts(voiceId, s.vo, model, settings);
      writeFileSync(path, buf); made++;
      console.log(`ok (${(buf.length / 1024).toFixed(0)}kb)`);
    } catch (e) { console.log('FAIL'); console.error('  ', String(e).slice(0, 240)); process.exit(1); }
    await new Promise((r) => setTimeout(r, 350)); // gentle on rate limits
  }
  console.log(`\ndone — made ${made}, skipped ${skipped} existing, ~${chars} chars billed${has('--dry') ? ' (dry)' : ''}.`);
  console.log('Model:', model, '| settings:', JSON.stringify(settings));
}

if (has('voices') || has('--voices')) await listVoices();
else await generate();
