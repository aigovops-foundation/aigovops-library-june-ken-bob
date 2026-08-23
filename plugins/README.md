# `plugins/` — GENERATED. Do not edit by hand.

Written by `scripts/build-plugins.mjs` from `plan/skills/*/SKILL.md` (which declares each
skill's `department:`) and `policies/departments.yaml`. Edit those, then run:

    npm run plugins:build

CI runs `--check` and fails if this tree drifts from its source, the same way
`estate-manifest --check` guards the files derived from `estate.yaml`.

The skills are COPIES, not symlinks or path references, and that is deliberate:
`claude plugin validate` does not follow symlinks and only shape-checks custom `skills:`
paths — a SKILL.md with no frontmatter at all passes that way. Real files in a conventional
`skills/` directory are the only shape the validator actually reads, and a gate that reports
green over files it never opened is worse than no gate.

## Install

    /plugin marketplace add aigovops-foundation/aigovops-library-june-ken-bob
    /plugin install aigovops-governance@aigovops

`aigovops-operator` installs DISABLED. It holds the two `risk: red` skills, and the build
refuses to place a red skill anywhere else.
