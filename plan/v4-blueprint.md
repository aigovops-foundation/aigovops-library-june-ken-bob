# AiGovOps v4.0 — Product Blueprint

*Governance-as-code that a policy author can improve and a developer can ship —
installed, governed, and audited end to end, run by Jeeves and held by humans.*

> Status: **design draft** for Bob & Ken. Synthesizes two source documents, the
> existing AiGovOps repos, and a verified set of Apache-2.0 / 10k★ open-source
> building blocks. Not yet built; this is the map. Contains strategic/competitive
> content — decide visibility (public repo vs. private) before publishing.

---

## 0. The two protagonists

Everything below serves two people and the five roles around them:

- **The policy author** (compliance lead, faculty, founder) arrives with a *written policy in prose*.
  v4.0 helps them **improve it against the live regulatory corpus** and turn it into something executable.
- **The developer** takes that improved policy and **authors the gates, criteria, and exit states** —
  the machine-checkable form of *Get to YES · Stay at YES · Recover to YES*.

Five roles, one role-scoped surface: **steward** (founder — sees all + kill switch), **developer**
(authors gates), **policy author** (authors/improves policy), **member / end-user** (sees only their own
effects), **auditor** (read-only evidence + DSAR). "UA" = identity/access for these roles **and** the
accessibility of the surface they use; both are first-class below.

---

## 1. Grounding in the two source documents

### 1.1 *Governing Intelligence* (Noah M. Kenney, 2026) → the regulatory spine
The book is a 488-page reference on AI law, privacy, security, and compliance.
*(© 2026, all rights reserved — we use it as a structural reference and cite the public frameworks it
catalogs; we do not redistribute its text. Clear permission before embedding any passages.)*

Two things we take from it:

**(a) The 5-layer AI Governance Stack** — the organizing spine for the whole product. Each AiGovOps
component maps to a layer:

| Stack layer (from the book) | AiGovOps component | Backed by (OSS, §3) |
|---|---|---|
| **1 · Data Governance** | Umbrella policy on data + Lantern data-drift | Great Expectations, OpenSearch |
| **2 · Model Governance** | Umbrella model rules + MLflow registry | MLflow, Trivy |
| **3 · System Integration Governance** | the chokepoint / sandbox + gateway | Kong/APISIX, OPA |
| **4 · Control & Monitoring Governance** | Lantern + Caps + Jeeves | Prometheus, Jaeger |
| **5 · Audit & Evidence Governance** | Beacon signed receipts + ledger | cosign/sigstore, Fluentd |
| *cross-layer:* explainability, metrics, **maturity model** | the dashboard | Superset, Backstage |

**(b) The regulatory corpus** — the knowledge base the *policy-improver* agent reasons over.
The book catalogs (and our framework-map skill indexes): **EU AI Act** (Reg 2024/1689), **GDPR**
(2016/679), **NIST AI RMF**, **ISO/IEC 42001**, **MITRE ATLAS**, **OWASP LLM/ML Top 10**, **IEEE 7000**,
US federal + state (**Colorado AI Act SB24-205**, **NYC Local Law 144**, **Illinois BIPA**), **CCPA/CPRA**,
sector regimes (**HIPAA**, **GLBA**, **FERPA**, **COPPA/KOSPA**), and global (China, UK, OECD, UNESCO).
The book's Appendix templates (Impact Assessment, Audit Report, the 5-phase governance checklist) become
**skill scaffolds**, not prose to copy.

### 1.2 GAC competitive landscape → the product & operating model
The GAC analysis is about the academic vertical, but its operating model is the v4.0 product model:

- **The differentiator** (the gap no competitor fills): governance that is **authored, experienced, and
  studied** — not just configured by engineers. v4.0 generalizes GAC's three unique dimensions to *every*
  vertical: (a) **user-authored** policy-as-code, (b) **governed/ungoverned side-by-side** comparison,
  (c) **research-grade signed audit log**.
- **Three agent tiers** (§5): scheduled-autonomous, human-triggered, and a skills library of markdown SOPs.
- **The one-hour review-and-approve loop**: the human *decides*; agents *execute*. This is the irreversibility
  boundary as a daily workflow.
- **Generator-critic architecture** (the UK Aila/IACMA precedent): Jeeves generates, a **critic sub-agent**
  refutes before anything irreversible — the same adversarial pattern we use in reviews.
- **Sequencing wisdom**: lead with the lowest-overhead wedge (a conversational **governance tutor /
  policy-improver**) before the full wizard; wire the agent layer from day one. Adjacent tools to learn from
  (not copy): Portkey/Bifrost (gateways), Langfuse (LLM obs), NIST Dioptra (trustworthy-AI testing),
  LM Arena (side-by-side), Moodle AI subsystem (LMS-embedded governance).

---

## 2. What already exists (reuse, don't rebuild)

A repo audit found the governed core is **already real** — just spread across three implementations with a
**gate implemented three times and diverging**. v4.0 is mostly *consolidation*, not greenfield.

| Capability | Where the good version lives | Verdict |
|---|---|---|
| **Beacon** — Ed25519 signed receipts, RFC-8785 canonical JSON, hash-chained NDJSON ledger, key rotation | Library `core/src/core/beacon.js` | **Canonical.** Modularize as `@aigovops/beacon`; V4's simpler `sign.mjs` re-exports it. |
| **Caps** — capability dial (read→propose→act→auto) + hard caps on spend/rate/blast-radius, fail-closed | Library `core/src/core/caps.js` | **Canonical.** Adopt directly. |
| **Secrets broker** — one `SecretsProvider` interface, Env→Keychain→1Password→Vault backends; agents never hold creds | Omni-v4 `core/secrets.py` | **Canonical interface.** Port to Node; one broker for all. |
| **Umbrella** — declarative policy compiler (8 ops) + named profiles | V4 `packages/umbrella/src/compile.mjs` | **Canonical.** |
| **Lantern** — structural + numeric drift, tolerance, escalation | V4 `packages/lantern/src/index.mjs` | **Canonical.** |
| **Jeeves** — Umbrella→Lantern→Beacon pipeline | V4 `jeeves/src/index.mjs` | **Canonical shape;** wire broker + caps + auth around it. |
| **Corpus-traceable gate law** — each rule links to a corpus entry | Omni-v4 `core/gate_law.json` | **Reuse** as Umbrella policy source + citations. |
| **Auth** — GitHub/OIDC + HMAC sessions, steward allow-list | Library `core/src/core/auth.js` | **Canonical** (cloud); magic-link (Omni) as offline opt-in. |
| **Oversight + DSAR** — role-scoped ledger views, kill switch, signed DSAR bundle | Library `core/src/core/{oversight,dsar}.js` | **Canonical.** Extend with Omni's holds queue + channels. |

**The one big simplification — unify the gate.** Collapse the three implementations into a single canonical
module, the core export of the monorepo:

```
@aigovops/gate.decide(proposal):
  1. Umbrella.compile(policy).evaluate(facts)   → PASS / FAIL + violations   (criteria)
  2. Lantern.detectDrift(baseline, current)     → drift + escalation          (Stay-at-YES)
  3. Caps.check(actor, {level, spend, blast})   → within limits?              (hard ceiling)
  4. human decision (if irreversible)           → approve / deny              (humans hold keys)
  5. Beacon.sign(decision)                       → receipt (even on deny)      (proof)
  6. on approve → Secrets.issue(scope, ttl)      → brokered grant, never raw   (chokepoint)
```

Every product (Library, Omni, Jeeves, any future agent in any language) calls this one gate over HTTP or
in-process. Removing the two parallel gates erases the single largest source of drift risk.

---

## 3. Filling the holes with proven open source

The core stays tiny and auditable; each "hole" gets a **pluggable adapter** that produces the same
`{status, mitigation, receipt}` shape from a heavyweight backend. **Define the contract once; enforce it
with the strongest backend each environment allows.** Picks below are **Apache-2.0 and ≥10k★** (verified via
the GitHub API, 2026-06-27); notable non-Apache options are named for candor but not defaulted to.

| Hole | Default backend (Apache-2.0, ≥10k★) | Role in v4.0 |
|---|---|---|
| **Architecture / orchestration** | **Apache Airflow** (46k) · **Argo Workflows** (16.8k) | Jeeves' Tier-1 scheduled runs at scale; DAG of gate jobs |
| **Policy / OPA** | **OPA** (11.9k) · **Casbin** (20.2k) | Umbrella's heavyweight backend (Rego); per-role authz |
| **Identity / access (UA)** | **Keycloak** (35.3k) · **Ory Kratos** (13.7k) | Role-scoped oversight; OIDC for the five roles |
| **Security** | **Trivy** (36.6k) · **OWASP ZAP** (15.3k) | Code/dep/IaC gates (Umbrella); DAST in CI |
| **Observability** | **Prometheus** (64.8k) · **Jaeger** (22.9k) | Lantern's metric/trace drift signal + escalation |
| **Audit / logging** | **OpenSearch** (13.3k) · **Fluentd** (13.5k) | Searchable evidence store fed by the Beacon ledger |
| **Test / stage** | **Great Expectations** (11.6k) · **Playwright** (91.8k) | Data-quality gates; UX/accessibility regression tests |
| **Audit / proof of record** | **MLflow** (26.7k) | Model system-of-record Beacon signs over |
| **UX / dashboard** | **Backstage** (33.7k) · **Superset** (73.6k) · **Streamlit** (45.1k) | The Control Room shell; maturity-model + metrics views |
| **Gateway (inference chokepoint)** | **Kong** (43.7k) · **Apache APISIX** (16.8k) | Layer-3 chokepoint: every model call routed + policy-checked |

**Secrets is the deliberate exception:** no Apache-2.0 ≥10k secrets manager exists (Vault went BUSL, sops is
MPL, Infisical is non-OSI). So secrets stays **our own thin `SecretsProvider` interface** with adapters to
whatever the environment has (Keychain, 1Password, cloud KMS, Vault) — exactly the tiered design already in
force. This is a feature, not a gap: the broker contract is ours; the backend is swappable.

---

## 4. Deployment tiers — one contract, six environments

The same gate contract runs everywhere; only the *strength* of each backend changes. This is the existing
Rev 2026.06 principle made concrete across the six environments you named:

| Tier | Secrets | Chokepoint / sandbox | Identity | Observability | Audit store |
|---|---|---|---|---|---|
| **1. Lab (single process)** | Env / Keychain | in-proc allow-list | `?as=` dev | console | NDJSON file |
| **2. Laptop** | Keychain / 1Password | child-process, no ambient net | magic-link | console + Prometheus | NDJSON + local OpenSearch |
| **3. Container** | file/secret mount | seccomp + read-only FS, egress proxy | OIDC (Keycloak) | OTel → Prometheus | OpenSearch |
| **4. Inside the firewall** | Vault / KMS | **gVisor** sandbox, declared egress only | Keycloak (enterprise IdP) | Prometheus + Jaeger | OpenSearch cluster |
| **5. VPS (DigitalOcean)** | 1Password SA / Vault | gVisor + UFW/nftables OS rules | Keycloak | Prometheus + Grafana-OSS\* | OpenSearch |
| **6. Cloud** | cloud KMS | gVisor / Firecracker, VPC egress | Keycloak / cloud IdP | managed OTel | managed OpenSearch |

\* Grafana is AGPL — fine to *self-host* alongside, but keep it out of redistributed bundles; Superset
(Apache) is the redistribution-safe dashboard. The **OS-level rules** (seccomp profiles, read-only root FS,
nftables egress allow-list, gVisor) are the day-one sandbox contract from the architecture decisions —
"tools run sandboxed, no ambient network/filesystem, egress only via a declared proxy."

An installer detects the tier and wires the right adapters automatically (§7).

---

## 5. Jeeves, sub-agents, skills, and OS-level rules

**Jeeves is the master agent**; it never makes an irreversible move — it proposes, a critic refutes, a human
decides. Sub-agents map to the GAC three-tier model:

**Tier 1 — scheduled autonomous** (cron via Airflow/GitHub Actions, outputs are PRs/issues):
- **Policy-Drift Monitor** — re-runs Lantern against baselines; opens an issue on escalation.
- **Regulation-Watch** — scans EU AI Act / NIST / state-law feeds for changes; flags affected policies.
- **Compliance-Attestor** — assembles the weekly signed evidence bundle (Beacon + OpenSearch).
- **Audit-Bundler** — produces the auditor's Appendix-D-style report from the ledger.

**Tier 2 — human-triggered** (one-click / slash-command, inside the one-hour loop):
- **Policy-Improver** — *the wedge.* Takes a written policy, maps it to the regulatory corpus, returns a
  gap analysis + improved policy with citations. (Conversational tutor mode for non-technical authors.)
- **Gate-Author** — turns an improved policy clause into an Umbrella rule + criteria + exit states.
- **Side-by-Side** — runs a prompt governed vs. ungoverned and narrates the difference.
- **Violation-Triage** — classifies a flagged violation by type/severity/role.

**Tier 3 — skills library** (markdown SOPs, invokable by any agent — several already exist in the Library
skill): `framework-map`, `security-privacy-review`, `accessibility-audit`, `status-report`,
`monitor-and-alert`, `beacon-sign-evidence`, plus new `policy-improve`, `gate-author`, `side-by-side-diff`,
`audit-bundle`.

**OS-level rules** are the enforcement floor beneath the agents: the sandbox (seccomp/gVisor), the egress
proxy, read-only filesystems, the secrets broker (no agent ever holds a raw credential), and hard Caps
(spend/rate/blast-radius, fail-closed). Agents operate *inside* this box; the box is not negotiable by an agent.

---

## 6. The policy-as-code journey (the heart of it)

How a written policy becomes governed code that gets to — and stays at — YES, for any policy under AiGovOps:

```
   WRITTEN POLICY (prose)
        │   policy author
        ▼
 [1] Policy-Improver agent  ── maps to regulatory corpus (EU AI Act, GDPR, NIST, sector law)
        │                       → gap analysis + improved policy, every clause cited
        ▼
 IMPROVED POLICY (structured clauses)
        │   developer + Gate-Author agent
        ▼
 [2] For each clause, author:
        • GATE        — an Umbrella rule  ({ path, op, value })
        • CRITERIA    — the deterministic PASS condition           → "Get to YES"
        • EXIT STATES — { YES: pass; STAY: drift/re-check via Lantern; RECOVER: mitigation path }
        ▼
 [3] Compile → run SANDBOXED → Caps check → human decision if irreversible
        ▼
 [4] Beacon signs the verdict → role-scoped oversight ledger → searchable audit (OpenSearch)
        ▼
 [5] Side-by-side shows governed vs. ungoverned; auditor exports a signed evidence bundle / DSAR
```

Each clause carries all three laws explicitly:
- **Get to YES** — the criteria are a deterministic Umbrella predicate; ambiguity is a bug.
- **Stay at YES** — Lantern re-runs the gate on every change; drift past tolerance escalates.
- **Recover to YES** — every FAIL ships a mitigation message and an automated fix path; a gate never just says no.

This is the "policy-as-code governed by AiGovOps Foundation, for all roles" — the policy author improves,
the developer encodes, Jeeves runs, the steward holds the keys, the auditor verifies.

---

## 7. Install & onboarding — dashboard + agents

One command, then the agents take over:

```bash
npx @aigovops/install     # detects tier (1–6), wires adapters, brings up the Control Room
```

The **Onboarding agent** then runs a guided first session (the GAC one-hour loop, day one):
1. **Identity** — connect an IdP (Keycloak) or magic-link; assign the five roles.
2. **Caps** — set spend/rate/blast-radius dials (fail-closed defaults).
3. **Policy** — import a written policy → Policy-Improver returns the improved, cited version.
4. **Gates** — Gate-Author drafts gates/criteria/exit-states; developer reviews and approves.
5. **Prove it** — run the governed/ungoverned side-by-side; produce the first signed evidence bundle.
6. **Cadence** — schedule the Tier-1 agents; set the daily review-and-approve window.

The **dashboard** (Control Room — Backstage/Superset shell over the existing role-scoped oversight) shows:
steward → everything + kill switch + maturity model; developer → gate health + drift; policy author →
policy coverage vs. corpus; member → only their own effects; auditor → evidence + DSAR export.

---

## 8. Sequencing (so this is buildable, not a wish)

Smallest proof first; wire the agent layer from day one (GAC's lesson).

- **M0 — Unify the gate.** One `@aigovops/gate` = Umbrella + Lantern + Caps + Beacon + SecretsProvider
  (Node). Port Omni's broker; modularize Library's Beacon/Caps. *Deletes the 3× duplication.* (Highest leverage.)
- **M1 — Policy-Improver wedge.** The conversational policy → corpus → improved-policy agent + `framework-map`.
  Shippable in weeks; generates the richest signal; lowest overhead. (GAC Alternative 5.)
- **M2 — Gate-Author + side-by-side.** Improved policy → gates/criteria/exit-states; governed/ungoverned demo.
- **M3 — Dashboard + onboarding installer** across tiers 1–3.
- **M4 — Heavyweight adapters** (OPA, Keycloak, Prometheus, OpenSearch, Kong) for tiers 4–6.
- **M5 — Tier-1 autonomous agents** (Regulation-Watch, Compliance-Attestor, Audit-Bundler) on Airflow.

## 9. Risks, stated plainly

- **Copyright.** *Governing Intelligence* is © all rights reserved. We may index the *public frameworks/regulations*
  it catalogs (facts), but must not embed its prose without permission. Get Noah Kenney's sign-off before any
  excerpt ships. The regulations themselves (EU AI Act text, NIST RMF, etc.) are publicly usable.
- **Non-Apache backends.** Several strong tools (Temporal, Grafana, Vault, Langfuse, n8n) are MIT/AGPL/BUSL/non-OSI.
  Keep them as *self-host options*, never inside an Apache-2.0 redistributed bundle. The headline stack stays
  Apache-2.0.
- **Scope honesty.** This is a blueprint, not a built product. M0+M1 are weeks; the full tiered product is months.
  The win is that ~70% of the core already exists — the work is consolidation + the two authoring agents.
- **Strategic visibility.** This doc names competitive positioning and an unreleased product. Decide public-repo
  vs. private before committing it.

---

*Agents do the bureaucracy; humans hold the meaning — and humans hold the keys.*
— AiGovOps Foundation · Bob Rapp & Ken Johnston
