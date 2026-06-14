# core/policy/aigov.rego
# The Yes-Gate decision rule, as OPA/rego (Ticket 7). This is the SAME rule the
# default JsPolicyEngine encodes (src/core/policy-engine.js) — kept in lock-step
# so "existing gate decisions reproduce under OPA". A change here is reviewed in
# a PR and shipped as a Beacon-signed bundle (scripts: see policy-bundle.js).
#
# Query: data.aigov.gate.decision   (input: { "intent": "<text>" })
package aigov.gate

import rego.v1

# The one rule list. MUST equal IRREVERSIBLE_VERBS in policy-engine.js.
irreversible_verbs := ["delete", "publish", "send", "deploy", "pay", "grant", "merge"]

matched_verbs contains v if {
	some v in irreversible_verbs
	contains(lower(input.intent), v)
}

default irreversible := false

irreversible if count(matched_verbs) > 0

requires_human_gate := irreversible

required_level := "act" if irreversible

required_level := "propose" if not irreversible

reasons contains r if {
	some v in matched_verbs
	r := sprintf("matched irreversible verb: %s", [v])
}

# The decision document the gate consumes (metadata only).
decision := {
	"irreversible": irreversible,
	"requiresHumanGate": requires_human_gate,
	"requiredLevel": required_level,
	"reasons": [r | some r in reasons],
}
