<!--
member-drip.md — the member onboarding drip: welcome + one email for each of the first
14 days, then a weekly email ongoing. Every email ends with the same feedback footer that
names Ken and Bob and gives both addresses. Placeholders: {{name}}, {{estate_score}},
{{green_pages}}, {{red_pages}}, {{recent_changes}}, {{pending_proposals}}, {{week_no}}.

STATUS: drafts. Nothing sends until ESTATE_SMTP_URL is armed and auto_accept is on
(plan/processes/membership-onboarding.md). Every send is logged to the brain — metadata only
(template id + recipient hash + timestamp), never the body, never PII.

FOOTER (appended to every email below):
---
**Your feedback goes straight to the founders.** Reply anytime — a human reads it:
Ken Johnston · ken.johnston@aigovops.community
Bob Rapp · bob.rapp@aigovops.community
-->

# Welcome (sent on admission)

**Subject:** 🌿 Welcome to the AiGovOps Library

Hi {{name}}, you're in. Your membership is **read-access** across the whole estate — the
governed core, the framework map, the gates, the shelf. Read freely. One thing that makes this
place different: **you can read anything, but creating or changing anything is a proposal a
human approves.** Nothing you do takes effect until Bob or Ken says yes — that's how we keep
humans holding the keys. A short note lands each day for two weeks; then it's weekly.

---

# Day 1 — the one idea

**Subject:** Get to yes. Stay at yes. Recover to yes.

That's the whole movement in three moves: earn a yes *before* AI ships, hold it while it runs,
and recover it honestly when something breaks. Everything on the shelf hangs off those three.
Today, just read the hub — no clicks required, no sign-up beyond the one you already did.

---

# Day 2 — the Yes-Gate

**Subject:** One gate law: 1, 0, or ?

Every action is a proposal, and the gate answers exactly one way: **1** — yes, earned, runs
once on a single-use receipt; **0** — no, refused and written down; **?** — held for a human,
and it decays to 0 if nobody approves in time. That's the engine under everything here.

---

# Day 3 — read anything

**Subject:** The shelf is open — wander it

You have read access to all of it. Start anywhere: the design book, the blueprint, the plan.
There's nothing to unlock and nothing to buy — the wall is registration, never money or secrecy.

---

# Day 4 — what rules apply

**Subject:** The framework map

Paste what your AI does and the Library tells you which regulations bite and the exact gate
question each one asks — EU AI Act, NYC LL144, GDPR, NIST AI RMF. It's the fastest way to see
governance as a checklist, not a fog.

---

# Day 5 — proposing a change

**Subject:** How you'd change something (and why it pauses)

When you're ready to *do* rather than read, you propose — and the gate holds it for Bob or Ken.
You'll see it sit at **?** until a human decides. That pause isn't bureaucracy for its own sake;
it's the promise that no agent and no member moves an irreversible thing alone.

---

# Day 6 — evidence & receipts

**Subject:** Everything leaves a receipt

Every decision writes a signed, metadata-only receipt to the ledger — no payloads, no personal
data, ever. It means the whole history is verifiable offline. Governance versioned like code,
tested before deployment.

---

# Day 7 — one week in

**Subject:** Your first week — a recap

You've seen the three moves, the gate, the shelf, the framework map, and how a change is
proposed and held for a human. This week the estate is **{{estate_score}}% green** across every
page. Next week we go under the hood: sandboxes, secrets, oversight.

---

# Day 8 — how agents run safely

**Subject:** Sandboxes — no ambient reach

When an agent runs a tool here it's boxed: no ambient network, no filesystem outside its
scratch, egress only through a declared proxy. A tool that reaches for something it didn't
declare fails closed and leaves a receipt. Safety is the default, not a setting.

---

# Day 9 — secrets, brokered

**Subject:** An agent never holds a raw key

Secrets are brokered: the gate hands a tool a short-lived, scoped token — never the master
credential — and it expires and can be revoked. Read how the same interface runs on a laptop
keychain or an in-perimeter vault without a code change.

---

# Day 10 — who sees what

**Subject:** Oversight, role-scoped

One surface, scoped by identity: stewards see every effect and can halt; members see only their
own. The global kill switch is a founder's, and it leaves its own signed receipt. You always see
exactly your own footprint — no more, no less.

---

# Day 11 — the beacon

**Subject:** Signed evidence you can check

The Beacon signs receipts so an auditor can take the whole history and verify it offline with
`openssl` and a published key. It's the difference between "trust us" and "check us."

---

# Day 12 — recover to yes

**Subject:** When it breaks — and it will

Things break; that's not the failure — pretending they won't is. The Library keeps a corpus of
100 verified AI-harm cases, each with the gate that would have caught it. Recovery is designed,
not hoped for.

---

# Day 13 — the community

**Subject:** #F-AI-Friday and the people

Every Friday the community walks a real AI-harm case through the gates together. Read-only gets
you the whole corpus and the practitioner test. This is where governance stops being theory.

---

# Day 14 — where you stand

**Subject:** Two weeks in — and what's next

You now have the full read of the estate and know exactly how a change earns a yes. Read-only is
a real seat: you can follow everything and propose anything. Want to do more than propose? Just
ask — a capability change only ever happens on Bob or Ken's explicit yes. From here, one note a
week.

---

# Weekly (ongoing, after day 14)

**Subject:** AiGovOps — the week in the Library (week {{week_no}})

Hi {{name}}, this week: estate health **{{estate_score}}% green** ({{green_pages}} green,
{{red_pages}} red). Shipped/changed: {{recent_changes}}. Open for a human decision:
{{pending_proposals}} proposal(s) waiting on Bob or Ken. Read anything; propose anything — the
gate holds the rest.

---

**Your feedback goes straight to the founders.** Reply anytime — a human reads it:
Ken Johnston · ken.johnston@aigovops.community
Bob Rapp · bob.rapp@aigovops.community
