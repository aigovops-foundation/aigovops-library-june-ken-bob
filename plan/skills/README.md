# Skills (runnable)

Each folder is a `SKILL.md` with YAML frontmatter and a procedure body — the format a Claude
runtime auto-loads from `/mnt/skills/user/<name>/SKILL.md`. This repo is the durable source of
truth; the runtime path is a copy.

Frontmatter carries `principle:`, `owner:`, `agent:` and `risk:`, and `scripts/skills-check.mjs`
fails the build on a skill missing any of them, claiming a principle that does not exist, or
claiming one whose text is not yet recorded. The same check keeps this table in step with the
directory — it was stale by three skills before that rule existed.

| Skill | Owning agent | Risk |
|---|---|---|
| [`accessibility-audit`](./accessibility-audit/SKILL.md) | Aperture | green |
| [`ai-house-announce`](./ai-house-announce/SKILL.md) | Host | yellow |
| [`beacon-sign-evidence`](./beacon-sign-evidence/SKILL.md) | Beacon | green |
| [`design-system-apply`](./design-system-apply/SKILL.md) | Maker | yellow |
| [`doc-generate`](./doc-generate/SKILL.md) | Scribe | yellow |
| [`editorial-voice`](./editorial-voice/SKILL.md) | Scribe | green |
| [`estate-health`](./estate-health/SKILL.md) | Sentinel | green |
| [`estate-mailer`](./estate-mailer/SKILL.md) | Deploy | red |
| [`framework-map`](./framework-map/SKILL.md) | Lantern | green |
| [`monitor-and-alert`](./monitor-and-alert/SKILL.md) | Sentinel | green |
| [`op-github-deploy`](./op-github-deploy/SKILL.md) | Deploy | red |
| [`security-privacy-review`](./security-privacy-review/SKILL.md) | Guardian | green |
| [`sponsorship-proposal`](./sponsorship-proposal/SKILL.md) | Herald | yellow |
| [`status-report`](./status-report/SKILL.md) | Herald | green |
| [`translate-and-sign`](./translate-and-sign/SKILL.md) | Polyglot | yellow |
| [`ua-help-authoring`](./ua-help-authoring/SKILL.md) | Scribe | yellow |
| [`ux-flow-spec`](./ux-flow-spec/SKILL.md) | Maker | yellow |

**Risk** is the autonomy class from `policies/autonomy.yaml`: `green` an agent runs unattended,
`yellow` an agent prepares and a human merges, `red` never unattended.

> Skills hold **procedure, not facts.** Live facts (URLs, counts, authors) live in `HIBT.md`.
