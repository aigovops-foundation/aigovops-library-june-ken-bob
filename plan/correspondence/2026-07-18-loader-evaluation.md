# Loader v9.4 — evaluation stance and reply to Jack

*2026-07-18. The first worked example of `plan/processes/external-claims.md`. Source
analysis by Perplexity, edited and adopted by Bob; reply awaiting a founder's send.*

## What arrived

A practitioner ("Jack") shared a write-up for **the Loader v9.4** — a session-opening
prompt pattern (a "Minimal Activation Header," ≤40 tokens) claimed to stabilize
multi-turn model behavior, framed with language about probabilistic determinism, changing
the gravitational coordinates of vector space, quantum-inspired stabilizers, zero drift,
and zero footprints. The motivation behind it is sincere and personal: protecting friends,
children, and grandchildren from unsafe AI behavior.

## The harvest — three testable ideas

1. **A minimal, structured session header** as a *compact runtime contract*: anchor role,
   scope, and output format before anything else is said. Plausible, cheap to test, and
   already adjacent to how the estate's gates work.
2. **Runtime invariants and violations**: a small set of properties that must hold across
   a multi-turn session, with violations counted as a metric rather than described as a
   metaphor. This maps directly onto Umbrella's policy-as-code.
3. **Session-local privacy**: avoiding intentional client-side persistence between
   sessions — reconcilable with Beacon's evidence needs via anonymized, signed metrics
   (log the behavior, not the transcript).

## The exclusions — stated plainly, not silently

The Foundation does not adopt or endorse: "probabilistic determinism," "changing the
gravitational coordinates of vector space," "quantum-inspired stabilizers," "zero drift,"
or "zero footprints." These are unfalsifiable as written; carrying them — even in
quotation, even generously — would cost credibility with exactly the auditors, engineers,
and researchers the Foundation exists to serve. **This exclusion travels with any result
we publish.**

## The evaluation design (pre-declared, before data)

- **Arms:** Loader header · no header · a standard short governance header (two baselines).
- **Spread:** the same tasks across model families and operators.
- **Metrics:** invariant violations per session · instruction adherence · output
  consistency · token usage · human rubric score. No claimant-supplied percentages.
- **Evidence:** every run lands as a Beacon-signed receipt; results shared back with Jack
  regardless of outcome.
- **Open question for the founders:** start with one model family, or cross-provider from
  the first run?

## The reply (draft — a founder sends it)

> Jack,
>
> Thank you again for sharing the Loader write-up and the personal story behind it. The
> care you've put into protecting friends, children, and grandchildren is clear, and that
> motivation is very close to why Ken and I started the AiGovOps Foundation.
>
> Reading through the brief, there are a few concrete ideas that look both sensible and
> testable inside our governance-as-code work:
>
> **1. Minimal, structured session header.** The idea of opening every session with a very
> short, highly structured initialization prompt — what you call a "Minimal Activation
> Header" — is interesting. In our language, that's a compact runtime contract: it anchors
> role, scope, and output expectations before anything else is said. We've seen informally
> that consistent opening structure improves model behavior, but we haven't yet measured
> it properly.
>
> **2. Runtime invariants and violations.** The notion of a small set of invariants that
> should remain true across a multi-turn session, and a way to detect when the session is
> pushing against those invariants, maps well to our Umbrella policy-as-code approach. If
> we strip the quantum metaphors, what's left is: define the invariants, run sessions, log
> violations, and see whether the Loader changes the violation rate.
>
> **3. Session-local privacy stance.** Your emphasis on keeping tracking purely
> session-local and not exporting operator state between sessions is aligned with the
> privacy concerns we hear from practitioners. In regulated environments we still need
> durable evidence, but there's room for modes where we log signed metrics about behavior
> without storing full text traces.
>
> Those three pieces are enough for us to treat the Loader as a candidate runtime pattern
> that we can evaluate with the AiGovOps tooling — Beacon for signed evidence, Umbrella
> for policy and invariants, Lantern for observability.
>
> To do that rigorously, we'd need to work from a very small, concrete artifact package.
> If you're open to it, here's what would help:
>
> **1. Exact Loader v9.4 header text.** Could you send the precise text of the current
> initialization header (the ≤40-token part), with no extra explanation — just the literal
> text as you use it?
>
> **2. Three representative tasks and baselines.** For three tasks where you feel the
> Loader helps: the task description; the model/provider and settings (e.g. "model X,
> temperature Y, top-p Z, date of run"); one example run **without** the Loader (baseline
> prompt and output); one example run **with** it. We're not looking for percentages at
> this stage — just paired before/after examples we can re-run and score independently.
>
> **3. Plain-language invariants.** Could you list 5–10 invariants you believe the Loader
> helps maintain, written in simple, observable terms? For example: "the model stays
> within the operator's requested scope unless it clearly marks an expansion"; "the model
> distinguishes observed evidence from speculation"; "the model does not claim to delete
> or erase data unless that is verifiably true." Each should be something we can turn into
> a yes/no or rubric-based test in Umbrella.
>
> From there, our plan would be to treat the Loader header as an experimental runtime
> contract, side by side with two baselines — no header, and a standard short governance
> header — run the same tasks across different models and operators, and measure concrete
> things: invariant violations per session, instruction adherence, output consistency,
> token usage, and human scoring. We'd record the results as Beacon-signed receipts, so
> the evidence is portable and auditable.
>
> This keeps us firmly in the lane where we're comfortable: policies that compile, claims
> that are testable, evidence that can be signed and handed to an auditor. It also avoids
> us trying to validate bigger statements about "probabilistic determinism" or "changing
> vector-space gravity," which are outside what we can responsibly endorse.
>
> If you'd like to proceed on that basis, send the three items above and we'll treat it as
> an experiment inside our governance-as-code framework rather than as a standalone
> doctrine. Whatever the outcome, we'll share back what we learn.
>
> Governance needs governance. One of the ways we can contribute is by turning sincere
> operator observations like yours into measurable, receipted evidence instead of leaving
> them as rhetoric or self-belief.
>
> Warm regards,
> Bob — AiGovOps Foundation

## Why this is worth keeping

This is the Foundation's posture toward the whole genre of confident, unfalsifiable AI
methodology that the field is now generating faster than it can test. The reply is the
product: *kind to the person, ruthless with the claim, specific about what would change
our minds.* It also seeds a real research thread — if a 40-token header measurably lowers
invariant-violation rates, that is a finding worth publishing with receipts, and it would
belong in the "State of AI Governance in Practice" report.
