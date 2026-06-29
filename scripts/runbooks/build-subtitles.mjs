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

// EXACT timing when the scene MP3 + ffprobe are present (cues match Bella's audio);
// otherwise estimate from word count. Either way, one cue per sentence.
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
let probe = null;
try { execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); probe = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', f], { encoding: 'utf8' }).trim()); } catch { /* estimate */ }

const cues = [];
let t = 0, exact = false;
for (const sc of manifest) {
  const ss = sentences(sc.vo);
  const mp3 = `${DIR}/${sc.file}`;
  const realD = (probe && existsSync(mp3)) ? probe(mp3) : null;
  if (realD != null) {
    exact = true;
    const wc = ss.map((s) => s.split(/\s+/).length), tot = wc.reduce((a, b) => a + b, 0) || 1;
    let st = t;
    ss.forEach((s, j) => { const cd = realD * (wc[j] / tot); cues.push({ start: st, end: st + cd, text: s }); st += cd; });
    t += realD;
  } else {
    for (const s of ss) { const d = dur(s); cues.push({ start: t, end: t + d, text: s }); t += d + GAP; }
  }
}

const srt = cues.map((c, i) =>
  `${i + 1}\n${ts(c.start, ',')} --> ${ts(c.end, ',')}\n${c.text}\n`).join('\n');
const vtt = 'WEBVTT\n\n' + cues.map((c) =>
  `${ts(c.start, '.')} --> ${ts(c.end, '.')}\n${c.text}\n`).join('\n');

writeFileSync(`${DIR}/onboarding.en.srt`, srt);
writeFileSync(`${DIR}/onboarding.en.vtt`, vtt);
console.log(`subtitles: ${cues.length} cues, ~${Math.round(t / 60)} min (${exact ? 'exact — from audio' : 'estimated'}) — wrote onboarding.en.srt + .vtt`);
