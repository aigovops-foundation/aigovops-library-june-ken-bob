#!/usr/bin/env node
// build-video — render the onboarding tour to one MP4. Per scene: a branded canvas with the
// Beacon persona FADING IN (the animated start) + that scene's Bella voice-over. Clips are
// concatenated and an English subtitle TRACK is muxed in (soft, mov_text — toggle it in any
// player). This ffmpeg build lacks libass, so subtitles are a selectable track, not burned
// in; with a libass-enabled ffmpeg this runbook could burn them instead.
//
// Needs docs/audio/onboarding/scene-NN.mp3 (narrate-elevenlabs.mjs) + ffmpeg/ffprobe.
// Run: node scripts/runbooks/build-video.mjs  →  onboarding.mp4 (+ onboarding.en.srt sidecar)
//
// A lip-synced *talking* avatar is still external (HeyGen): feed it script.json + the persona art.

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const DIR = 'docs/audio/onboarding';
const PERSONA = `${DIR}/assets/beacon-persona.jpg`;
const TMP = `${DIR}/.build`, CLIPS = `${TMP}/clips`, OUT = `${DIR}/onboarding.mp4`, SRT = `${DIR}/onboarding.en.srt`;
const W = 1920, H = 1080;

const need = (b) => { try { execFileSync(b, ['-version'], { stdio: 'ignore' }); } catch { console.error(`Missing ${b}. macOS: brew install ffmpeg`); process.exit(2); } };
const dur = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', f], { encoding: 'utf8' }).trim());
const sents = (t) => (String(t).match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [t]).map((s) => s.trim()).filter(Boolean);
const ts = (s) => { const p = (x, w = 2) => String(x).padStart(w, '0'); return `${p(Math.floor(s / 3600))}:${p(Math.floor(s % 3600 / 60))}:${p(Math.floor(s % 60))},${p(Math.round((s - Math.floor(s)) * 1000), 3)}`; };

need('ffmpeg'); need('ffprobe');
if (!existsSync(PERSONA)) { console.error(`missing persona art: ${PERSONA}`); process.exit(2); }
const man = JSON.parse(readFileSync(`${DIR}/script.json`, 'utf8'));
const have = man.filter((m) => existsSync(`${DIR}/${m.file}`));
if (!have.length) { console.error('no scene-NN.mp3 — run narrate-elevenlabs.mjs first'); process.exit(2); }
if (have.length < man.length) console.log(`WARN: ${man.length - have.length} scenes missing audio — using the ${have.length} present.`);
rmSync(TMP, { recursive: true, force: true }); mkdirSync(CLIPS, { recursive: true });

const list = [], cues = []; let clock = 0;
have.forEach((m, i) => {
  const mp3 = `${DIR}/${m.file}`, D = dur(mp3);
  const ss = sents(m.vo), wc = ss.map((s) => s.split(/\s+/).length), tot = wc.reduce((a, b) => a + b, 0) || 1;
  let t = clock;
  ss.forEach((s, j) => { const cd = D * (wc[j] / tot); cues.push({ a: t, b: t + cd, text: s }); t += cd; });
  clock += D;
  const clip = `${CLIPS}/clip-${String(i).padStart(2, '0')}.mp4`;
  execFileSync('ffmpeg', ['-y',
    '-f', 'lavfi', '-i', `color=c=0x03100f:s=${W}x${H}:d=${D.toFixed(2)}:r=30`,
    '-loop', '1', '-i', PERSONA, '-i', mp3,
    '-filter_complex', '[1]scale=520:520,format=yuva420p,fade=t=in:st=0:d=0.7:alpha=1[p];[0][p]overlay=(W-w)/2:150[vo]',
    '-map', '[vo]', '-map', '2:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', clip], { stdio: 'ignore' });
  list.push(`file '${process.cwd()}/${clip}'`);
  process.stdout.write(`\rrendered ${i + 1}/${have.length} clips`);
});
writeFileSync(`${TMP}/clips.txt`, list.join('\n'));
writeFileSync(SRT, cues.map((c, i) => `${i + 1}\n${ts(c.a)} --> ${ts(c.b)}\n${c.text}\n`).join('\n'));

console.log('\nconcatenating + muxing the English subtitle track …');
const joined = `${TMP}/joined.mp4`;
execFileSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', `${TMP}/clips.txt`, '-c', 'copy', joined], { stdio: 'ignore' });
execFileSync('ffmpeg', ['-y', '-i', joined, '-i', SRT, '-c', 'copy', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', OUT], { stdio: 'ignore' });
console.log(`✓ ${OUT} — ${have.length} clips, ~${Math.round(clock)}s, Beacon persona + Bella voice-over + EN subtitle track.`);
