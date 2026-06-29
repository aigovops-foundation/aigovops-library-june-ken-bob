# Agent runbooks

Reversible, read-only automations per the house rule: *automate everything reversible; the
human only does the irreversible gates.* Each script is dependency-free, prints a report,
and exits non-zero on a real problem so it can gate CI or run as a cron.

**Scheduling is deliberately NOT enabled here.** Wiring any of these to a cron / scheduled
agent is your opt-in step (it's an outward-facing, standing action). The scripts are ready;
turning them on is one approved move.

| Runbook | What it does | Run | Suggested cadence |
|---|---|---|---|
| `seo-drift-check.mjs` | Verifies every page's title/description/og:url/canonical/JSON-LD, that internal links resolve, and that the sitemap lists every page. Exits non-zero on drift. | `node scripts/runbooks/seo-drift-check.mjs` | every push (CI) |
| `ledger-integrity.sh` | Hits a running core's `/status` and asserts `ledger.valid`. | `AIGOV_STATUS_URL=http://localhost:8787/status ./ledger-integrity.sh` | hourly / external watchdog |
| `insight-digest.sh` | Metadata-only, anonymized, token-redacted weekly snapshot of community activity (actors, events, funnel, top event kinds). | `OMNI_HOST=178.128.146.152 ./insight-digest.sh` | weekly (steward reads) |
| `narrate-elevenlabs.mjs` | Generate studio voice-over (ElevenLabs) for the onboarding tutorial — one MP3 per scene from `docs/audio/onboarding/script.json`. API key resolved through the 1Password broker, never a literal. | `node …/narrate-elevenlabs.mjs voices` → `ELEVEN_VOICE_ID=<id> node …/narrate-elevenlabs.mjs` | on narration change |
| `build-subtitles.mjs` | English subtitles (SRT + WebVTT) from the narration manifest, one cue per sentence. Estimated timing (no audio needed). | `node …/build-subtitles.mjs` | on narration change |
| `build-video.mjs` | Assemble one shareable **MP4** — Beacon persona on screen + the voice-over + burned-in English subtitles with timing re-derived from the real audio. **Needs** the generated MP3s + `ffmpeg`. | `node …/build-video.mjs` | on narration change |

### The onboarding video, three forms
1. **In-browser** (live now): `docs/onboarding.html` plays the tour with the **Beacon persona** on screen (it glows while narrating) and live captions/subtitles. Uses studio MP3s when present, browser voice otherwise.
2. **Standalone MP4**: `narrate-elevenlabs.mjs` → `brew install ffmpeg` → `build-video.mjs`. Persona + voice-over + burned EN subtitles.
3. **Talking avatar** (external): for a lip-synced Beacon presenter, feed `script.json` narration + a Beacon-persona avatar to an avatar service (e.g. HeyGen). Out of scope for ffmpeg.

## Credentials (brokered, never pasted)

Keys live once in 1Password (`AiGovOps` vault) and resolve through `op://`. Storing a key is
the founder's one manual act — every consumer (Jeeves on the core, and these runbooks) reads
the same reference, so nothing else is pasted.

| Key | Reference | Store once |
|---|---|---|
| ElevenLabs | `op://AiGovOps/elevenlabs-api-key/credential` | `op item create --vault AiGovOps --category 'API Credential' --title elevenlabs-api-key 'credential[password]=<your-key>'` |

Never pass a real key as a shell argument in a shared transcript — paste it via 1Password's
field, or run the `op item create` yourself in your own terminal.

## Notes

- `seo-drift-check.mjs` already runs clean on the current site (it found and we fixed 9
  pages missing `og:url`). Adding it to `.github/workflows/ci.yml` would keep discoverability
  from regressing silently.
- `insight-digest.sh` and `ledger-integrity.sh` need SSH access to the droplets
  (`~/.ssh/aigovops`); they never write and never print user content or secrets.
- To schedule (when you choose): a GitHub Action `schedule:` for the SEO check, or a systemd
  timer / the foundation's `jeeves`/cron surface for the digest. None auto-enabled.
