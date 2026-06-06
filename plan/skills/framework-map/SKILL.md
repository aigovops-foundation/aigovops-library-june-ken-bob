---
name: framework-map
description: Map a member problem to the AI-governance frameworks that apply and compile the Yes/No gates they will face. Use when someone describes an AI system or use case and asks "what applies to me", "what are my obligations", "is this high-risk", or whenever the Reading Room assesses a hard problem. Trigger on "map my frameworks", "what regulations apply", "assess this", "what gates do I face".
---

# framework-map

**Owning agent:** Lantern

## When to use
A member brings an AI use case (hiring, health, credit, biometrics, chatbot…) and needs to know which frameworks apply and the path to Yes.

## Inputs
- A plain-language description of the AI system / use case
- (optional) sector, region, deployment context

## Procedure (repeatable)
1. Run the problem through the Yes-Gate engine: `node -e "import('./core/src/core/policy.js').then(m=>console.log(JSON.stringify(m.evaluate(PROBLEM),null,2)))"`.
2. Read back the risk tier (Strong / Watch / Gap) and the list of gates, each with its framework, question, and `pathToYes`.
3. Pull matching real fail cases from the proof set so the member sees what went wrong when each gate was skipped.
4. Present the gates in the member’s language; lead with the highest-risk gate.

## Human gate
A human reviews the mapping before it’s treated as authoritative architecture (architecture review).

## Evidence — the receipt
Emit via the `beacon-sign-evidence` skill: a metadata-only **`artifact`** receipt — `kind, actor, action=framework-map, frameworks[], gates[], riskIndex, contentHash`. **No payloads, ever.**

## Done = Yes
The mapped gates feed the workflow being designed; the assessment receipt is signed and logged. Then it enters **Stay at Yes** (monitored); on drift/incident, **Recover to Yes**.

## Notes
Implemented by `core/src/core/policy.js` + `core/src/core/lantern.js`. The built-in library is small in v1; the real Lantern compiles the full framework set into OVERT bundles.
