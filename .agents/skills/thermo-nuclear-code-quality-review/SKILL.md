---
name: thermo-nuclear-code-quality-review
description: Run an extremely strict maintainability review for abstraction quality, giant files, and spaghetti-condition growth.
disable-model-invocation: true
---

# Thermo-Nuclear Code Quality Review

Use this skill for an unusually strict review focused on implementation quality, maintainability, abstraction quality, and codebase health.

Start from this baseline:

> Perform a deep code quality audit of the current branch's changes. Rethink how to structure and implement the changes to meaningfully improve code quality without impacting behavior. Work to improve abstractions, modularity, succinctness, and legibility. Be ambitious, thorough, and rigorous.

## Review Standards

- Look for structural simplifications that delete concepts, branches, helpers, modes, or layers.
- Do not let a PR push a file from under 1k lines to over 1k lines without a strong reason.
- Flag ad-hoc conditionals, scattered special cases, feature checks in shared code, and spaghetti growth.
- Prefer direct, boring, maintainable code over magical behavior, thin wrappers, or pass-through abstractions.
- Push for explicit type and boundary contracts when optionality, casts, `unknown`, or `any` obscure the invariant.
- Keep logic in the canonical layer and reuse existing helpers instead of introducing bespoke near-duplicates.
- Treat unnecessary sequential orchestration and non-atomic updates as design smells when a clearer structure is obvious.

## What To Flag

Prioritize high-conviction findings in this order:

1. Structural code-quality regressions.
2. Missed opportunities for dramatic simplification.
3. Spaghetti or branching-complexity increases.
4. Boundary, abstraction, or type-contract problems that make the code harder to reason about.
5. File-size and decomposition concerns.
6. Modularity and abstraction issues.
7. Legibility and maintainability concerns.

Prefer a smaller number of important findings over a long list of cosmetic notes.

## Preferred Remedies

- Delete an unnecessary layer of indirection.
- Reframe the state model so conditionals disappear.
- Move feature-specific logic behind a dedicated abstraction.
- Extract a helper or focused module.
- Split a large file into smaller cohesive files.
- Replace condition chains with a typed model or explicit dispatcher.
- Collapse duplicate branches into a single clearer flow.
- Reuse the canonical helper instead of introducing a near-duplicate.
- Make type boundaries explicit so control flow becomes simpler.

Do not approve merely because behavior appears correct. The approval bar is no clear structural regression, no unjustified file-size explosion, no avoidable spaghetti growth, and no obvious missed simplification.
