---
name: editorial-voice
principle: P4
owner: bobrapp
agent: Scribe
risk: green
description: Check prose against the Foundation's voice and report what breaks it — never rewriting, always citing. Use on any text that will carry the Foundation's name. Trigger on "check the voice", "does this sound like us", "editorial review", "is this overclaiming".
run: handler:editorial-voice
inputs: {"type":"object","required":["text"],"properties":{"text":{"type":"string"},"path":{"type":"string","description":"optional — the file the text came from, so findings can carry a location"}}}
outputs: {"type":"object","required":["findings","summary"],"properties":{"findings":{"type":"array"},"summary":{"type":"object"}}}
---

# editorial-voice

**Owning agent:** Scribe · **Risk: green** — it reads, reports and signs a receipt. It changes
nothing, so there is nothing to undo.

## Why this is a skill and not a brand deck

The Foundation's argument is that governance belongs in the pipeline rather than in a PDF. A
style guide nobody can run is the PDF. This turns the voice into rules a check can apply and a
build can fail on — which is P4 exactly: policies must translate to executable code.

It is also the only one of the three fat skills that is green, and the reason is worth naming.
It never edits. A voice checker that rewrites is a voice checker that quietly becomes the
author, and then nobody is reviewing anything. **Findings go back to the writer. A rewrite
arrives as a pull request, which is yellow.**

## The rules it checks

Drawn from the house conventions, in force for anything carrying the Foundation's name.

| Rule | What fails it | Severity |
|---|---|---|
| **`overclaim`** | A claim broader than the evidence. The canonical example: "100% visibility" of *model thoughts* rather than of *effects*. Also "guarantees", "ensures compliance", "fully automated governance" | high |
| **`bullet-soup`** | A section that is a list of fragments where it should be prose. Three or more consecutive bullets under six words each | medium |
| **`unsourced-number`** | A quantity with no citation, in a document type that requires one | high |
| **`hedge-on-fact`** | "roughly", "approximately", "over" attached to a number that is known exactly | medium |
| **`false-comfort`** | A risk described in language that softens it. "Minor issue", "should be fine", "nothing to worry about" — Bob values candor over comfort | high |
| **`borrowed-voice`** | Vendor-deck register: "leverage", "unlock", "seamless", "best-in-class", "empower", "revolutionise" | medium |
| **`undated-status`** | A status or measurement with no date. A dated measurement does not rot; an undated one does | medium |
| **`agent-as-decider`** | Prose implying an agent decided something irreversible, rather than prepared it. "The system approved", "automatically merged to main" | high |

`high` findings block. `medium` findings are reported and a human decides.

## Procedure (repeatable)

1. **Read the text once for what it is claiming**, before applying any rule. A rule applied to
   a sentence out of context produces a confident wrong answer.
2. **Apply each rule**, recording for every finding: the rule, the exact quote, a location, and
   *why it fails* in one sentence.
3. **Propose, do not impose.** Each finding carries a suggestion. The suggestion is a
   suggestion; the writer's version wins unless the rule is `high`.
4. **Say what you did not check.** Anything outside these eight rules — argument quality,
   accuracy of a cited fact, whether the piece is any good — is not in scope and the summary
   says so.
5. **Report. Do not edit the source.**

## Acceptance criteria

| # | Criterion | How it is checked |
|---|---|---|
| 1 | Every finding quotes the text verbatim | the quote is found in the input, exactly |
| 2 | Every finding names one rule from the table | rule id is in the closed set of eight |
| 3 | Every finding says why, in a sentence | non-empty, and not a restatement of the rule name |
| 4 | The input is returned unmodified | input hash equals output hash of the source |
| 5 | The summary states what was not checked | the out-of-scope note is present |
| 6 | A clean pass is reported as a pass, not silence | `findings: []` with an explicit summary |

Criterion 4 is the one that matters. It is what keeps this skill green.

## Output schema

```json
{
  "findings": [
    { "rule": "overclaim", "severity": "high", "path": "docs/index.html", "line": 42,
      "quote": "100% visibility into what the model is thinking",
      "why": "We can see effects, not thoughts — the claim is broader than anything we can show.",
      "suggestion": "100% visibility of effects" }
  ],
  "summary": {
    "high": 1, "medium": 0, "clean": false,
    "notChecked": "Argument quality, factual accuracy of cited claims, and whether the piece
                   works as a whole. This checks voice against eight rules, nothing more."
  }
}
```

## Human gate
None to run — it changes nothing. Acting on a finding is the writer's call, and any rewrite
arrives as a pull request.

## Evidence — the receipt
Emit via `beacon-sign-evidence`: a metadata-only **`artifact`** receipt —
`kind, actor=agent:scribe, action=review, path, ruleCounts{}, contentHash`. **No quotes, no
prose, no draft text — the quotes live in the finding returned to the writer and nowhere
else.**

## Done = Yes
The writer has the findings. No `high` finding is outstanding, or a human has looked at each
one and said so. The text is exactly as it was.
