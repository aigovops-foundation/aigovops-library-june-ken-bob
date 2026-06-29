#!/usr/bin/env node
// build-subtitles — generate English subtitles (SRT + WebVTT) for the onboarding tour
// from the narration manifest (docs/audio/onboarding/script.json). One cue per sentence,
// sequential timing. Timing is ESTIMATED from word count here (no audio needed); the
// video runbook (build-video.mjs) re-derives EXACT cue timing from the real MP3 durations.
//
//   node scripts/runbooks/build-subtitles.mjs
//
// Writes docs/audio/onboarding/onboarding.en.srt and onboarding.en.vtt.

import { readFileSync, writeFileSync } from 'node:fs';

const DIR = 'docs/audio/onboarding';
const WPS = 2.6;        // spoken words per second (matches the player's fallback pacing)
const GAP = 0.25;       // seconds between cues
const manifest = JSON.parse(readFileSync(`${DIR}/script.json`, 'utf8'));

const sentences = (t) => (String(t).match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [t]).map((s) => s.trim()).filter(Boolean);
const dur = (s) => Math.max(1.6, s.split(/\s+/).length / WPS);
const ts = (sec, sep) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60),
    ms = Math.round((sec - Math.floor(sec)) * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(ms, 3)}`;
};

const cues = [];
let t = 0;
for (const sc of manifest) {
  for (const sent of sentences(sc.vo)) {
    const d = dur(sent);
    cues.push({ start: t, end: t + d, text: sent });
    t += d + GAP;
  }
}

const srt = cues.map((c, i) =>
  `${i + 1}\n${ts(c.start, ',')} --> ${ts(c.end, ',')}\n${c.text}\n`).join('\n');
const vtt = 'WEBVTT\n\n' + cues.map((c) =>
  `${ts(c.start, '.')} --> ${ts(c.end, '.')}\n${c.text}\n`).join('\n');

writeFileSync(`${DIR}/onboarding.en.srt`, srt);
writeFileSync(`${DIR}/onboarding.en.vtt`, vtt);
console.log(`subtitles: ${cues.length} cues, ~${Math.round(t / 60)} min (estimated) — wrote onboarding.en.srt + .vtt`);
