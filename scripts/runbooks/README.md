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

## Notes

- `seo-drift-check.mjs` already runs clean on the current site (it found and we fixed 9
  pages missing `og:url`). Adding it to `.github/workflows/ci.yml` would keep discoverability
  from regressing silently.
- `insight-digest.sh` and `ledger-integrity.sh` need SSH access to the droplets
  (`~/.ssh/aigovops`); they never write and never print user content or secrets.
- To schedule (when you choose): a GitHub Action `schedule:` for the SEO check, or a systemd
  timer / the foundation's `jeeves`/cron surface for the digest. None auto-enabled.
