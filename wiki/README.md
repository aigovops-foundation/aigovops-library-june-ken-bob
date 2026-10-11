# AiGovOps Foundation — repository wiki

A map of every GitHub repository behind **[www.aigovops-foundation.com](https://www.aigovops-foundation.com)**, built by reading all public repos under [`bobrapp`](https://github.com/bobrapp) (52) and the [`aigovops-foundation`](https://github.com/aigovops-foundation) org (22) on 2026-10-08; repository metadata refreshed from the GitHub API on 2026-10-11.

**Result:** 27 repos relate to the Foundation (22 org + 5 bobrapp), plus 2 private repos known only from the Library's `estate.yaml` and 3 adjacent repos. The other ~45 bobrapp repos are unrelated (about 29 of them are empty Replit exports).

## The Foundation in one screen

- **Mission line:** *Ship safe AI. Never unsafe AI.* Get to Yes before you ship · Stay at Yes while it runs · Recover to Yes when it breaks.
- **The rule:** *No direct model-to-tool path for consequential actions.* A gate decides (go ahead · only this far · wait for a person · no) and leaves a signed, content-free receipt that a stranger can verify offline.
- **The four gates:** Pre-pend (before an action) → Policy (before a rule/system ships) → Operate (while it runs) → Audit (after, on demand).
- **The ladder:** 100 Begin · 200 Retrofit · 300 Hold · 400 Prove, each an hour on a real case from the 100 verified AI harms. Marks are given at **Thursday 15:00 Pacific**.
- **Standard:** conforms to **OVERT 1.0** (Glacis Technologies); crosswalks to NIST AI RMF, EU AI Act, ISO/IEC 42001.
- **Founders:** Ken Johnston and Bob Rapp. 501(c)(3), Seattle.

## What changed on 2026-10-10

- **Contact addresses:** Foundation repos now list `@aigovops-foundation.com` addresses: [Omni-Rapp-June-2026#432](https://github.com/aigovops-foundation/Omni-Rapp-June-2026/pull/432), [aigovops-beacon#72](https://github.com/aigovops-foundation/aigovops-beacon/pull/72), [aigovops-lantern#12](https://github.com/aigovops-foundation/aigovops-lantern/pull/12), [aigovops-library-june-ken-bob#94](https://github.com/aigovops-foundation/aigovops-library-june-ken-bob/pull/94), [aigovops#11](https://github.com/aigovops-foundation/aigovops/pull/11), [openclaw-installer#86](https://github.com/aigovops-foundation/openclaw-installer/pull/86), and [umbrella-govops#14](https://github.com/aigovops-foundation/umbrella-govops/pull/14). The `https://aigovops.org/...` schema, predicate and attestation URIs are identifiers and stay unchanged on purpose.
- **Mail:** aigovops-foundation.com mail moved from Hostinger to Cloudflare Email Routing. The catch-all runs the Worker `aigovops-mail-fanout`, which forwards to Bob first and then copies Ken (Ken's copy starts once he verifies his address with Cloudflare). The SES/Resend records on `send.` and `story.` and the DMARC record were left unchanged.
- **AI crawlers:** Cloudflare's "Block AI bots" is off, so GPTBot, ClaudeBot and CCBot get 200 instead of 403. `robots.txt` disallows only `/transcripts/`.
- **Old-domain links repointed:** [aigovops#10](https://github.com/aigovops-foundation/aigovops/pull/10), [aigovops-lantern#11](https://github.com/aigovops-foundation/aigovops-lantern/pull/11), [aigovops-beacon#67](https://github.com/aigovops-foundation/aigovops-beacon/pull/67), [umbrella-govops#13](https://github.com/aigovops-foundation/umbrella-govops/pull/13), [openclaw-installer#84](https://github.com/aigovops-foundation/openclaw-installer/pull/84), [aigovops-ncw-ai-camp#55](https://github.com/aigovops-foundation/aigovops-ncw-ai-camp/pull/55), [aigovops-vendor-rfi#13](https://github.com/aigovops-foundation/aigovops-vendor-rfi/pull/13), and [aigovops-foundation-site-redesign-June2026-ken-and-bob#164](https://github.com/aigovops-foundation/aigovops-foundation-site-redesign-June2026-ken-and-bob/pull/164) (private).
- **Trunk cleanup:** the stale `products/*` copies in `aigovops` are replaced by pointers to the canonical repos ([aigovops#12](https://github.com/aigovops-foundation/aigovops/pull/12)).
- **Security:** least-privilege workflow permissions in [aigovops-beacon#71](https://github.com/aigovops-foundation/aigovops-beacon/pull/71), [umbrella-govops#15](https://github.com/aigovops-foundation/umbrella-govops/pull/15), [aigovops-vendor-rfi#14](https://github.com/aigovops-foundation/aigovops-vendor-rfi/pull/14), [openclaw-installer#87](https://github.com/aigovops-foundation/openclaw-installer/pull/87), [aigovops-ncw-ai-camp#60](https://github.com/aigovops-foundation/aigovops-ncw-ai-camp/pull/60) and the site ([#165](https://github.com/aigovops-foundation/aigovops-foundation-site-redesign-June2026-ken-and-bob/pull/165), private). npm advisories fixed in [aigovops-beacon#70](https://github.com/aigovops-foundation/aigovops-beacon/pull/70), [openclaw-installer#88](https://github.com/aigovops-foundation/openclaw-installer/pull/88) and [aigovops-ncw-ai-camp#56](https://github.com/aigovops-foundation/aigovops-ncw-ai-camp/pull/56).
- **Library deep links:** a case's `?id=` now survives the rules page and sign-in ([Omni-Rapp-June-2026#433](https://github.com/aigovops-foundation/Omni-Rapp-June-2026/pull/433), [#435](https://github.com/aigovops-foundation/Omni-Rapp-June-2026/pull/435)). Both are live.
- **Practice:** `anchor.min.js` is vendored, so it no longer 404s ([practice#28](https://github.com/aigovops-foundation/practice/pull/28)).
- **Archived:** [aigovops-foundation#1](https://github.com/aigovops-foundation/aigovops-foundation/pull/1) adds the redirect to [www.aigovops-foundation.com](https://www.aigovops-foundation.com).

## Web surfaces → repos

| Surface | Repo |
|---|---|
| www.aigovops-foundation.com (the porch) | `aigovops-foundation-site-redesign-June2026-ken-and-bob` *(private)* |
| practice.aigovops-foundation.com (the café) | [`practice`](https://github.com/aigovops-foundation/practice) |
| community.aigovops-foundation.com | `Omni-Rapp-June-2026` *(private)* |
| community…/library/ | [`aigovops-library-june-ken-bob`](https://github.com/aigovops-foundation/aigovops-library-june-ken-bob) |
| aigovops-foundation.github.io/* | Beacon, Umbrella, Lantern, aigovops, NCW AI Camp, Vendor RFI, OpenClaw, Artist Coach |

## Pages

**[Home](README.md)**

- [The product stack](The-product-stack.md) (7 repos): The engines that make, bind, read and carry signed receipts. All conform to (or are moving onto) OVERT 1.0.
- [Practice, Library & learning](Practice-Library-and-learning.md) (6 repos): Where people learn the rule and earn marks: the café, the worksheets, the Library and the training tools.
- [Community & impact projects](Community-and-impact-projects.md) (5 repos): Applied projects for specific communities, mostly early-stage.
- [Foundation operations (personal account)](Foundation-operations-personal-account.md) (5 repos): Foundation-branded work that still lives under bobrapp. The estate review flagged personal-account Foundation work as a risk.
- [Private, legacy, adjacent](Private-legacy-and-adjacent.md)
- [Estate findings](Estate-findings.md): inconsistencies worth fixing


## How the stack fits together

```
 rule (plain words / YAML) ──► Umbrella (UCIDs, crosswalks, CI policy gate)
                                    │ binds
 agent action ──► gate (aigovops trunk / Library core broker) ──► Beacon (signs receipt, OVERT)
                                    │                                 │
                                    ▼                                 ▼
                           Omni / Jeeves (ledger, Thursday)   Lantern (reads, diffs, explains)
                                                                      │
                                              One Receipt (spec for the shared envelope)
```

*Sources: each repo's README and docs, `aigovops-library-june-ken-bob/estate.yaml`, `practice/docs/reference/ESTATE-MAP.md`, and the live site. Private repos are described from those documents and not inspected.*

Generated from repo READMEs, estate.yaml and the GitHub API on 2026-10-11.
