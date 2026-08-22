# Process — skills as code (`principle:` frontmatter)

*Rule of record for how a skill declares what it implements and how far it may run alone.
Ladder row 7 of [`plan/MASTER-PLAN.md`](../MASTER-PLAN.md). Policy:
`policies/principles.yaml` · checker: `scripts/skills-check.mjs` · tests:
`test/skills-check.test.mjs`.*

---

## The one thing to know

```
npm run skills:check
```

Runs in CI. Every skill declares four things in its frontmatter:

```yaml
---
name: estate-health
principle: P5        # which of the 11 Principles this implements
owner: bobrapp       # the accountable human
agent: Sentinel      # the owning agent
risk: green          # how far it may run alone — the autonomy.yaml classes
description: ...
---
```

---

## Why

The manifesto reads as a specification, not a mission statement. `principle:` makes that
literal: the build tests each skill's claim against `policies/principles.yaml`. It costs one
line per file and it is the thing no other organisation in this space can currently claim —
a manifesto their CI evaluates.

`risk:` reuses the **same three classes** as `policies/autonomy.yaml`, so a skill and a
workflow are graded on one scale. Today: **7 green · 5 yellow · 1 red**.

The red one is `op-github-deploy`, because it reaches a release path. The checker restates
that on every run — a skill that must never run unattended should say so where it lives,
not in someone's memory.

---

## The honest gaps, and the line the gate draws

**Six of the eleven principles are not recorded.** The manifesto lives on the Foundation
site and has no copy in this repo — a canonicity finding in its own right, and the reason
`policies/principles.yaml` ships with `P3`, `P6`, `P7`, `P8`, `P9` and `P11` marked
`unknown`. Filling them is a two-minute paste by a founder.

**Four skills are not mapped** to a principle yet: `design-system-apply`, `ux-flow-spec`,
`ua-help-authoring`, `doc-generate`. None of the five recorded principles clearly covers
them, and guessing would be worse than admitting it.

So the gate draws its line at *verifiability*, not at certainty:

| Declaration | Verdict |
|---|---|
| `principle: P5` (recorded) | passes |
| `principle: unknown` | passes, and is **counted and printed every run** |
| `principle: P3` (id exists, text not recorded) | **fails** — an unverifiable claim |
| `principle: P99` (no such id) | **fails** |
| no `principle:` at all | **fails** |

Doubt is allowed. Silence and unverifiable claims are not. That is the same rule
`estate.yaml` runs under, and the same rule the estate map learned in July: a thing we could
not verify reads as unknown, never as green.

---

## The nine mappings are proposals

The principle assigned to each mapped skill is an agent's reading, not a founder's ruling —
Yellow work, merged by a human. The reasoning, one line each:

- **P5 — observability** · `estate-health`, `monitor-and-alert`, `status-report`,
  `beacon-sign-evidence`, `translate-and-sign`. Each one exists so an effect can be traced
  after the fact; the receipt *is* the trace.
- **P1 — governance in the pipeline** · `security-privacy-review`, `accessibility-audit`,
  `op-github-deploy`. Each runs as a gate in the build rather than as a document reviewed
  beside it.
- **P4 — policies as executable code** · `framework-map`, which turns regulation into
  something a machine can evaluate.

Disagree with any of them in review; that is what the field is for.

---

## Where the tree lives

The skills stay at `plan/skills/` for now. The master plan moves them to `skills/` at the
root of the mono-repo trunk (M1) — doing that move today would break links in four documents
to reach a destination that does not exist yet. The annotation is the part with value, and it
travels with the files whenever they move.

---

## Adding a skill

1. Write `plan/skills/<name>/SKILL.md` with all four governance fields.
2. `npm run skills:check`. If the principle genuinely is not clear, say `unknown` — it will
   be printed, which is the point.
3. Open a PR. Skills are Yellow: an agent prepares, a human merges. A production skill never
   edits itself.
