# 0002 — Two-pass classification with append-only Taxonomy

**Date:** 2026-05-12
**Status:** Proposed

## Context

The Overview tab needs to summarize a day's activity in plain English ("1h 2m coding for slowblink"), bucketed by `(Category, Subcategory)`. Two things make this hard:

1. **The vocabulary is unknown up front.** Different users do different things; we can't ship a fixed taxonomy.
2. **The vocabulary needs to stay stable for the user.** If "coding for slowblink" reappears tomorrow under a different name, the user's mental model breaks.

A naive design — one LLM call per segment, each call inventing whatever label feels right — fails both: it's expensive (N calls × full freeform context per call) and inconsistent (the same activity gets different labels across calls).

## Decision

Classification is **two passes**, and the Taxonomy is **append-only across all days**.

- **Pass 1 — Taxonomy generation.** A single LLM call (model: `gpt-5.4-mini`) receives the _current_ Taxonomy and a YAML list of segments. It proposes new `(Category, Subcategory)` entries to _add_ to the Taxonomy. Existing entries are never modified or removed.
- **Pass 2 — Per-segment classification.** Batched LLM calls (model: `gpt-5.4-nano`, ~10 segments/call, ~5 concurrent) classify each segment against the now-updated Taxonomy. Output is constrained: pick a `(Category, Subcategory)` from the Taxonomy or return `(null, null)` for Other.
- **Append-only Taxonomy.** One Taxonomy object grows across all days. Classifications produced under it are immutable. Other-bucketed segments are re-eligible on subsequent refreshes so they can pick up newly-emerged Subcategories.

## Alternatives considered

- **Single-pass classification.** Each LLM call sees a segment and picks/invents a label. Rejected: labels drift between calls, taxonomies grow unboundedly, no way to constrain output to a closed set.
- **Per-day Taxonomy.** Each calendar day owns its own Taxonomy, regenerated as the day fills in. Rejected: cross-day comparison breaks ("coding for slowblink" on Monday and "slowblink dev" on Tuesday are the same activity but live in different buckets), and same-day classifications still shift between refreshes.
- **Snapshotted Taxonomy versions.** Each refresh stamps a new immutable version; classifications stay attached to the version they were made under. Rejected for MVP: more plumbing than the consistency problem warrants. The append-only single-Taxonomy approach gives the same stability guarantee with no version-management code.
- **Embedding-cluster the segments and label each cluster.** Bypasses the Pass 1 LLM call. Rejected: introduces an embedding pipeline + clustering hyperparameters we'd need to tune; the Pass 1 LLM call is cheap because it only sees unclassified segments at steady state.

## Consequences

- **Cost profile is asymmetric.** Pass 1 is one cheap-ish call per refresh. Pass 2 dominates at N segments × `gpt-5.4-nano`, partially mitigated by prompt caching on the Taxonomy block. In MVP there is **no classification cache** (every refresh re-classifies everything) — this lands later when we wire to UI.
- **Taxonomy grows monotonically.** Eventually we'll want a manual "merge / rename / retire" tool for user-driven cleanup. Out of MVP scope.
- **Other-bucket eviction depends on Pass 1 noticing the pattern.** A segment stuck in Other for too long is a signal that Pass 1's input (the segments it sees) isn't surfacing the relevant cluster — we may need to deliberately include sticky-Other segments in Pass 1 input.
- **Pass 1 quality matters more than Pass 2.** A bad Taxonomy makes Pass 2 forced-choice everything into nearby-but-wrong buckets. This is why Pass 1 uses the tier-up model.
- **The 80% exact-match eval guards Pass 2 quality** but only indirectly probes Pass 1 (the eval feeds the seed Taxonomy from the ground-truth labels into Pass 2). A separate Pass 1 sanity check (non-empty, no duplicates, every entry used) is wired in but not gated on.
- **If we ever switch to per-day Taxonomies or single-pass classification,** this ADR is the place to revisit the trade-offs. Schema migration would be required because `classifications.segment_hash` assumes a single global Taxonomy.
