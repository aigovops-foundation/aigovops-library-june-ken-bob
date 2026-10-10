# AiGovOps Foundation — repository wiki

A map of every GitHub repository behind **[www.aigovops-foundation.com](https://www.aigovops-foundation.com)**, built by reading all public repos under [`bobrapp`](https://github.com/bobrapp) (52) and the [`aigovops-foundation`](https://github.com/aigovops-foundation) org (22) on 2026-10-08; repository metadata refreshed from the GitHub API on 2026-10-10.

**Result:** 27 repos relate to the Foundation (22 org + 5 bobrapp), plus 2 private repos known only from the Library's `estate.yaml` and 3 adjacent repos. The other ~45 bobrapp repos are unrelated (about 29 of them are empty Replit exports).

## The Foundation in one screen

- **Mission line:** *Ship safe AI. Never unsafe AI.* Get to Yes before you ship · Stay at Yes while it runs · Recover to Yes when it breaks.
- **The rule:** *No direct model-to-tool path for consequential actions.* A gate decides (go ahead · only this far · wait for a person · no) and leaves a signed, content-free receipt that a stranger can verify offline.
- **The four gates:** Pre-pend (before an action) → Policy (before a rule/system ships) → Operate (while it runs) → Audit (after, on demand).
- **The ladder:** 100 Begin · 200 Retrofit · 300 Hold · 400 Prove, each an hour on a real case from the 100 verified AI harms. Marks are given at **Thursday 15:00 Pacific**.
- **Standard:** conforms to **OVERT 1.0** (Glacis Technologies); crosswalks to NIST AI RMF, EU AI Act, ISO/IEC 42001.
- **Founders:** Ken Johnston and Bob Rapp. 501(c)(3), Seattle.

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

Generated from repo READMEs, estate.yaml and the GitHub API on 2026-10-10.
